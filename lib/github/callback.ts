import { GitHubIntegrationError } from "@/lib/github/errors";

const VALID_SETUP_ACTIONS = new Set(["install", "update"]);

export function parseInstallationCallbackParameters(searchParams: URLSearchParams) {
  const installationId = searchParams.get("installation_id");
  const setupAction = searchParams.get("setup_action");

  if (!installationId) {
    throw new GitHubIntegrationError("installation_cancelled");
  }
  if (!setupAction || !VALID_SETUP_ACTIONS.has(setupAction)) {
    throw new GitHubIntegrationError("invalid_callback");
  }

  return { installationId, setupAction };
}
