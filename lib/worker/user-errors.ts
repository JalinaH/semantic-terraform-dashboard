export interface WorkerErrorPresentation {
  message: string;
  action: string;
}

const PRESENTATIONS: Record<string, WorkerErrorPresentation> = {
  repository_access_removed: {
    message: "TerraFix can no longer access this repository or its configured AWS role.",
    action: "Review the GitHub App installation and re-verify the repository AWS connection.",
  },
  github_log_unavailable: {
    message: "Terraform CI logs were unavailable or did not contain bounded failure evidence.",
    action: "Confirm the workflow uses Terraform validate or plan and that Actions: Read remains granted.",
  },
  github_checkout_failed: {
    message: "TerraFix could not check out the exact failing revision.",
    action: "Review repository access and rerun the GitHub Actions workflow.",
  },
  source_revision_mismatch: {
    message: "The checked-out source no longer matched the pull request revision before inference.",
    action: "Run Terraform CI again on the current pull request head. TerraFix will not diagnose stale source.",
  },
  aws_assume_role_failed: {
    message: "TerraFix could not assume the configured AWS role.",
    action: "Re-verify the AWS connection, trust policy, External ID, and required read permissions.",
  },
  model_unavailable: {
    message: "The configured model gateway or selected model was unavailable.",
    action: "Review the model policy and retry after the OpenRouter service or catalog is available.",
  },
  model_authentication_failed: {
    message: "OpenRouter rejected the worker’s hosted API credential.",
    action: "Replace OPENROUTER_API_KEY in the worker task definition, deploy a new task revision, and retry.",
  },
  model_not_found: {
    message: "The selected OpenRouter model is no longer present in the model catalog.",
    action: "Synchronize the model catalog, select an available model, and retry.",
  },
  model_policy_invalid: {
    message: "No synchronized model satisfies this repository’s saved routing policy.",
    action: "Synchronize the OpenRouter catalog and save a compatible model policy for the repository.",
  },
  model_capability_unsupported: {
    message: "The selected model cannot return the structured diagnosis contract required by TerraFix.",
    action: "Select a model marked as compatible with structured output or JSON fallback.",
  },
  model_quota_exceeded: {
    message: "The hosted OpenRouter account has exhausted its quota or credit limit.",
    action: "Review OpenRouter limits or credits, then retry the workflow.",
  },
  model_rate_limited: {
    message: "OpenRouter rate-limited this diagnosis request.",
    action: "Wait briefly and retry, or select another available model.",
  },
  model_response_invalid: {
    message: "OpenRouter rejected the request or returned an invalid structured response.",
    action: "Select another compatible model. If it repeats, inspect the worker’s safe error code.",
  },
  model_timeout: {
    message: "The OpenRouter request timed out after bounded retries.",
    action: "Retry once or select another available model.",
  },
  model_network_error: {
    message: "The worker could not reach OpenRouter after bounded retries.",
    action: "Check the ECS task’s outbound network access and retry.",
  },
  terraform_not_found: {
    message: "The worker could not find its Terraform runtime.",
    action: "A TerraFix operator must repair the worker image before retrying.",
  },
  terraform_version_unavailable: {
    message: "The worker does not provide the Terraform version configured for this repository.",
    action: "Use the worker-supported Terraform version or deploy a compatible worker image.",
  },
  execution_timeout: {
    message: "The diagnosis exceeded TerraFix’s bounded execution deadline.",
    action: "Retry once. If it repeats, review repository size, Terraform initialization, and worker capacity.",
  },
  worker_stale: {
    message: "The worker stopped reporting progress and the run was recovered as failed.",
    action: "Confirm worker health, then rerun the failed Terraform workflow.",
  },
  agent_result_invalid: {
    message: "The engine returned a result that could not be safely ingested.",
    action: "Confirm the deployed engine matches the version configured in its immutable worker image.",
  },
  agent_execution_failed: {
    message: "The Terraform diagnosis engine did not complete successfully.",
    action: "Retry the workflow. If it repeats, review the worker’s safe structured logs.",
  },
  agent_input_invalid: {
    message: "The engine rejected one of the bounded repository, Terraform, log, diff, or model inputs.",
    action: "Check the repository Terraform directory and model policy, then retry. The worker log now records this safe classification.",
  },
};

export function getWorkerErrorPresentation(code: string | null): WorkerErrorPresentation {
  return PRESENTATIONS[code ?? ""] ?? {
    message: "The hosted worker encountered an internal execution error.",
    action: "Retry the workflow. If the error repeats, contact the TerraFix operator with the run ID.",
  };
}
