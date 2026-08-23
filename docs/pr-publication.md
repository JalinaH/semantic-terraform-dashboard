# Hosted PR result publication

TerraFix publishes completed pull-request diagnoses as one evidence-backed GitHub App comment. It does not mutate source, create branches, commit, merge, apply, or destroy infrastructure.

## Required GitHub permission

Set **Repository permissions → Pull requests → Read and write**. Keep Actions, Contents, Checks, and Metadata read-only and leave unrelated permissions disabled. Existing installation owners must review and approve the permission upgrade from the installation management page, then use **Sync repositories** in the dashboard.

## Lifecycle

```text
AgentRun completed
  → AgentRunPublication pending
  → worker claims publication atomically
  → eligibility and newest-run checks
  → fresh installation access token
  → list PR issue comments
  → marked App bot comment exists? update : create
  → persist canonical html_url and published timestamp
```

Publication is separate from agent execution. A GitHub API failure leaves `AgentRun.status=COMPLETED` and records `AgentRunPublication.status=FAILED` or schedules a bounded transient retry.

## Eligibility and ordering

A run is published only when it is completed, has a PR number, has an actionable safe diagnosis, belongs to an accessible active installation, and was not an untrusted fork run. Verification may be successful, failed, rejected, or unavailable—the comment describes the actual result rather than hiding unsuccessful verification.

Direct-push runs are `SKIPPED` with `no_pull_request`; the service never creates a PR. Before publishing, the service looks for a newer completed run for the same repository and PR. An older run that finishes later is `SKIPPED` with `superseded_by_newer_run` and cannot overwrite the current diagnosis.

## Idempotency

Every comment contains:

```html
<!-- semantic-terraform-agent -->
<!-- semantic-terraform-agent-run:<run-id> -->
```

The publisher lists PR issue comments and updates a marked comment only when its author is the configured GitHub App bot. User-authored marker-like comments are never modified. This maintains one current bot comment per PR while historical runs remain in the dashboard.

## Comment contents

The renderer includes root cause, affected resources, violated constraint, a concise suggested-change statement, all verification stages, final verification status, repair usage, confidence/evidence scores, a bounded patch, and the canonical dashboard run link. Every comment states that human review is required and never claims that a fix is safe to merge or production safe.

Patches are limited to 12,000 characters and complete comments to 48,000 characters. Untrusted prose is bounded and HTML-escaped. Diff fences are dynamically longer than any backtick run in the patch, preventing repository-controlled content from escaping the block.

## Redaction and privacy

The publication layer performs a final redaction pass for recognizable AWS access keys, GitHub tokens, private-key blocks, bearer tokens, and known secret environment assignments. Redaction warning codes may be stored, but matched secret values are not logged. Comments never contain AWS credentials/account metadata, installation tokens, Gemini keys, full logs, provider schema, Terraform state, raw environment, or unrelated private source.

## Retry and manual republish

HTTP 429, 502, 503, and 504 failures are retried with backoff for at most three total publication attempts. Permission, installation, not-found, invalid-payload, and size errors are not automatically retried. **Republish PR comment** requeues the existing safe result after authentication and repository authorization; it does not invoke the model, Terraform, or the Python agent.

## Test procedure

1. Change the GitHub App permission to **Pull requests: Read and write**.
2. Open each existing installation in GitHub and approve the permission request.
3. Return to the dashboard and select **Sync repositories**.
4. Start the dashboard and continuous worker.
5. Trigger a same-repository Terraform PR failure that completes a hosted run.
6. Confirm one marked comment appears and the run page links to its canonical GitHub URL.
7. Push another failing commit; confirm the same comment is updated without duplication.
8. Delete the comment manually and select **Republish PR comment**; confirm it is recreated without a new diagnosis.
9. Confirm no commits, branches, merges, Terraform apply, or Terraform destroy occurred.
