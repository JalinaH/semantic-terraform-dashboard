"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { requestManualPublication } from "@/lib/publication/manual";

const runIdSchema = z.string().min(1).max(128);

export async function republishPrCommentAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  const parsed = runIdSchema.safeParse(formData.get("runId"));
  if (!parsed.success) return;
  const queued = await requestManualPublication(session.user.id, parsed.data);
  if (!queued) return;
  revalidatePath(`/runs/${parsed.data}`);
  revalidatePath("/runs");
}
