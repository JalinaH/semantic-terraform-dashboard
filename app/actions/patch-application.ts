"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { requestPatchApplication } from "@/lib/patch-application/service";
import type { PatchApplicationActionState } from "@/lib/patch-application/types";

const requestSchema = z.object({
  runId: z.string().min(1).max(100),
  patchSha256: z.string().regex(/^[0-9a-f]{64}$/),
  expectedHeadSha: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/),
  conditionalApproval: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export async function applyVerifiedPatchAction(
  _previous: PatchApplicationActionState,
  formData: FormData,
): Promise<PatchApplicationActionState> {
  const user = await requireAuthenticatedUser();
  const parsed = requestSchema.safeParse({
    runId: formData.get("runId"),
    patchSha256: formData.get("patchSha256"),
    expectedHeadSha: formData.get("expectedHeadSha"),
    conditionalApproval: formData.get("conditionalApproval") ?? "false",
  });
  if (!parsed.success) return { ok: false, code: "not_mutation_eligible", message: "The application request was invalid." };
  const result = await requestPatchApplication({
    userId: user.id,
    userDisplay: user.githubLogin ?? user.name ?? null,
    agentRunId: parsed.data.runId,
    submittedPatchSha256: parsed.data.patchSha256,
    submittedExpectedHeadSha: parsed.data.expectedHeadSha,
    conditionalApproval: parsed.data.conditionalApproval,
  });
  revalidatePath(`/runs/${parsed.data.runId}`);
  return result;
}
