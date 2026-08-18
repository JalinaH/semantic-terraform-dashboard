"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getIntegrationConfigurationStatus } from "@/lib/config";
import { GitHubIntegrationError } from "@/lib/github/errors";
import { getInstallationForUser } from "@/lib/github/installations";
import { createInstallationState, INSTALLATION_STATE_COOKIE } from "@/lib/github/state";
import { syncPersistedInstallation } from "@/lib/github/sync";
import { getGitHubAppInstallationUrl } from "@/lib/github/urls";
import { validateInternalRedirect } from "@/lib/security/redirect";

export async function beginGitHubInstallationAction(formData?: FormData) {
  const user = await requireAuthenticatedUser();
  const configuration = getIntegrationConfigurationStatus();
  if (!configuration.githubApp) redirect("/repositories?error=configuration_missing");

  const returnTo = validateInternalRedirect(
    formData?.get("returnTo")?.toString(),
    "/repositories",
  );
  const state = await createInstallationState({ userId: user.id, returnTo });
  const cookieStore = await cookies();
  cookieStore.set(INSTALLATION_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
    path: "/github/callback",
  });
  redirect(getGitHubAppInstallationUrl(state));
}

export async function syncRepositoriesAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const installationDatabaseId = formData.get("installationDatabaseId")?.toString();
  if (!installationDatabaseId) redirect("/repositories?error=invalid_callback");

  let result: { synchronizedCount: number; removedCount: number } | null = null;
  let errorCode: string | null = null;
  try {
    const installation = await getInstallationForUser(user.id, installationDatabaseId);
    if (!installation) throw new GitHubIntegrationError("installation_inaccessible");
    result = await syncPersistedInstallation(installation);
    revalidatePath("/dashboard");
    revalidatePath("/repositories");
    revalidatePath("/settings");
  } catch (error) {
    errorCode = error instanceof GitHubIntegrationError ? error.code : "sync_failed";
  }

  if (errorCode) redirect(`/repositories?error=${encodeURIComponent(errorCode)}`);
  redirect(
    `/repositories?synced=${result?.synchronizedCount ?? 0}&removed=${result?.removedCount ?? 0}`,
  );
}
