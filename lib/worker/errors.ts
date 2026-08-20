export type WorkerErrorCode =
  | "github_log_unavailable"
  | "github_checkout_failed"
  | "repository_access_removed"
  | "aws_assume_role_failed"
  | "terraform_not_found"
  | "terraform_version_unavailable"
  | "agent_execution_failed"
  | "agent_result_invalid"
  | "model_unavailable"
  | "execution_timeout"
  | "worker_internal_error";

export const WORKER_ERROR_MESSAGES: Record<WorkerErrorCode, string> = {
  github_log_unavailable: "The failed GitHub Actions log could not be collected or did not contain bounded Terraform failure evidence.",
  github_checkout_failed: "The exact failing repository revision could not be checked out.",
  repository_access_removed: "GitHub or AWS access was removed before the queued run started.",
  aws_assume_role_failed: "The repository AWS role could not be assumed with its configured External ID.",
  terraform_not_found: "The worker does not have the configured Terraform runtime available.",
  terraform_version_unavailable: "The worker image does not provide the Terraform version saved for this repository.",
  agent_execution_failed: "The Semantic Terraform Agent process did not complete successfully.",
  agent_result_invalid: "The agent returned a result that did not match the safe hosted result contract.",
  model_unavailable: "The hosted model credential or model service is unavailable.",
  execution_timeout: "The hosted diagnosis exceeded the configured execution timeout.",
  worker_internal_error: "The hosted worker encountered an internal error.",
};

export class WorkerExecutionError extends Error {
  constructor(readonly code: WorkerErrorCode, options?: { cause?: unknown }) {
    super(WORKER_ERROR_MESSAGES[code], options);
    this.name = "WorkerExecutionError";
  }
}
