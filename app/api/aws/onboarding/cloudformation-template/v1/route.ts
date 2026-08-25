import { generateGuidedOnboardingTemplate } from "@/lib/aws/cloudformation";

export const runtime = "nodejs";

export async function GET() {
  return new Response(generateGuidedOnboardingTemplate(), {
    headers: {
      "Content-Type": "application/x-yaml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": "inline; filename=terrafix-aws-onboarding-v1.yaml",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
