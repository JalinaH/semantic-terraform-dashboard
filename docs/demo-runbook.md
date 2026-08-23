# TerraFix demo runbook

## Before the presentation

1. Open the Vercel health endpoint and confirm `status: ok`.
2. Confirm the worker container is healthy and its latest startup log reports
   Agent v1.1.0.
3. Run `pnpm prisma migrate status` against production and confirm no pending
   migrations.
4. Sign in, verify the GitHub App installation is active, and synchronize the
   dedicated demo repository.
5. Re-verify its AWS connection.
6. Confirm the latest OpenRouter catalog sync succeeded and an eligible FREE
   model is available.
7. Confirm repository policy is Auto Optimize, maximum FREE, all setup checks
   pass, and TerraFix is enabled.
8. Reset the dedicated demo branch as described in
   [demo-repository.md](demo-repository.md).
9. Open one previously completed genuine AgentRun in a backup browser tab.
10. Keep genuine screenshots of its failing CI, run detail, PR comment, and
    usage page available if an external service is degraded.

## Live path

1. Show the Terraform PR and the one intentional DynamoDB hash-key mismatch.
2. Show the repository's ordinary Terraform CI fail; point out there is no
   TerraFix workflow or repository model key.
3. Show the signed `workflow_run` delivery reach TerraFix.
4. Open Runs and show the queued row transition to running.
5. Show the final root cause, candidate diff, and Terraform verification stages.
6. Review the suggested diff and state that verification does not establish
   developer intent.
7. Click **Apply to PR**, review the repository/branch/head/files, and confirm.
8. Show fresh verification, the TerraFix bot commit, and normal CI rerunning.
9. Open the updated idempotent TerraFix PR comment.
10. Open AI Usage for tokens, provider-reported cost, actual model, context/schema
   behavior, routing, and memory status.
11. Open Usage analytics and explain completeness when legacy rows lack telemetry.
12. If a warm-memory reproduction is available, show fresh verification with
    zero LLM calls; do not claim a memory hit unless the run reports one.

## Timing capture

Record timestamps/telemetry from the real delivery and run:

| Stage | Evidence |
| --- | --- |
| GitHub failure → webhook | workflow completion and GitHub delivery timestamps |
| webhook → queued | delivery processed and AgentRun created timestamps |
| queued → worker start | `createdAt` to `startedAt` |
| model inference | provider/agent LLM latency telemetry |
| Terraform verification | persisted timing fields |
| publication | run completion to publication timestamp |

Do not infer missing stage timings or convert them to zero.

## Failure tolerance

- **GitHub delayed:** use the previously completed real run and explain the live
  delivery dependency.
- **AWS STS unavailable:** show the saved connection and genuine prior run; do
  not bypass role verification.
- **OpenRouter unavailable:** show a genuine zero-LLM memory run if one exists,
  otherwise use the prior cold run.
- **Worker offline:** restart the container. Queued rows remain durable; an
  expired running row becomes a safe `worker_stale` failure rather than looping.
- **Vercel/DB unavailable:** use captured genuine screenshots and the documented
  architecture. Never insert fake production AgentRuns.

## After the presentation

1. Confirm the PR has one TerraFix bot comment, not duplicate comments.
2. Confirm exactly one approved TerraFix commit exists, no merge occurred, and
   no infrastructure mutation was performed.
3. Close/reset only the dedicated demo PR/branch.
4. Record the safe result metadata in [e2e-validation.md](e2e-validation.md).
