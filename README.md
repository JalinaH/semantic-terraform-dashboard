<div align="center">
  <img src="./app/icon.png" alt="TerraFix logo" width="88" />
  <h1>TerraFix</h1>
  <p><strong>Verified Terraform failure intelligence for GitHub Actions.</strong></p>
  <p>
    Diagnose failed CI runs, verify candidate fixes in isolation, and publish evidence for human review.
  </p>
</div>

## Overview

TerraFix is a production-shaped control plane for Terraform failure diagnosis. It listens for failed GitHub Actions workflows, collects bounded repository evidence, queues an isolated diagnosis, verifies candidate patches with Terraform, and presents the result through a secure dashboard and pull request workflow.

This repository contains the hosted web application and worker. Terraform reasoning is implemented by the separately versioned **Semantic Terraform Agent v1.2.0**, which the worker installs from an immutable source commit.

### Why this project exists

Terraform errors often contain enough information to identify a failure but not enough context to confidently change infrastructure code. TerraFix combines repository-aware diagnosis with deterministic verification so a model suggestion becomes reviewable evidence—not an automatic infrastructure change.

## Project repositories

- [TerraFix dashboard and worker](https://github.com/JalinaH/semantic-terraform-dashboard) — this repository
- [Semantic Terraform Agent](https://github.com/JalinaH/semantic-terraform-agent) — the Python diagnosis and verification engine

## Key features

- GitHub OAuth sign-in and repository-scoped GitHub App installations
- HMAC-verified `workflow_run` webhooks with delivery idempotency
- Per-repository Terraform path, workflow, stage, and model policy
- PostgreSQL-backed job queue with atomic claims, heartbeats, and stale-job recovery
- Exact revision checkout and disposable worker workspaces
- Progressive local or provider-aware Terraform verification
- Optional AWS AssumeRole onboarding with repository-specific External IDs
- Human-approved, freshly reverified, non-force patch commits to eligible PRs
- Idempotent pull request comments with redacted diagnosis evidence
- Token, cost, model, context, verification, and memory analytics
- Light and dark responsive dashboard themes
- Strict TypeScript, schema validation, and a comprehensive Vitest suite

## Architecture

```text
GitHub Actions failure
        │ signed workflow_run webhook
        ▼
┌──────────────────────────────┐
│ Next.js control plane        │
│ Auth · policy · UI · API     │
└──────────────┬───────────────┘
               │ durable queue and audit records
               ▼
┌──────────────────────────────┐
│ PostgreSQL / Prisma          │
└──────────────┬───────────────┘
               │ atomic claim
               ▼
┌──────────────────────────────┐
│ Persistent isolated worker   │
│ Git · Python agent · Terraform │
└──────────────┬───────────────┘
               │ verified result
               ▼
Dashboard · PR comment · optional human-approved patch commit
```

The web process is stateless between requests and never runs Git, Python, or Terraform. Long-running jobs execute in a separate worker, and PostgreSQL is the only coordination boundary. This keeps the Vercel-compatible control plane responsive while allowing the worker to run safely on ECS, Kubernetes, or another persistent container platform.

### Diagnosis flow

1. GitHub sends a signed failed `workflow_run` event.
2. TerraFix verifies the signature, deduplicates the delivery, and evaluates readiness and fork-safety gates.
3. A worker atomically claims the queued run and checks out the exact source revision.
4. The agent collects bounded logs, diff, Terraform context, and relevant schema.
5. A candidate patch is generated and checked against strict file and provenance rules.
6. Terraform verification classifies the result as fully verified, locally validated, environment blocked, or unsafe.
7. Evidence is persisted and published for review.
8. An authorized user may approve an eligible patch; the worker then performs fresh verification before one non-force commit.

## Technology stack

| Area | Technology |
| --- | --- |
| Web application | Next.js 16 App Router, React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, custom design tokens, Lucide icons |
| Authentication | Auth.js 5, GitHub OAuth, GitHub App installations |
| Data | PostgreSQL, Prisma 6 |
| Integrations | GitHub REST API, AWS STS, OpenRouter |
| Analytics | Recharts |
| Worker | Node.js 22, Python 3, Terraform 1.15.7, Docker |
| Quality | Vitest, ESLint, TypeScript, GitHub Actions |

## Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL 15+
- A GitHub App for authentication and repository integration
- Docker for the production worker image
- OpenRouter API access for hosted diagnosis
- Optional: AWS account for provider-aware verification

The landing page can be viewed without a complete GitHub integration. The authenticated dashboard and worker require the relevant environment variables below.

## Setup instructions

### 1. Install dependencies

```bash
git clone https://github.com/JalinaH/semantic-terraform-dashboard.git
cd semantic-terraform-dashboard
pnpm install --frozen-lockfile
```

### 2. Configure the environment

```bash
cp .env.example .env
openssl rand -base64 32
```

Paste the generated value into `AUTH_SECRET` and configure at least the database and GitHub authentication variables in `.env`. Never commit `.env`; it is ignored by Git.

### 3. Prepare the database

Create a PostgreSQL database, set `DATABASE_URL`, then run:

```bash
pnpm prisma:generate
pnpm prisma migrate dev
```

Use `pnpm prisma:migrate:deploy` instead of `migrate dev` in production.

### 4. Install the local agent used by the worker

Clone the [Semantic Terraform Agent](https://github.com/JalinaH/semantic-terraform-agent) beside this repository, then install it in a Python virtual environment:

```bash
git clone https://github.com/JalinaH/semantic-terraform-agent.git ../semantic-terraform-agent
python3 -m venv ../semantic-terraform-agent/.venv
source ../semantic-terraform-agent/.venv/bin/activate
python -m pip install -e '../semantic-terraform-agent'
```

Keep this virtual environment active when starting the local worker, or set `SEMANTIC_TERRAFORM_AGENT_COMMAND` to the installed executable.

## Run instructions

The dashboard and worker are separate long-running processes. Start each in its own terminal after completing the setup above.

### 1. Start the dashboard

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### 2. Start the worker

The local worker requires Terraform and the Semantic Terraform Agent v1.2.0 on `PATH` unless `SEMANTIC_TERRAFORM_AGENT_COMMAND` points to a compatible executable.

```bash
pnpm worker
```

Process a single queued item and exit:

```bash
pnpm worker:once
```

## Environment variables

Start from [`.env.example`](./.env.example), which is the authoritative safe template.

### Dashboard and GitHub App

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection shared by the web app and worker |
| `NEXT_PUBLIC_APP_URL` | Yes | Canonical origin, such as `http://localhost:3000` |
| `AUTH_SECRET` | Yes | Auth.js sessions and signed integration state |
| `AUTH_TRUST_HOST` | Production | Trust the configured deployment host |
| `GITHUB_APP_ID` | Yes | GitHub App identity |
| `GITHUB_APP_CLIENT_ID` | Yes | OAuth client and App JWT issuer |
| `GITHUB_APP_CLIENT_SECRET` | Yes | GitHub OAuth token exchange |
| `GITHUB_APP_SLUG` | Yes | Public GitHub App slug |
| `GITHUB_APP_PRIVATE_KEY` | Yes | App JWT signing key; literal `\n` is supported |
| `GITHUB_WEBHOOK_SECRET` | Yes | Webhook HMAC verification secret |

### Worker and model gateway

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Worker | Hosted model access; never exposed to browsers or consumer repos |
| `GEMINI_API_KEY` | Optional | Legacy Gemini-configured runs only |
| `SEMANTIC_TERRAFORM_AGENT_VERSION` | Optional | Defaults to the pinned `1.2.0` contract |
| `SEMANTIC_TERRAFORM_AGENT_COMMAND` | Optional | Local agent executable override |
| `WORKER_POLL_INTERVAL_MS` | Optional | Queue polling interval; default `5000` |
| `WORKER_JOB_TIMEOUT_SECONDS` | Optional | Per-job deadline; default `600` |

### Optional AWS verification

| Variable | Required | Purpose |
| --- | --- | --- |
| `AWS_CONTROL_PLANE_REGION` | Optional | STS and onboarding region |
| `AWS_ASSUME_ROLE_PRINCIPAL_ARN` | Optional | Workload principal trusted by customer roles |
| `AWS_ONBOARDING_TEMPLATE_URL` | Optional | Immutable public CloudFormation template URL |

Do not configure long-lived `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` values. TerraFix uses the standard workload identity chain and temporary STS sessions.

## GitHub App configuration

For a deployment at `https://your-domain.example`, configure:

| GitHub App setting | URL |
| --- | --- |
| Homepage URL | `https://your-domain.example/` |
| User authorization callback | `https://your-domain.example/api/auth/callback/github` |
| Setup URL | `https://your-domain.example/github/callback` |
| Webhook URL | `https://your-domain.example/api/github/webhooks` |

Repository permissions:

- Metadata: Read
- Actions: Read
- Contents: Write
- Pull requests: Write

Subscribe only to the **Workflow run** event. Contents write is used only after explicit approval of an eligible, already verified same-repository patch. For local webhook development, expose only the webhook route through a trusted HTTPS tunnel; GitHub cannot deliver events to localhost.

## Available scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the local Next.js development server |
| `pnpm build` | Generate Prisma Client and create a production build |
| `pnpm start` | Run the production web build |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run strict TypeScript validation |
| `pnpm test` | Run the Vitest suite once |
| `pnpm test:watch` | Run Vitest in watch mode |
| `pnpm check` | Run lint, types, tests, Prisma validation, and worker build |
| `pnpm worker` | Start the persistent worker locally |
| `pnpm worker:once` | Process at most one queued item |
| `pnpm worker:build` | Bundle the production worker |
| `pnpm worker:health` | Run the worker process health check |
| `pnpm models:sync` | Refresh the validated OpenRouter model catalog |

## Testing and verification

Run the complete local quality gate:

```bash
pnpm check
pnpm build
git diff --check
```

The test suite mocks GitHub, AWS, model, and webhook boundaries. It covers authorization, signed callbacks, idempotency, analytics semantics, repository configuration, worker lifecycle, patch provenance, publication, and conditional apply behavior. It does not claim a live third-party end-to-end run.

## How to test the project end to end

This test uses a small Terraform repository and a pull request that deliberately makes Terraform Plan fail. Before starting, the deployed dashboard, PostgreSQL database, and worker must be running; the worker must have `OPENROUTER_API_KEY`; and the GitHub App callback, setup, webhook URL, permissions, and **Workflow run** subscription must match [GitHub App configuration](#github-app-configuration).

### 1. Create the sample GitHub repository

Download the sample Terraform ZIP from the Google Drive link supplied with the submission and extract it. Create a new empty GitHub repository, then push the extracted files to its `main` branch. The repository must include `.github/workflows/terraform.yml` and the workflow name inside that file must be `Terraform CI`.

```bash
cd /path/to/extracted-sample
git init
git add .
git commit -m "Add sample Terraform project"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repository>.git
git push -u origin main
```

### 2. Connect GitHub to TerraFix

1. Open the TerraFix dashboard and select **Continue with GitHub**.
2. Authorize the GitHub account that owns the sample repository.
3. Install the TerraFix GitHub App and grant it access to the sample repository. If the App was already installed for selected repositories, use **Configure** on GitHub to add this repository.
4. Return to TerraFix and open **Repositories**. Confirm the sample repository appears and shows GitHub as connected.

The installation needs **Metadata: Read**, **Actions: Read**, **Contents: Write**, and **Pull requests: Write**. TerraFix uses write access only for PR comments and an explicitly approved eligible patch; it never applies Terraform or merges the PR.

### 3. Configure the repository

Open the sample repository in TerraFix, enter the following values under **Repository configuration**, and select **Save configuration**:

| Setting | Test value |
| --- | --- |
| TerraFix agent | Enabled |
| Terraform directory | `.` |
| Terraform version | `1.15.7` |
| Model policy | Auto Optimize with maximum tier `Free`, or a currently available fixed free model |
| Context mode | `Auto` |
| Max repair attempts | `1` |
| Pull-request workflow failures | Enabled |
| Terraform workflow names | `Terraform CI` |
| Terraform path patterns | `**/*.tf`, `**/*.tf.json` |
| Failed Terraform stages | `plan` |

AWS is optional for this demonstration; without it, the candidate receives isolated local validation. Do not continue until the repository page says **TerraFix is ready**.

### 4. Create the failing pull request

Create a branch from `main`, make a small change in a Terraform file, commit it, and push the branch:

```bash
git switch -c terrafix-demo
# Edit variables.tf and introduce the supplied deliberate test regression.
git add variables.tf
git commit -m "Test TerraFix diagnosis"
git push -u origin terrafix-demo
```

For the supplied sample, the deliberate regression is changing `database_deletion_protection` from `true` to `false` while `environment` remains `production`. If the downloaded sample already contains that regression, make a harmless comment change in `variables.tf` so the pull request still changes a path matched by `**/*.tf`.

Open a pull request from `terrafix-demo` into `main`. The `Terraform CI` workflow should run and fail at **Terraform Plan** with `Production databases must enable deletion protection.` Do not merge the pull request.

### 5. Verify the TerraFix result

After GitHub marks the workflow as failed, its signed `workflow_run` webhook should automatically queue the agent—no manual agent workflow is required. Confirm that:

1. A run appears under **Runs** in TerraFix and progresses from queued to running to completed.
2. The run identifies the production deletion-protection constraint and proposes changing the value back to `true`.
3. Verification evidence and model usage appear on the run page.
4. TerraFix publishes an evidence-backed comment on the pull request when PR publication is available.

OpenRouter's free routing can occasionally return no usable or malformed model response because free-model availability is best effort. If that happens, open the failed `Terraform CI` run in the GitHub **Actions** tab and choose **Re-run jobs** (or **Re-run all jobs**). The new failed workflow completion sends another webhook and gives TerraFix a fresh diagnosis attempt.

## Production deployment

Recommended topology:

- **Vercel**: Next.js control plane
- **Neon or managed PostgreSQL**: durable application data and job queue
- **AWS ECS Fargate**: persistent worker
- **AWS Secrets Manager**: database, GitHub private key, and model secrets

### Deploy the web application

1. Provision PostgreSQL and save a restore point.
2. Configure all production dashboard variables.
3. Deploy with `pnpm build` on Node.js 22.
4. Apply migrations from the exact release artifact:

```bash
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm prisma:migrate:deploy
```

5. Verify `GET /api/health` returns an uncached `status: ok` response.
6. Run `pnpm models:sync` from a trusted operator environment.

### Build the worker image

Use an immutable agent commit matching version `1.2.0`:

```bash
docker build -f worker/Dockerfile \
  --build-arg SEMANTIC_TERRAFORM_AGENT_SOURCE='git+https://github.com/JalinaH/semantic-terraform-agent.git@<immutable-v1.2.0-commit>' \
  -t terrafix-worker:1.2.0 .
```

Run the image as one persistent service with access to PostgreSQL, GitHub, Terraform registries, OpenRouter, and optional AWS STS. The included worker deployment workflow uses GitHub OIDC, immutable ECR tags, and ECS task-definition revisions—no static AWS keys.

## Security model

- Webhook signatures are verified against bounded raw request bodies before parsing.
- Delivery IDs are unique, so GitHub redelivery cannot create a duplicate run.
- Fork pull requests are rejected before hosted execution.
- Installation tokens and AWS credentials are short-lived.
- Repository access is rechecked at every sensitive action.
- Candidate patches are bound to the source commit and contents by SHA-256.
- Changed files are restricted to existing `.tf` and `.tf.json` files.
- Apply requests reject stale heads, superseded runs, forks, unsafe outcomes, and hash mismatches.
- Fresh verification is required immediately before any approved source commit.
- `terraform apply`, force push, auto-merge, and branch-protection bypass are not implemented.

Verification is evidence, not a guarantee of developer intent. Human review remains mandatory.

## Project structure

```text
app/                    Next.js routes, pages, server actions, and API handlers
components/             Dashboard, analytics, onboarding, and UI components
config/                 Versioned model policy
lib/                    Auth, GitHub, AWS, queue, analytics, and domain services
prisma/                 Database schema and append-only migrations
scripts/                Trusted operator utilities
tests/                  Unit, component, integration, and contract tests
worker/                 Persistent diagnosis and patch-application worker
.github/workflows/      CI and OIDC-based ECS deployment
```

## Current scope

- GitHub Actions and Terraform are the supported CI/IaC path.
- Provider-aware hosted verification currently targets AWS.
- The worker image contains Terraform 1.15.7; other versions require a matching image.
- Only same-repository pull requests are eligible for patch publication.
- Model catalog refresh is an operator task.
- Billing, organization RBAC, notifications, auto-merge, multi-cloud onboarding, and Terraform apply are outside the current product scope.

## Portfolio highlights

This project demonstrates full-stack product engineering across secure OAuth and GitHub App integrations, event-driven job processing, AI routing and observability, infrastructure isolation, cloud identity, transactional data modeling, defensive source mutation, responsive UI design, automated testing, and container deployment.
