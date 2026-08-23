export type WorkerErrorCode =
  | "github_log_unavailable"
  | "github_checkout_failed"
  | "source_revision_mismatch"
  | "repository_access_removed"
  | "aws_assume_role_failed"
  | "terraform_not_found"
  | "terraform_version_unavailable"
  | "agent_execution_failed"
  | "agent_input_invalid"
  | "agent_result_invalid"
  | "model_authentication_failed"
  | "model_capability_unsupported"
  | "model_network_error"
  | "model_not_found"
  | "model_policy_invalid"
  | "model_quota_exceeded"
  | "model_rate_limited"
  | "model_response_invalid"
  | "model_timeout"
  | "model_unavailable"
  | "execution_timeout"
  | "worker_stale"
  | "worker_internal_error";

export const WORKER_ERROR_MESSAGES: Record<WorkerErrorCode, string> = {
  github_log_unavailable: "The failed GitHub Actions log could not be collected or did not contain bounded Terraform failure evidence.",
  github_checkout_failed: "The exact failing repository revision could not be checked out.",
  source_revision_mismatch: "The checked-out repository HEAD did not match the pull request revision supplied to the agent.",
  repository_access_removed: "GitHub or AWS access was removed before the queued run started.",
  aws_assume_role_failed: "The repository AWS role could not be assumed with its configured External ID.",
  terraform_not_found: "The worker does not have the configured Terraform runtime available.",
  terraform_version_unavailable: "The worker image does not provide the Terraform version saved for this repository.",
  agent_execution_failed: "The TerraFix agent process did not complete successfully.",
  agent_input_invalid: "The TerraFix agent rejected the bounded repository, log, diff, or configuration input.",
  agent_result_invalid: "The agent returned a result that did not match the safe hosted result contract.",
  model_authentication_failed: "The hosted model gateway rejected the worker credential.",
  model_capability_unsupported: "The selected model does not support the structured response required by TerraFix.",
  model_network_error: "The worker could not reach the hosted model gateway after bounded retries.",
  model_not_found: "The selected hosted model no longer exists in the model gateway catalog.",
  model_policy_invalid: "No model matched the saved routing policy and synchronized model catalog.",
  model_quota_exceeded: "The hosted model gateway quota or credit limit was exceeded.",
  model_rate_limited: "The hosted model gateway rate limit was reached.",
  model_response_invalid: "The hosted model gateway rejected the request or returned an invalid structured response.",
  model_timeout: "The hosted model request timed out after bounded retries.",
  model_unavailable: "The hosted model credential or model service is unavailable.",
  execution_timeout: "The hosted diagnosis exceeded the configured execution timeout.",
  worker_stale: "The worker stopped reporting progress before the hosted diagnosis completed.",
  worker_internal_error: "The hosted worker encountered an internal error.",
};

export class WorkerExecutionError extends Error {
  constructor(readonly code: WorkerErrorCode, options?: { cause?: unknown }) {
    super(WORKER_ERROR_MESSAGES[code], options);
    this.name = "WorkerExecutionError";
  }
}
