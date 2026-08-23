export const patchApplicationErrorCodes = [
  "not_mutation_eligible",
  "legacy_run",
  "patch_hash_mismatch",
  "github_contents_write_required",
  "fork_pull_request",
  "pull_request_closed",
  "source_revision_mismatch",
  "stale_pull_request",
  "superseded_run",
  "patch_check_failed",
  "unexpected_file_change",
  "fresh_verification_failed",
  "push_rejected",
  "installation_unavailable",
  "application_already_exists",
  "worker_timeout",
  "repository_access_denied",
  "terraform_version_unavailable",
] as const;

export type PatchApplicationErrorCode = typeof patchApplicationErrorCodes[number];
export type PatchApplicationStage =
  | "queued"
  | "checking_pr_head"
  | "checking_patch"
  | "applying_patch"
  | "verifying_files"
  | "fresh_verification"
  | "creating_commit"
  | "pushing_branch"
  | "publishing_result"
  | "completed";

export interface PullRequestHeadSnapshot {
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  headSha: string;
  headBranch: string;
  headRepositoryFullName: string | null;
  baseRepositoryFullName: string;
  htmlUrl: string;
}

export interface PatchApplicationActionState {
  ok: boolean;
  applicationId?: string;
  code?: PatchApplicationErrorCode;
  message?: string;
}

export interface FreshVerificationStage {
  status: "passed" | "failed" | "not_run";
  durationMs: number | null;
}

export type FreshVerificationSummary = Record<
  "patch_check" | "patch_apply" | "fmt" | "init" | "validate" | "plan",
  FreshVerificationStage
>;
