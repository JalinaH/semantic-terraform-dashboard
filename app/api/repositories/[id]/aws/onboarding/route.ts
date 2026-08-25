import { auth } from "@/auth";
import {
  AwsOnboardingError,
  createAwsOnboardingSession,
  getLatestAwsOnboardingSessionForUser,
} from "@/lib/aws/onboarding-session";
import { DEFAULT_AWS_REGION } from "@/lib/aws/regions";
import { getApplicationOrigin, getAwsGuidedOnboardingConfiguration, MissingAwsConfigurationError } from "@/lib/config";
import { prismaAwsOnboardingSessionStore } from "@/lib/data/aws-onboarding-sessions";
import { awsRegionInputSchema, repositoryIdSchema } from "@/lib/validation/aws-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await authorizedIdentity(params);
  if (!identity.ok) return identity.response;
  try {
    const session = await getLatestAwsOnboardingSessionForUser(
      prismaAwsOnboardingSessionStore,
      identity.userId,
      identity.repositoryId,
    );
    return noStoreJson({ session });
  } catch {
    return noStoreJson({ error: "session_unavailable" }, 500);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await authorizedIdentity(params);
  if (!identity.ok) return identity.response;

  const configuredOrigin = getApplicationOrigin();
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && configuredOrigin && requestOrigin !== configuredOrigin) {
    return noStoreJson({ error: "invalid_origin" }, 403);
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return noStoreJson({ error: "invalid_request" }, 400);
  }
  const parsed = awsRegionInputSchema.safeParse({
    region: typeof body === "object" && body !== null && "region" in body
      ? Reflect.get(body, "region")
      : DEFAULT_AWS_REGION,
  });
  if (!parsed.success) return noStoreJson({ error: "invalid_region" }, 400);

  try {
    const configuration = getAwsGuidedOnboardingConfiguration();
    const created = await createAwsOnboardingSession(
      prismaAwsOnboardingSessionStore,
      identity.userId,
      identity.repositoryId,
      parsed.data.region,
      {
        trustedPrincipalArn: configuration.principalArn,
        templateUrl: configuration.templateUrl,
        callbackEndpoint: configuration.callbackEndpoint,
      },
    );
    return noStoreJson(created, 201);
  } catch (error) {
    if (error instanceof AwsOnboardingError) {
      const status = error.code === "repository_not_found" ? 404 : 409;
      return noStoreJson({ error: error.code }, status);
    }
    if (error instanceof MissingAwsConfigurationError) {
      return noStoreJson({ error: "guided_onboarding_not_configured" }, 503);
    }
    console.error("AWS onboarding session creation failed", {
      repositoryId: identity.repositoryId,
      userId: identity.userId,
      code: "session_creation_failed",
    });
    return noStoreJson({ error: "session_creation_failed" }, 500);
  }
}

async function authorizedIdentity(params: Promise<{ id: string }>): Promise<
  | { ok: true; userId: string; repositoryId: string }
  | { ok: false; response: Response }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, response: noStoreJson({ error: "authentication_required" }, 401) };
  const parsedId = repositoryIdSchema.safeParse((await params).id);
  if (!parsedId.success) return { ok: false, response: noStoreJson({ error: "not_found" }, 404) };
  return { ok: true, userId: session.user.id, repositoryId: parsedId.data };
}

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
