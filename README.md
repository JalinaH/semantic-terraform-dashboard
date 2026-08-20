# Semantic Terraform Agent Dashboard

The hosted dashboard and control plane for **Semantic Terraform Agent**. Phase 5 receives signed GitHub workflow events, queues ready Terraform failures in PostgreSQL, and dispatches an isolated worker that invokes the existing Python engine.

The repositories remain intentionally separate:

```text
semantic-terraform-agent       Python diagnosis, patch, verification, and bounded repair engine
semantic-terraform-dashboard   Hosted identity, GitHub/AWS trust, queue, worker, results, and UI
```

The dashboard does not copy or reimplement the Python agent. The worker installs it from a pinned source commit and invokes its published CLI contract.

## Phase 5 capabilities

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

Consumers do **not** add `GEMINI_API_KEY`, `AWS_ROLE_ARN`, or a Semantic Terraform Agent reusable workflow to their repositories for the hosted path. They still need an existing GitHub Actions Terraform CI workflow whose failure provides Actions logs.

Read [GitHub App setup](docs/github-app-setup.md), [AWS onboarding](docs/aws-onboarding.md), and [hosted execution](docs/hosted-agent-execution.md).

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
```

The webhook returns after filtering and queue insertion. It never runs Terraform or the Python process inline. The worker claims each queued row atomically; Redis is not required in this phase.

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
docker build -f worker/Dockerfile -t semantic-terraform-worker:0.5.0 .
docker run --rm --env-file .env semantic-terraform-worker:0.5.0
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
| `WORKER_JOB_TIMEOUT_SECONDS` | worker | bounded agent timeout, default 600 |

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
docker build -f worker/Dockerfile -t semantic-terraform-worker:0.5.0 .
git diff --check
```

The normal test suite uses fake signed webhooks and mocked GitHub/AWS/agent boundaries. It requires no live GitHub App, AWS account, or Gemini call.

## Deferred to Phase 6 and later

- hosted GitHub App PR comments and permission upgrade to pull-request write
- auto-commit, auto-merge, Terraform apply/destroy, or any source mutation
- infrastructure retry policy or recurring job scheduler
- billing, email/Slack notifications, charts, Marketplace, organization RBAC, MCP, and multi-cloud
- more than one agent repair attempt

The recommended Phase 6 starting point is a result-publication service that renders an evidence-safe PR comment, uses a fresh installation token with narrowly upgraded pull-request write permission, and is idempotent per `AgentRun` without changing repository source.
