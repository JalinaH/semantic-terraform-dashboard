# TerraFix security boundaries

TerraFix diagnoses failed Terraform CI and publishes advisory evidence. It does
not establish developer intent and does not modify customer source or
infrastructure.

## GitHub

- Users authenticate through the GitHub App OAuth client. No personal access
  token is requested.
- Installation access is verified against the signed-in GitHub user before it
  is linked to the dashboard account.
- App JWTs mint short-lived installation tokens on the server/worker. Tokens
  are not persisted or returned to the browser.
- Repository permissions are Metadata read, Actions read, Contents read, and
  Pull requests write. No administration, workflows, deployments, secrets,
  members, or Contents write permission is requested.
- Only `workflow_run` is subscribed. Only completed failures can pass dispatch
  gates; successful or unrelated workflows are ignored.
- Every webhook is bounded to 2 MiB, verified over its raw bytes with
  HMAC-SHA256, and deduplicated by `X-GitHub-Delivery` before processing.
- Same-repository PRs may run. Fork PRs and missing PR metadata for PR-triggered
  workflows are skipped before AWS role assumption or model invocation.
- A short-lived token is provided to Git through temporary configuration, not
  embedded in a clone URL. The remote is removed before agent execution.

## AWS

- Each repository receives a cryptographically random External ID and a
  repository-specific customer role.
- The role trusts only the configured control-plane principal and requires the
  exact External ID. TerraFix accepts role ARNs, not IAM users or access keys.
- AWS SDK workload identity/default-provider-chain credentials are the control
  plane root. EC2 instance profiles or OIDC federation are preferred over
  static keys.
- STS credentials are short-lived, kept in worker memory, allowlisted only into
  the child process, and never persisted or rendered.
- `GetCallerIdentity` confirms the expected AWS account and assumed role before
  the engine runs.

## Model gateway and telemetry

- TerraFix owns `OPENROUTER_API_KEY`; consumer repositories do not provide
  model credentials. It remains server/worker-only and is never prefixed
  `NEXT_PUBLIC_`.
- Model access and tiers are server-enforced policy, not billing claims.
- Persisted usage contains bounded model/token/cost/latency metadata. Missing
  telemetry remains null; explicit provider zero remains zero.
- Raw prompts, full source, full provider schemas, raw failure logs, Terraform
  state, environment dumps, and credentials are excluded from telemetry.
- Safe result ingestion and PR rendering apply schema bounds and secret
  redaction. Production logs contain identifiers, stages, codes, outcomes, and
  durations, never payloads or secret values.

## Terraform and source immutability

- Every checkout is disposable and removed in `finally` cleanup.
- The worker invokes the engine without a shell and verifies only with bounded
  patch checks, `terraform fmt`, `init`, `validate`, and `plan` behavior.
- There is no product execution path for `terraform apply`, `destroy`,
  `import`, or `taint`.
- TerraFix has no Contents write permission and contains no commit/push/merge
  operation. It can create or update one marked PR issue comment only.
- Older completed runs cannot overwrite a newer PR diagnosis. Publication
  ownership is checked before mutation, and marked comments are updated only
  when authored by this App bot.

## Authorization and private caching

- Dashboard pages require an authenticated database session.
- Every repository lookup traverses the signed-in user's linked GitHub
  installation. Server actions repeat authentication and repository
  authorization; repository IDs from forms or query strings are not trusted.
- Usage queries scope all rows through accessible installations before applying
  repository/model filters.
- Dashboard routes are dynamic. Auth, webhook, health, and authenticated
  download responses use private/no-store behavior; user-private data is never
  intentionally public-cached.

## Human review

A passing Terraform verification means the candidate satisfied the configured
bounded checks in an isolated workspace. It does not prove business intent,
production safety, or approval to merge. Every UI/PR result remains advisory:

> Terraform verification passed. Human review is still required because
> verification does not establish developer intent.
