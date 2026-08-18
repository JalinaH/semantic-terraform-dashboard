export type GitHubIntegrationErrorCode =
  | "configuration_missing"
  | "authentication_required"
  | "installation_cancelled"
  | "invalid_callback"
  | "installation_inaccessible"
  | "user_token_unavailable"
  | "user_token_expired"
  | "rate_limited"
  | "github_unavailable"
  | "sync_failed";

const userMessages: Record<GitHubIntegrationErrorCode, string> = {
  configuration_missing: "GitHub integration is not configured for this environment.",
  authentication_required: "Sign in with GitHub before connecting an installation.",
  installation_cancelled: "GitHub App installation was cancelled. No repositories were connected.",
  invalid_callback: "The GitHub installation response could not be verified. Please start again.",
  installation_inaccessible: "This GitHub installation is not accessible to the signed-in account.",
  user_token_unavailable: "GitHub authorization is unavailable. Sign out and sign in again.",
  user_token_expired: "Your GitHub authorization expired. Sign out and sign in again.",
  rate_limited: "GitHub API rate limits are temporarily preventing synchronization. Try again later.",
  github_unavailable: "GitHub could not be reached. Try again shortly.",
  sync_failed: "Repositories could not be synchronized. Existing repository access was left unchanged.",
};

export class GitHubIntegrationError extends Error {
  constructor(
    public readonly code: GitHubIntegrationErrorCode,
    options?: { cause?: unknown },
  ) {
    super(userMessages[code], options);
    this.name = "GitHubIntegrationError";
  }
}

export function getGitHubErrorMessage(code: string | null | undefined) {
  if (code && code in userMessages) {
    return userMessages[code as GitHubIntegrationErrorCode];
  }
  return "The GitHub operation could not be completed. Please try again.";
}

export function mapGitHubApiError(error: unknown, fallback: GitHubIntegrationErrorCode) {
  const status = getNumericProperty(error, "status");
  if (status === 403 || status === 429) {
    return new GitHubIntegrationError("rate_limited", { cause: error });
  }
  if (status === 401) {
    return new GitHubIntegrationError("user_token_expired", { cause: error });
  }
  if (status === 404) {
    return new GitHubIntegrationError("installation_inaccessible", { cause: error });
  }
  if (status && status >= 500) {
    return new GitHubIntegrationError("github_unavailable", { cause: error });
  }
  return new GitHubIntegrationError(fallback, { cause: error });
}

function getNumericProperty(value: unknown, key: string) {
  if (!value || typeof value !== "object" || !(key in value)) return undefined;
  const property = Reflect.get(value, key);
  return typeof property === "number" ? property : undefined;
}
