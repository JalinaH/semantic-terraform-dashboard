# TerraFix prototype deployment

TerraFix deploys as three independent processes that share only PostgreSQL:

```text
Vercel: Next.js control plane ──┐
                               ├── Neon/PostgreSQL
AWS ECS Fargate: TerraFix worker ─┘
```

Vercel owns the UI, Auth.js callbacks, GitHub App installation flow, webhook
ingestion, repository/AWS configuration, and analytics. It does not run Git,
Terraform, Python, or the persistent worker. The external worker atomically
claims queued `AgentRun` rows; no process memory or filesystem is shared.

## 1. Provision PostgreSQL / Neon

Create a production database and retain both its pooled runtime URL and a
direct/session URL for migration operations. Set `DATABASE_URL` to the pooled
TLS URL in Vercel and the worker. For a migration command, temporarily provide
the direct URL as `DATABASE_URL` when required by the provider.

Do not run `prisma migrate dev` in production. From the exact release artifact:

```bash
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm prisma:migrate:deploy
```

Review the migration SQL before deployment and take a Neon restore point or
branch first. MVP rollback is application rollback plus database restore; do
not attempt to reverse an applied migration by deleting migration records.

## 2. Configure Vercel

Import `semantic-terraform-dashboard` as a Next.js project. Use Node.js 22 and
pnpm. The production build command is `pnpm build`; the output uses the normal
Next.js adapter. No persistent disk, background loop, Terraform binary, Docker
daemon, or local worker is needed in the Vercel runtime.

Set these production variables:

| Variable | Secret | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | pooled PostgreSQL connection for Auth.js and control-plane data |
| `NEXT_PUBLIC_APP_URL` | no | exact canonical HTTPS origin, without path/query |
| `AUTH_SECRET` | yes | Auth.js/session and signed installation state |
| `AUTH_TRUST_HOST` | no | must be `true` for the configured production host |
| `GITHUB_APP_ID` | no | GitHub App identity/configuration validation |
| `GITHUB_APP_CLIENT_ID` | no | GitHub user OAuth and App JWT issuer |
| `GITHUB_APP_CLIENT_SECRET` | yes | GitHub user OAuth token flow |
| `GITHUB_APP_SLUG` | no | App installation URL and bot identity |
| `GITHUB_APP_PRIVATE_KEY` | yes | App JWT signing; PEM may use literal `\n` |
| `GITHUB_WEBHOOK_SECRET` | yes | raw request HMAC verification |
| `AWS_CONTROL_PLANE_REGION` | no | STS control-plane region |
| `AWS_ASSUME_ROLE_PRINCIPAL_ARN` | no | trusted principal rendered into customer role templates |
| `TERRAFIX_BUILD_SHA` | no | optional display-only hexadecimal build identifier |

The server fails startup with exact missing/invalid variable names in
production. Values are never included in that error. `/api/health` is a public,
uncached process check and intentionally does not query the database or external
services.

## 3. Configure the GitHub App

For deployment origin `https://<terrafix-deployment>`:

| GitHub setting | URL |
| --- | --- |
| Homepage | `https://<terrafix-deployment>/` |
| User authorization callback | `https://<terrafix-deployment>/api/auth/callback/github` |
| Setup URL | `https://<terrafix-deployment>/github/callback` |
| Webhook URL | `https://<terrafix-deployment>/api/github/webhooks` |

Use the permissions and sole event subscription documented in
[github-app-setup.md](github-app-setup.md). Existing installations must approve
permission changes before PR publication becomes ready.

## 4. Deploy and migrate

1. Deploy the Vercel application with all dashboard variables.
2. Confirm `GET /api/health` returns `status: ok` and `Cache-Control: no-store`.
3. Run `pnpm prisma:migrate:deploy` against the production database from a
   controlled CI job or operator shell.
4. Run `pnpm prisma migrate status` and retain its safe status output.
5. Sign in and verify the Settings version section shows TerraFix and Agent
   v1.1.4.

## 5. Bootstrap the model catalog

Catalog sync stays manual for the prototype. No public cron endpoint was added,
which avoids introducing another secret-bearing mutation route immediately
before the demo. From a trusted operator environment containing only
`DATABASE_URL` and `OPENROUTER_API_KEY`:

```bash
pnpm models:sync
```

The fetch is bounded and validated. A failed sync records a safe error and
retains the last known-good catalog. Re-run daily or immediately before a demo;
confirm at least one policy-classified FREE model is available. Never run a
production seed to fabricate models or usage.

## 6. Deploy the worker to AWS ECS Fargate

Run one long-lived Fargate service with desired count `1`. It has no listener,
port mapping, or load balancer. It polls the same Neon database as Vercel and
needs outbound access to PostgreSQL, GitHub, AWS STS, OpenRouter, Terraform
registries, and provider APIs.

Build for the same CPU architecture selected in the task definition. Use an
immutable tag instead of `latest`; the current deployment uses X86_64:

```bash
docker buildx build \
  --platform linux/amd64 \
  --file worker/Dockerfile \
  --tag <account>.dkr.ecr.<region>.amazonaws.com/semantic-terraform-worker:1.1.4-amd64 \
  --push \
  .
```

Configure the task for Linux/X86_64, 1 vCPU, 2 GiB memory, CloudWatch
`awslogs`, and no port mapping. ARM64 also works when both the image and task
use ARM64. A mismatch fails immediately with `exec format error`.

Use separate IAM roles: the **execution role** pulls ECR images, writes logs,
and reads only the referenced Secrets Manager values; the **task role** is the
worker's workload identity and can call `sts:AssumeRole` only on connected
verification roles. Those roles trust the task-role ARN with their unique
External ID. Never configure AWS access keys or `AWS_PROFILE` in Fargate.

Store `DATABASE_URL`, `GITHUB_APP_PRIVATE_KEY`, and `OPENROUTER_API_KEY` in
Secrets Manager and inject them by ARN. The legacy Gemini secret is unnecessary
unless an old queued repository configuration explicitly selects Gemini.

Worker variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | same durable queue database |
| `GITHUB_APP_CLIENT_ID` | yes | App JWT issuer |
| `GITHUB_APP_PRIVATE_KEY` | yes | fresh installation tokens |
| `AWS_CONTROL_PLANE_REGION` | yes | STS client region |
| `AWS_ASSUME_ROLE_PRINCIPAL_ARN` | yes | validates the shared control-plane identity configuration |
| `OPENROUTER_API_KEY` | yes | hosted inference; never supplied by repositories |
| `GEMINI_API_KEY` | no | legacy Gemini-configured runs only; omit for OpenRouter-only deployments |
| `SEMANTIC_TERRAFORM_AGENT_VERSION` | no | defaults to and must equal `1.1.4` |
| `SEMANTIC_TERRAFORM_AGENT_COMMAND` | no | local executable override |
| `WORKER_POLL_INTERVAL_MS` | no | 500–60000 ms; default 5000 |
| `WORKER_JOB_TIMEOUT_SECONDS` | no | 60–1800 seconds; default 600 |

Normal startup validates configuration and Python package metadata before
polling. The image installs agent commit
`9caaef384897387afe0d8b7a2186b96bd968021e` (version `1.1.4`). Agent v1.1.4 lacks a
CLI `--version` flag, so `importlib.metadata` is the authoritative check at
image build and worker startup.

The image health command is:

```bash
pnpm worker:build
pnpm worker:health
```

It is process-only and may report `degraded` when variables are absent. Normal
worker startup remains strict. Inspect container health with `docker inspect`.

The MVP image contains Terraform 1.15.7 only. A repository configured for a
different version fails safely with `terraform_version_unavailable`; publish a
matching worker image before enabling that repository. For each release, push a
new immutable image tag, register a new task-definition revision, update the
service to that revision, and force a deployment. Confirm `worker_started` in
CloudWatch before retiring the previous task.

To avoid building and uploading images from a developer connection, configure
the OIDC-based GitHub workflow in
[github-actions-worker-deployment.md](github-actions-worker-deployment.md).
It builds ARM64 on a GitHub-hosted runner, pushes directly to ECR, and updates
the image plus its matching agent-version variable in the running service's
task definition.

Stable `semantic-terraform-agent` `v1.x.y` releases dispatch this workflow
automatically. The release tag, package version, and immutable agent commit must
match before build; the task definition receives the same version. Major-version
updates remain intentionally gated on a dashboard result-contract update.

## 7. AWS control-plane identity

Both dashboard verification and worker execution call STS. The customer role
trusts the configured principal ARN and requires the repository-specific
External ID. The worker obtains a 15-minute session, calls `GetCallerIdentity`,
and checks the expected account/role before invoking the engine. On ECS, the
task role supplies temporary workload credentials through the standard AWS SDK
credential chain.

Guided onboarding requires a public HTTPS `NEXT_PUBLIC_APP_URL` so the customer
callback Lambda can reach `/api/aws/onboarding/complete`. TerraFix serves the
versioned, secret-free template at
`/api/aws/onboarding/cloudformation-template/v1`. For production, prefer
uploading that exact response to an immutable public S3 object and set:

```dotenv
AWS_ONBOARDING_TEMPLATE_URL="https://your-bucket.s3.us-east-1.amazonaws.com/terrafix-aws-onboarding-v1.yaml"
```

The object contains no credentials or customer values. Version it instead of
overwriting it so existing launch URLs remain deterministic.

## 8. Production smoke checklist

1. Health endpoint succeeds without disclosing configuration.
2. Auth.js login returns to the production origin.
3. App installation returns through the Setup URL and repositories sync.
4. Guided AWS setup opens Quick Create and connects automatically after the stack callback.
5. Advanced / Manual CloudFormation download remains authorized and functional.
6. STS verification changes the repository to connected.
7. Model catalog has a current successful sync and an eligible FREE model.
8. Worker starts with `agentVersion: 1.1.4` and atomically claims diagnosis or patch-application jobs.
9. Run [e2e-validation.md](e2e-validation.md) against the dedicated demo repo.

## Recovery notes

- Webhook delivery IDs are unique; GitHub redelivery cannot create a duplicate
  run. A failed database delivery reservation can be retried safely.
- A running job with an expired heartbeat becomes `worker_stale` after the job
  timeout plus a one-minute grace period. It is not retried infinitely.
- Catalog sync failures preserve last known-good rows.
- PR publication is a separate idempotent queue and can be manually requeued
  without another model call.
- Restore Vercel/worker code to the prior image for application rollback. Use a
  Neon restore point/branch if a database rollback is truly required.
