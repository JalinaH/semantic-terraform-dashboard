# TerraFix production-like E2E validation

## Current execution status

**Not executed from this workspace on 2026-08-23.** The local dashboard
configuration does not provide a hosted OpenRouter credential, and no dedicated
consumer repository/PR plus reachable production deployment was established in
this task. No delivery, run, model, token, cost, latency, verification, memory,
or publication result below is fabricated.

Static/unit/integration/build/container checks are reported in the release
handoff. Complete this document only from a real authenticated hosted path; do
not invoke the Python CLI manually as a substitute.

## Preconditions

- [ ] Deployed Vercel control plane and public HTTPS webhook URL
- [ ] Production migrations applied
- [ ] Active external worker reporting Agent v1.1.4
- [ ] Dedicated consumer repository from [demo-repository.md](demo-repository.md)
- [ ] GitHub App installed with required permissions and `workflow_run` event
- [ ] Repository AWS role created and STS verification passed
- [ ] OpenRouter catalog synchronized with at least one eligible FREE model
- [ ] Repository policy Auto Optimize / maximum FREE / enabled
- [ ] Same-repository PR containing the DynamoDB hash-key mismatch

## Cold-run procedure

1. Use a fresh/private browser session and sign in with GitHub.
2. Install the App, return through `/github/callback`, and confirm automatic
   repository synchronization.
3. Save Terraform workflow/path/version configuration.
4. create/verify the AWS role, choose Auto Optimize with maximum FREE, and
   enable TerraFix.
5. Open/update the same-repository failure PR and let its normal Terraform CI
   fail.
6. Confirm GitHub's `workflow_run` delivery is accepted and an AgentRun appears
   automatically. Do not run `pnpm worker:once` as a manual substitute for the
   deployed worker path.
7. Confirm the worker claims the row, package version is 1.1.4, verification
   finishes, one PR comment is published, and dashboard/usage telemetry appears.
8. Compare repository commit/branch history before and after; it must be
   unchanged by TerraFix.

Record only safe metadata:

| Field | Real result |
| --- | --- |
| Date/time (UTC) | Not run |
| Repository | Not run |
| PR number | Not run |
| Failure type | DynamoDB hash-key mismatch (planned) |
| GitHub delivery ID | Not run |
| AgentRun ID | Not run |
| Agent version | Not run |
| Requested model | Not run |
| Reported/actual model | Not run |
| Initial/final tier | Not run |
| Verification status | Not run |
| Verification outcome/classification | Not run |
| Mutation eligibility level | Not run |
| Model calls | Not run |
| Input/output/total tokens | Not run |
| Provider-reported cost | Not run |
| LLM/runtime latency | Not run |
| PR publication status | Not run |
| Conditional approval/application result | Not run |
| Source unchanged | Not run |

## Warm-memory procedure

After a verified cold run, reproduce the exact eligible failure while retaining
the deployed engine's Verified Failure Memory storage. Verify all of these from
telemetry:

- memory status is reused;
- candidate is freshly verified against the current checkout;
- model-call count is exactly zero;
- PR result still publishes/updates;
- historical token/cost avoidance appears only if authoritative history exists.

If worker replacement or ephemeral storage removes the memory, record that
deployment limitation. Do not label a normal cache hit as Verified Failure
Memory and do not infer savings.

## Routing, idempotency, and stale ownership

- Auto Optimize with maximum FREE must never select ECONOMY, BALANCED, or
  PREMIUM. Record the actual catalog model, not only `openrouter/free`.
- Push another failing commit to the same PR. Confirm the same marked bot
  comment is updated rather than duplicated.
- If possible with controlled mocked concurrency, complete an older run after a
  newer run and confirm the older publication is skipped as
  `superseded_by_newer_run`.

## Analytics validation

With genuine v1.0 rows, verify `/usage` and the repository summary show the
recorded tokens, provider cost (including explicit zero), reported model,
context progression, source/schema optimization, routing, memory state, and
verification. Missing telemetry must remain Not reported/Not available and the
completeness population must match the underlying runs.

## Optional benchmark set

Run DynamoDB hash-key mismatch, EBS throughput with `gp2`, and S3
`bucket`/`bucket_prefix` conflict as separate hosted PRs. Capture actual model,
input/output/total tokens, provider cost, LLM latency, total runtime, and
verification. Compare with historical baseline evaluation only when the agent
evaluation tooling supplies authoritative measurements; never invent savings.
