import { z } from "zod";
import { AwsOnboardingError, completeAwsOnboardingSession } from "@/lib/aws/onboarding-session";
import { awsStsRoleVerifier } from "@/lib/aws/sts";
import { prismaAwsOnboardingSessionStore } from "@/lib/data/aws-onboarding-sessions";
import { iamRoleArnSchema, repositoryIdSchema } from "@/lib/validation/aws-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CALLBACK_BODY_BYTES = 8_192;
const callbackSchema = z.object({
  sessionId: repositoryIdSchema,
  roleArn: iamRoleArnSchema,
  awsAccountId: z.string().regex(/^\d{12}$/),
  callbackToken: z.string().min(40).max(128).regex(/^[A-Za-z0-9_-]+$/),
}).strict();

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_CALLBACK_BODY_BYTES) return safeJson({ error: "invalid_request" }, 413);

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return safeJson({ error: "invalid_request" }, 400);
  }
  if (Buffer.byteLength(rawBody, "utf8") > MAX_CALLBACK_BODY_BYTES) return safeJson({ error: "invalid_request" }, 413);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return safeJson({ error: "invalid_request" }, 400);
  }
  const parsed = callbackSchema.safeParse(parsedJson);
  if (!parsed.success) return safeJson({ error: "invalid_request" }, 400);

  try {
    const completed = await completeAwsOnboardingSession(
      prismaAwsOnboardingSessionStore,
      awsStsRoleVerifier,
      parsed.data,
    );
    return safeJson({ accepted: true, status: completed.outcome }, 200);
  } catch (error) {
    if (error instanceof AwsOnboardingError) {
      const status = error.code === "session_expired"
        ? 410
        : error.code === "session_not_found"
          ? 404
          : error.code === "callback_consumed"
            ? 409
            : 401;
      return safeJson({ error: "callback_rejected" }, status);
    }
    console.error("AWS onboarding callback failed", { sessionId: parsed.data.sessionId, code: "callback_internal_error" });
    return safeJson({ error: "callback_unavailable" }, 503);
  }
}

function safeJson(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
