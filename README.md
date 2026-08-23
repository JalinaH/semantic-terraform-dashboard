<img src="./app/icon.png" alt="TerraFix logo" width="96" />

# TerraFix

TerraFix is a hosted control plane for verified Terraform failure diagnosis in
GitHub Actions CI. It observes a configured failed workflow, queues an isolated
worker diagnosis, publishes advisory evidence to the pull request, and exposes
token, provider-cost, routing, context, schema, and Verified Failure Memory
telemetry.

The implementation remains intentionally split:

```text
semantic-terraform-dashboard   TerraFix hosted control plane + observability
semantic-terraform-agent       inference + Terraform verification engine v1.1.0
```

The dashboard does not implement Terraform reasoning. The worker installs the
engine from the immutable commit behind `v1.1.0` and invokes its CLI contract.

## What the hosted integration does

```text
Developer PR → existing Terraform CI failure → signed GitHub App webhook
→ durable AgentRun → external worker → agent v1.1.0 → isolated verification
→ persisted verified artifact → human review → optional Apply to PR job
→ fresh verification → one non-force bot commit → normal CI
```

The consumer repository needs its own normal Terraform CI capable of running
`init`, `validate`, or `plan`. It does not need a TerraFix workflow,
`OPENROUTER_API_KEY`, `GEMINI_API_KEY`, or an AWS role secret in GitHub.

TerraFix never applies infrastructure, auto-commits, force-pushes, or merges a
PR. For a v1.1 mutation-eligible same-repository patch, an authorized user may
explicitly approve one source commit after a fresh head check and fresh safe
Terraform verification. Verification is evidence; human review is required.

## Capabilities

- Auth.js GitHub sign-in and multiple GitHub App installations
- automatic installation return and repository synchronization
- per-repository Terraform workflow/path/stage configuration
- repository-scoped AWS AssumeRole onboarding with random External ID
- server-enforced Auto Optimize or fixed OpenRouter model policy
- FREE/ECONOMY/BALANCED/PREMIUM policy tiers with immutable run snapshots
- bounded raw-body webhook verification and delivery-ID idempotency
- fork-PR rejection and readiness gates before privileged execution
- PostgreSQL queue with atomic claims, heartbeats, deadline, stale recovery, and
  graceful worker shutdown
- exact revision checkout, bounded Actions evidence, temporary STS credentials,
  and disposable workspaces
- pinned Semantic Terraform Agent v1.1.0 with startup version verification
- exact verified-patch provenance, explicit Apply to PR approval, durable audit,
  stale-head rejection, and deterministic zero-LLM application
- safe structured result ingestion and idempotent PR comment publication
- per-run usage, call details, model/context/schema routing, and memory state
- completeness-aware UTC analytics for tokens, Decimal provider cost,
  verification, optimization, repository, and actual/reported model trends

## Architecture and security

The Next.js control plane is Vercel-compatible and stateless between requests.
The persistent worker is a separate Docker process; PostgreSQL is their only
coordination mechanism. See [architecture](docs/architecture.md),
[security boundaries](docs/security.md), [GitHub App setup](docs/github-app-setup.md),
[AWS onboarding](docs/aws-onboarding.md), and
[hosted execution](docs/hosted-agent-execution.md).

The GitHub App requests only Metadata read, Actions read, Contents write, and
Pull requests write, and subscribes only to `workflow_run`. Contents write is
used only after explicit approval on a verified same-repository PR patch.
Customer AWS credentials are temporary STS sessions;
permanent keys are not requested or stored. The hosted OpenRouter key belongs to
the worker and is never exposed to repositories or browsers.

## AI usage and analytics semantics

- Explicit provider cost `0.0` is free/zero. Missing cost is `null` and shown as
  Not reported.
- Missing tokens are not charted as zero. Every aggregate discloses its
  reporting population.
- Cost/run and cost/verified-fix are withheld unless selected completed
  diagnosable runs have complete cost.
- Verification rate is verified-first-attempt plus verified-after-retry divided
  by completed diagnosable outcomes; worker/infrastructure failures are excluded.
- Context/schema reductions are calculated from characters and never relabeled
  as token savings.
- Schema avoidance, context/model escalation, and memory reuse use only runs
  where that signal is known.
- Historical token/cost avoidance appears only when the agent supplies
  authoritative historical telemetry; it is not a future-savings guarantee.
- UTC is the daily bucketing policy. 7-day and 30-day periods compare with the
  immediately preceding equal period; All time has no previous comparison.

## Technology

- Next.js 16.3.1 App Router, React 19, strict TypeScript, Tailwind CSS 4
- Prisma 6 / PostgreSQL (Neon supported), Auth.js 5, Octokit, AWS SDK STS
- Recharts for restrained responsive analytics
- Vitest, ESLint, esbuild, pnpm
- Node 22 worker image, Python 3, Git, Terraform 1.15.7, agent v1.1.0

## Human-approved Apply to PR

Agent v1.1 results may include a SHA-256-bound verified patch, exact verified
commit, affected files, source/verification provenance, and conservative
mutation eligibility. TerraFix independently rechecks every boundary. The
server action authenticates the requester, scopes the run through an accessible
installation, refreshes installation permission and PR metadata, rejects forks,
closed/merged PRs, stale heads, superseded runs, legacy artifacts, and hash
mismatches, then creates a durable `PatchApplication` row.

The persistent worker checks out the exact verified SHA into a disposable
workspace, applies the exact UTF-8 patch, requires the changed-file set to match
the declared existing `.tf`/`.tf.json` files, assumes fresh STS credentials,
and reruns `fmt -check`, `init -backend=false`, `validate`, and a no-refresh,
no-lock plan. Only then does it create one `TerraFix Bot` commit and push
non-force to the exact PR head branch. Apply jobs do not initialize or call a
model. `terraform apply`, merge, force push, forks, file creation/deletion/
rename, and branch-protection bypass have no implementation path.

## Local development

Requirements: Node.js 20.9+, pnpm, and PostgreSQL.

```bash
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm prisma migrate dev
pnpm dev
```

Open `http://localhost:3000`. Use a trusted HTTPS tunnel for the GitHub webhook;
GitHub cannot reach localhost. Development setup details are in
[github-app-setup.md](docs/github-app-setup.md).

To run the independently configured worker after installing Terraform and the
pinned Python engine locally:

```bash
pnpm worker
```

Or build the production container:

```bash
docker build -f worker/Dockerfile -t terrafix-worker:1.1.0 .
docker run --rm --env-file .env terrafix-worker:1.1.0
```

## Environment boundaries

`.env.example` is the safe template; [deployment.md](docs/deployment.md) is the
authoritative variable reference.

- Dashboard: `DATABASE_URL`, canonical app/auth values, GitHub App credentials,
  webhook secret, and AWS control-plane identity.
- Catalog operator: `DATABASE_URL` and `OPENROUTER_API_KEY`.
- Worker: `DATABASE_URL`, GitHub App signing values, AWS control-plane identity,
  `OPENROUTER_API_KEY`, pinned agent version, and bounded poll/timeout settings.

No secret uses a `NEXT_PUBLIC_` prefix. Production startup reports exact
missing/invalid variable names without values. `/api/health` and
`pnpm worker:health` are process-only probes that do not call external services.

## Model catalog

Bootstrap and refresh from a trusted operator environment:

```bash
pnpm models:sync
```

The response is bounded/validated and then filtered by
`config/model-policy.json`. Unknown models stay disabled, free classification
requires authoritative zero input/output price, and failed sync preserves the
last known-good catalog. Scheduling remains an explicit prototype operations
task rather than a new public/internal mutation endpoint.

## Production deployment

Use Vercel for the Next.js control plane, Neon/PostgreSQL for durable data, and
an AWS ECS Fargate service for the worker. Never place the persistent worker in
Vercel. Store the hosted OpenRouter key in AWS Secrets Manager and inject it
into the ECS task as `OPENROUTER_API_KEY`.

Production migrations use:

```bash
pnpm prisma:generate
pnpm prisma:migrate:deploy
```

The full order—database, Vercel variables/deploy, GitHub URLs, migrations,
catalog bootstrap, worker, health checks, and smoke test—is in
[deployment.md](docs/deployment.md).

## Demo and E2E

- [Demo consumer repository](docs/demo-repository.md)
- [Presentation runbook](docs/demo-runbook.md)
- [Production-like E2E record](docs/e2e-validation.md)

The primary case is a DynamoDB hash-key mismatch in a same-repository PR. The
E2E must flow from ordinary CI through the GitHub webhook and deployed worker;
manual agent CLI invocation is not a substitute. Record only real model, token,
cost, latency, verification, memory, and publication values.

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm prisma:format
pnpm prisma:validate
pnpm build
pnpm worker:build
pnpm worker:health
docker build -f worker/Dockerfile -t terrafix-worker:1.1.0 .
git diff --check
```

Tests use fake signed webhooks and mocked GitHub/AWS/model boundaries. They do
not claim a live authenticated E2E.

## MVP limitations

- GitHub and Terraform only; hosted provider authentication is AWS-focused.
- A normal GitHub Actions Terraform CI workflow is required.
- Same-repository PR security policy; untrusted forks never execute.
- Worker image supports Terraform 1.15.7 only.
- Free-model availability and actual routed model may change with OpenRouter.
- Catalog refresh is manually operated for the prototype.
- Verified Failure Memory persistence depends on durable worker/agent cache
  configuration; an ephemeral replacement may lose warm memory.
- No automatic source mutation, auto-merge, billing, budgets, BYOK, RBAC,
  notifications, MCP, or multi-cloud.

Future work is intentionally deferred: paid model access/billing, budgets,
semantic-cache/LLMLingua experiments, multi-cloud, and MCP.
