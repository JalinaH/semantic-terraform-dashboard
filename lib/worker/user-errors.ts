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
  aws_assume_role_failed: {
    message: "TerraFix could not assume the configured AWS role.",
    action: "Re-verify the AWS connection, trust policy, External ID, and required read permissions.",
  },
  model_unavailable: {
    message: "The configured model gateway or selected model was unavailable.",
    action: "Review the model policy and retry after the OpenRouter service or catalog is available.",
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
};

export function getWorkerErrorPresentation(code: string | null): WorkerErrorPresentation {
  return PRESENTATIONS[code ?? ""] ?? {
    message: "The hosted worker encountered an internal execution error.",
    action: "Retry the workflow. If the error repeats, contact the TerraFix operator with the run ID.",
  };
}
