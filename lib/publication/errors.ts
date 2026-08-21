export type PublicationErrorCode =
  | "github_permission_missing"
  | "installation_removed"
  | "pull_request_not_found"
  | "github_rate_limited"
  | "github_api_error"
  | "comment_too_large"
  | "invalid_run_payload";

const MESSAGES: Record<PublicationErrorCode, string> = {
  github_permission_missing: "Approve Pull requests: Write for this GitHub App installation, then republish.",
  installation_removed: "The GitHub App installation or repository access is no longer available.",
  pull_request_not_found: "The target pull request could not be found or is no longer accessible.",
  github_rate_limited: "GitHub temporarily rate-limited comment publication. The service will retry automatically.",
  github_api_error: "GitHub could not publish the comment. Try republishing after the service recovers.",
  comment_too_large: "The bounded diagnosis still exceeded the safe GitHub comment limit.",
  invalid_run_payload: "This run does not contain a safe actionable diagnosis to publish.",
};

export class PublicationError extends Error {
  constructor(
    readonly code: PublicationErrorCode,
    readonly transient = false,
    options?: { cause?: unknown },
  ) {
    super(MESSAGES[code], options);
    this.name = "PublicationError";
  }
}

export function classifyGitHubPublicationError(error: unknown) {
  if (error instanceof PublicationError) return error;
  const integrationCode = stringProperty(error, "code");
  if (integrationCode === "installation_inaccessible") return new PublicationError("installation_removed", false, { cause: error });
  if (integrationCode === "rate_limited") return new PublicationError("github_rate_limited", true, { cause: error });
  if (integrationCode === "github_unavailable") return new PublicationError("github_api_error", true, { cause: error });
  const status = numericProperty(error, "status");
  if (status === 403) return new PublicationError("github_permission_missing", false, { cause: error });
  if (status === 404) return new PublicationError("pull_request_not_found", false, { cause: error });
  if (status === 429) return new PublicationError("github_rate_limited", true, { cause: error });
  if (status === 502 || status === 503 || status === 504) return new PublicationError("github_api_error", true, { cause: error });
  return new PublicationError("github_api_error", false, { cause: error });
}

function stringProperty(value: unknown, key: string) {
  if (!value || typeof value !== "object" || !(key in value)) return undefined;
  const property = Reflect.get(value, key);
  return typeof property === "string" ? property : undefined;
}

function numericProperty(value: unknown, key: string) {
  if (!value || typeof value !== "object" || !(key in value)) return undefined;
  const property = Reflect.get(value, key);
  return typeof property === "number" ? property : undefined;
}
