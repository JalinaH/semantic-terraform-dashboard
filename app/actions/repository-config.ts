"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prismaRepositoryConfigurationStore } from "@/lib/data/repository-config";
import {
  RepositoryConfigurationError,
  saveRepositoryConfiguration,
} from "@/lib/repository-config/service";
import type { RepositoryConfigActionState, RepositoryConfigInput } from "@/lib/repository-config/types";
import { parseRepositoryConfigFormData } from "@/lib/validation/repository-config";

const INITIAL_ERROR: RepositoryConfigActionState = {
  status: "error",
  message: "The configuration could not be saved. Please try again.",
};

export async function saveRepositoryConfigurationAction(
  repositoryId: string,
  _previousState: RepositoryConfigActionState,
  formData: FormData,
): Promise<RepositoryConfigActionState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: "error", message: "Your session has expired. Sign in again before saving." };
  }
  if (!repositoryId || repositoryId.length > 64) return INITIAL_ERROR;

  const parsed = parseRepositoryConfigFormData(formData);
  if (!parsed.success) {
    const fieldErrors: RepositoryConfigActionState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key !== "string") continue;
      const field = key as keyof RepositoryConfigInput;
      fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
    }
    return { status: "error", message: "Review the highlighted fields and try again.", fieldErrors };
  }

  try {
    const saved = await saveRepositoryConfiguration(
      prismaRepositoryConfigurationStore,
      session.user.id,
      repositoryId,
      parsed.data,
    );
    revalidatePath("/dashboard");
    revalidatePath("/repositories");
    revalidatePath(`/repositories/${repositoryId}`);
    revalidatePath("/settings");
    return {
      status: "success",
      message: "Configuration saved.",
      savedAt: saved.updatedAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof RepositoryConfigurationError) {
      if (error.code === "repository_access_removed") {
        return { status: "error", message: "GitHub access was removed. Restore access before editing this repository." };
      }
      return { status: "error", message: "This repository is not available to your account." };
    }
    console.error("Repository configuration save failed", { repositoryId, userId: session.user.id });
    return INITIAL_ERROR;
  }
}
