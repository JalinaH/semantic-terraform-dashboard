import { auth } from "@/auth";
import { AwsOnboardingError, getAwsOnboardingSessionForUser } from "@/lib/aws/onboarding-session";
import { prismaAwsOnboardingSessionStore } from "@/lib/data/aws-onboarding-sessions";
import { repositoryIdSchema } from "@/lib/validation/aws-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return noStoreJson({ error: "authentication_required" }, 401);
  const values = await params;
  const repositoryId = repositoryIdSchema.safeParse(values.id);
  const sessionId = repositoryIdSchema.safeParse(values.sessionId);
  if (!repositoryId.success || !sessionId.success) return noStoreJson({ error: "not_found" }, 404);
  try {
    const onboarding = await getAwsOnboardingSessionForUser(
      prismaAwsOnboardingSessionStore,
      session.user.id,
      repositoryId.data,
      sessionId.data,
    );
    return noStoreJson({ session: onboarding });
  } catch (error) {
    if (error instanceof AwsOnboardingError) return noStoreJson({ error: "not_found" }, 404);
    return noStoreJson({ error: "session_unavailable" }, 500);
  }
}

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
