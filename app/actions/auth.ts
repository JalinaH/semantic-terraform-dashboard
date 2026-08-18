"use server";

import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { getIntegrationConfigurationStatus } from "@/lib/config";
import { validateInternalRedirect } from "@/lib/security/redirect";

export async function signInWithGitHubAction(formData?: FormData) {
  const configuration = getIntegrationConfigurationStatus();
  if (!configuration.authentication) redirect("/?auth=configuration");
  const returnTo = validateInternalRedirect(
    formData?.get("returnTo")?.toString(),
    "/dashboard",
  );
  await signIn("github", { redirectTo: returnTo });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
