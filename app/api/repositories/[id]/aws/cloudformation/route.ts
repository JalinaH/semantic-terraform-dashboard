import { auth } from "@/auth";
import { AwsConnectionAccessError } from "@/lib/aws/connection";
import { generateAuthorizedCloudFormationTemplate } from "@/lib/aws/onboarding";
import { getAwsControlPlaneConfiguration, MissingAwsConfigurationError } from "@/lib/config";
import { prismaAwsConnectionStore } from "@/lib/data/aws-connections";
import { repositoryIdSchema } from "@/lib/validation/aws-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Authentication required", { status: 401 });
  const parsedId = repositoryIdSchema.safeParse((await params).id);
  if (!parsedId.success) return new Response("Not found", { status: 404 });

  try {
    const { principalArn } = getAwsControlPlaneConfiguration();
    const generated = await generateAuthorizedCloudFormationTemplate(prismaAwsConnectionStore, session.user.id, parsedId.data, principalArn);
    return new Response(generated.template, {
      headers: {
        "Content-Type": "application/x-yaml; charset=utf-8",
        "Content-Disposition": `attachment; filename="terrafix-${safeFilename(generated.repositoryFullName)}.yaml"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AwsConnectionAccessError) return new Response("Not found", { status: 404 });
    if (error instanceof MissingAwsConfigurationError) return new Response("AWS onboarding is not configured", { status: 503 });
    console.error("CloudFormation template generation failed", { repositoryId: parsedId.data, userId: session.user.id });
    return new Response("Template unavailable", { status: 500 });
  }
}

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 80) || "repository";
}
