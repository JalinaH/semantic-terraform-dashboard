# TerraFix Dashboard

The hosted control plane and observability product for **TerraFix**. Phase 8 turns real AI usage, provider-reported cost, verification, routing, and optimization telemetry into authorization-scoped trends and drilldowns without adding billing or usage limits.

The repositories remain intentionally separate:

```text
semantic-terraform-agent       Semantic Terraform Agent v1.0.0 inference and verification engine
semantic-terraform-dashboard   TerraFix hosted control plane and observability UI
```

The dashboard does not copy or reimplement the Python agent. The worker installs it from a pinned source commit and invokes its published CLI contract.

## Phase 7 capabilities

- Auth.js GitHub user authorization and PostgreSQL sessions
- Multiple GitHub App installations with soft repository access removal
- persisted repository workflow names, trigger events, Terraform path patterns, model/context, and repair limits
- repository-scoped AWS onboarding using External ID and short-lived STS credentials
- raw-body `sha256` GitHub webhook verification and delivery-ID idempotency
- `workflow_run` filtering for failed, configured Terraform workflows only
- pull-request/push/check-run audit handling without unconditional LLM invocation
- fork pull-request rejection before customer AWS credentials are requested
- bounded GitHub Actions job-log collection and Terraform validate/plan detection
- PostgreSQL-backed `AgentRun` queue claimed with `FOR UPDATE SKIP LOCKED`
- separate Node worker container with git, Python, Terraform, and a pinned `semantic-terraform-agent`
- exact-revision checkout, explicit base/head diff, temporary AWS role credentials, and service-owned Gemini credentials
- validated, redacted result ingestion and real run dashboard/detail views with polling
- separate `AgentRunPublication` queue and lifecycle that never changes a completed diagnosis outcome
- one marked GitHub App comment per pull request, created or updated with a fresh installation token
- newer-run ownership and stale-completion protection
- bounded Markdown-safe patches, final secret redaction, canonical comment URL persistence, and manual republish
- nullable normalized AgentRun telemetry for LLM calls, tokens, reported cost, latency, models, routing, context/schema reduction, escalation, and verified-memory reuse
- exact per-run AI usage with expandable per-call detail and explicit zero-versus-unknown semantics
- 7-day, 30-day, and all-time dashboard/usage summaries with repository and model breakdowns
- transparent cost/token completeness, verification-rate, schema-avoidance, escalation, memory-reuse, and zero-LLM metrics

Consumers do **not** add a model key, `AWS_ROLE_ARN`, or a TerraFix reusable workflow to their repositories for the hosted path. They still need an existing GitHub Actions Terraform CI workflow whose failure provides Actions logs.

Read [GitHub App setup](docs/github-app-setup.md), [AWS onboarding](docs/aws-onboarding.md), [hosted execution](docs/hosted-agent-execution.md), and [PR publication](docs/pr-publication.md).

## Hosted architecture

```text
GitHub workflow_run webhook
        │ signed raw body + delivery ID
        ▼
Next.js control plane ── PostgreSQL WebhookDelivery / AgentRun queue
        │
        ▼
Isolated worker ── installation token ── exact Git checkout + bounded Actions log
        │
        ├── STS AssumeRole + repository External ID → temporary AWS credentials
        └── service GEMINI_API_KEY
        ▼
Pinned semantic-terraform-agent CLI → validated safe result → PostgreSQL → dashboard
        │
        └── publication queue → fresh installation token → create/update one PR comment
```

The webhook returns after filtering and queue insertion. It never runs Terraform or the Python process inline. The worker claims each queued row atomically; Redis is not required in this phase.

## AI Usage and Cost Observability

TerraFix normalizes authoritative Semantic Terraform Agent v1.0.0 telemetry into nullable `AgentRun` columns while retaining a bounded `safeResultPayload` and small sanitized per-call records for forward compatibility. It never persists prompts, full repository source, full provider schemas, raw failure logs, Terraform state, credentials, or environment data as usage telemetry.

- **Tokens** include reported input, cached input, output, reasoning (when supplied), and total counts. Detailed run pages show exact counts; aggregate cards may use compact notation.
- **Cost** is reported by the configured model gateway. Explicit `0.0` is stored and shown as free/zero; missing provider cost stays `null` and is shown as **Not reported**.
- **Model calls** are aggregated per run and can be expanded into bounded call-level model, tier, context, tokens, cost, cache, and latency metadata.
- **Context optimization** reports Terraform source and provider-schema character reduction. Character reduction is never relabeled as token reduction.
- **Progressive context** records minimal/schema progression, schema retrieval or avoidance, and the reason for context escalation.
- **Model routing** records requested/reported models, upstream provider, TerraFix policy tier, and model escalation separately from context escalation.

## Analytics

`/usage` is the central analytics view. It supports Last 7 days, Last 30 days, and All time, plus an authorized repository filter and actual/reported-model filter persisted in the URL. Seven- and 30-day views compare against the immediately preceding equal-length UTC period; All time intentionally has no previous-period comparison.

- **Token trends** aggregate daily input, cached input, output, and total tokens from completed diagnosable runs with complete token telemetry.
- **AI spend trends** use Prisma Decimal-backed provider-reported costs. Explicit zero remains a free-cost day; missing cost remains a chart gap.
- **Verification trends** use verified-first-attempt and verified-after-retry outcomes over completed diagnosable runs. Worker/infrastructure failures are excluded.
- **Optimization effectiveness** reports schema avoidance, context escalation, model escalation, Verified Failure Memory reuse, and zero-LLM resolution only across rows where each signal is known.
- **Context reduction** reports the mean and median of individual Terraform-source and provider-schema reduction ratios; it does not average daily percentages or relabel characters as tokens.
- **Repository/model comparisons** are drillable and remain restricted to repositories linked to the authenticated user's GitHub installations. Model grouping prefers the actual reported model, falling back to the requested route when unavailable.

Daily buckets are UTC. Days with no runs are present for a stable chart timeline, but missing telemetry is represented as `null`, never numeric zero. Completeness labels disclose reporting diagnoses versus eligible diagnoses. Legacy runs continue to count toward run totals and supported verification metrics while being excluded from v1-only telemetry denominators.

Schema avoidance uses runs where `schemaAvoided` is reported, model/context escalation uses runs where the respective routing/progression flag is reported, and memory reuse uses runs where `failureMemoryReused` is reported. This is the most reliable eligibility signal available in v1.0; cache misses are not classified as failures.
- **Verified Failure Memory** records misses/reuse, fresh verification, zero-LLM resolutions, and historical tokens/cost avoided only when authoritative historical telemetry exists.

Cost and token totals show their reporting population. Average cost/run and cost/verified fix are withheld unless every completed diagnosable run in the selected period has complete reported cost. Missing values are never silently converted to zero. Historical normalized columns are intentionally left `null`; no mandatory backfill is performed.

Verification rate is defined as verified-first-attempt plus verified-after-retry runs divided by completed diagnosable runs. The denominator includes completed verification failures, rejected patches, and verification-unavailable outcomes, and excludes queued/running/skipped/cancelled runs and worker/infrastructure crashes.

## Technology

- Next.js 16.3.1, React 19.2.8, App Router
- strict TypeScript 5, Tailwind CSS 4, shadcn/ui-style components, Lucide
- Auth.js / NextAuth 5 and Prisma adapter
- Prisma 6.19.0 with PostgreSQL
- Octokit REST, `jose`, AWS SDK v3 STS, and Zod 4
- Vitest 4, `tsx`, and esbuild
- Node 22 worker image, Terraform 1.15.7, Python 3, pinned agent commit
- pnpm

## Local development

Requirements: Node.js 20.9+, pnpm, and PostgreSQL. Copy the environment template, register the GitHub App using the setup guide, and apply migrations:

```bash
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm prisma migrate dev
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). GitHub must reach `/api/github/webhooks`, so local webhook testing needs an HTTPS tunnel whose URL is configured on the GitHub App.

Run a host worker after installing Terraform and the pinned Python package locally:

```bash
pnpm worker
```

Or build the container:

```bash
docker build -f worker/Dockerfile -t semantic-terraform-worker:0.6.0 .
docker run --rm --env-file .env semantic-terraform-worker:0.6.0
```

The public application still builds when integration variables are absent. Sign-in, signed webhook processing, and worker execution remain unavailable rather than being simulated.

## Environment

| Variable | Boundary | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | dashboard + worker secret | PostgreSQL/Auth.js and durable job queue |
| `NEXT_PUBLIC_APP_URL` | public | canonical dashboard origin |
| `AUTH_SECRET` | dashboard secret | Auth.js and installation state |
| `GITHUB_APP_ID` / `GITHUB_APP_CLIENT_ID` | server (`CLIENT_ID` also worker) | App identity and JWT issuer |
| `GITHUB_APP_CLIENT_SECRET` | dashboard secret | GitHub user authorization |
| `GITHUB_APP_SLUG` | server | installation URL construction |
| `GITHUB_APP_PRIVATE_KEY` | dashboard + worker secret | App JWT and short-lived installation tokens |
| `GITHUB_WEBHOOK_SECRET` | dashboard secret | raw webhook HMAC validation |
| `AWS_CONTROL_PLANE_REGION` | server | STS client region |
| `AWS_ASSUME_ROLE_PRINCIPAL_ARN` | server configuration | principal placed in generated customer trust policies |
| `GEMINI_API_KEY` | worker secret | service-owned model credential |
| `SEMANTIC_TERRAFORM_AGENT_VERSION` | worker | pinned agent source/version label |
| `WORKER_POLL_INTERVAL_MS` | worker | queue poll interval, default 5000 |
| `WORKER_JOB_TIMEOUT_SECONDS` | worker | complete hosted-job deadline, default 600 |

Use production workload identity for control-plane AWS credentials and the standard AWS SDK provider chain locally. Do not place AWS permanent access keys in this product template. Never prefix server credentials with `NEXT_PUBLIC_`.

## Data and job lifecycle

```text
User ──< UserInstallation >── GitHubInstallation ──< Repository
                                                       ├── RepositoryConfig
                                                       ├── AWSConnection
                                                       ├── WebhookDelivery
                                                       └── AgentRun

AgentRun: queued → running → completed | failed | skipped | cancelled
Verification: pending → verified_* | verification_failed | patch_rejected | unavailable | skipped
Publication: pending → publishing → published | failed | skipped
```

Orchestration status and verification outcome are separate. An unverified candidate is a completed diagnosis, not a worker crash. Delivery metadata is bounded; full webhook payloads and unbounded log archives are not stored.

## Security boundaries

- HMAC verification happens over the unparsed raw request body using `GITHUB_WEBHOOK_SECRET`.
- `X-GitHub-Delivery` is unique; valid redelivery receives a normal duplicate response.
- GitHub App private keys and installation tokens remain server/worker-only and are never persisted.
- Cloning uses a short-lived token through a temporary Git config environment, never a token-bearing remote URL.
- fork PRs are skipped; `pull_request_target` is never a credential bypass.
- STS credentials exist only in worker memory/child environment and are never persisted.
- the model credential belongs to the hosted worker, not the customer repository.
- result ingestion rejects malformed payloads, strips command output/raw logs, bounds data, and redacts recognizable secrets.
- PR rendering uses only persisted safe fields, performs another secret-redaction pass, bounds the patch/comment, and uses a fence longer than any backtick run in an untrusted patch.
- Pull requests require only Pull requests: Write; Contents, Actions, Checks, and Metadata remain read-only.
- a marked comment is updated only when it is authored by this GitHub App bot. Older runs cannot overwrite a newer completed run.
- disposable checkouts are removed after every outcome. The worker never commits, pushes, applies, destroys, or merges.

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
docker build -f worker/Dockerfile -t semantic-terraform-worker:0.6.0 .
git diff --check
```

The normal test suite uses fake signed webhooks and mocked GitHub/AWS/agent boundaries. It requires no live GitHub App, AWS account, or Gemini call.

## Deferred beyond Phase 8

- auto-commit, auto-merge, Terraform apply/destroy, or any source mutation
- infrastructure retry policy or recurring job scheduler
- Stripe/billing, subscriptions, hard usage limits or budgets, BYOK, email/Slack notifications, Marketplace, organization RBAC, MCP, and multi-cloud
- model policy selection, catalog synchronization, and plan-based model access (Phase 9)
- custom date ranges, CSV export, deeper distributions, and visualization polish beyond the restrained Phase 8 charts
- more than one agent repair attempt

The recommended Phase 9 starting point is to centralize the existing read-only model policy into an authorization-checked policy service, then add model catalog and access-policy concepts without coupling observability to billing.
