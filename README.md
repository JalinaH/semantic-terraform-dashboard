# Semantic Terraform Agent Dashboard

The hosted dashboard and control plane for **Semantic Terraform Agent**. Phase 4 adds repository-scoped AWS onboarding with short-lived STS credentials; the dashboard still does not copy or invoke the Python agent engine.

## Repository boundary

```text
semantic-terraform-agent
└── Python diagnosis/verification engine, CLI, Terraform checks, bounded repair,
    reusable GitHub Actions integration, and PR comments

semantic-terraform-dashboard
└── Hosted SaaS UI/control plane for identity, GitHub installations, repository
    configuration, secure AWS connections, future jobs, and analytics
```

## Current capabilities

- GitHub App user authorization through Auth.js and PostgreSQL-backed sessions
- Multiple personal or organization installations per dashboard user
- Repository synchronization with soft removal of revoked repository grants
- Persisted per-repository Terraform and agent configuration
- Guided AWS onboarding at `/repositories/[id]/aws`
- One cryptographically random External ID per repository connection
- Generated trust policy and downloadable CloudFormation starter template
- Existing IAM role onboarding with strict role-ARN validation
- Server-only `AssumeRole` and `GetCallerIdentity` verification through AWS SDK v3
- Real `not_configured`, `configured`, `disabled`, and `ready` repository states
- Real dashboard counts for connected, configured, ready, and AWS-required repositories

Authenticated dashboard metrics do not present mock activity as real data. Terraform execution, run ingestion, and worker orchestration remain unimplemented.

## AWS connection architecture

```text
Dashboard/worker AWS identity
        │
        │ sts:AssumeRole + repository External ID
        ▼
Customer repository-scoped IAM role
        │
        │ temporary credentials only
        ▼
Future isolated Terraform verification worker
```

The onboarding flow never asks for a customer's access key or secret key. The server generates a random External ID, helps the user create or identify an IAM role, assumes that role for 15 minutes, and verifies the returned account and role with `GetCallerIdentity`. Temporary credentials are discarded after verification and are never written to PostgreSQL or serialized to the browser.

The generated **Starter verification policy** is intentionally read-oriented and is not claimed to support every Terraform provider or repository. A repository may need additional resource-specific read, list, describe, or provider planning permissions. The project does not recommend `AdministratorAccess`.

Read [docs/aws-onboarding.md](docs/aws-onboarding.md) for AWS setup, security details, manual test steps, and troubleshooting. GitHub App registration is documented in [docs/github-app-setup.md](docs/github-app-setup.md).

## Repository readiness

| State | Meaning |
| --- | --- |
| `not_configured` | No saved repository configuration |
| `disabled` | Configuration exists, but the agent is disabled |
| `configured` | Configuration is enabled, but AWS is not verified |
| `ready` | GitHub access, saved configuration, enabled agent, and verified AWS connection are all present |

`ready` means the integration prerequisites are complete. It does not mean a worker or automatic diagnosis exists yet.

## Technology

- Next.js 16.3.1 App Router and React 19.2.8
- strict TypeScript and Tailwind CSS 4
- shadcn/ui-style local components and Lucide icons
- Auth.js / NextAuth 5 with the Prisma adapter
- Prisma 6.19.0 targeting PostgreSQL
- AWS SDK for JavaScript v3 (`@aws-sdk/client-sts` 3.1113.0)
- Octokit REST and `jose` for server-side GitHub App authentication
- Zod 4 for server and form validation
- Vitest 4 for isolated service, security, authorization, and SDK-mock tests
- `next-themes` for persisted light, dark, and system appearance
- pnpm package management

## Local development

Requirements: Node.js 20.9 or newer, pnpm, and PostgreSQL for real sign-in/session persistence.

```bash
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm prisma migrate dev
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The public app still builds when GitHub or AWS variables are absent. GitHub sign-in is disabled when its configuration is absent. AWS onboarding remains viewable, but region setup and live verification explain which server configuration is missing instead of pretending a connection succeeded.

## Environment variables

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Server | PostgreSQL connection for Prisma/Auth.js |
| `NEXT_PUBLIC_APP_URL` | Public | Canonical application URL |
| `AUTH_SECRET` | Server secret | Auth.js and installation-state signing |
| `AUTH_TRUST_HOST` | Server | Allows the configured development host |
| `GITHUB_APP_ID` | Server | Numeric GitHub App ID |
| `GITHUB_APP_CLIENT_ID` | Server | GitHub App OAuth client ID and preferred App JWT issuer |
| `GITHUB_APP_CLIENT_SECRET` | Server secret | GitHub App user-authorization secret |
| `GITHUB_APP_SLUG` | Server | Builds the App installation URL |
| `GITHUB_APP_PRIVATE_KEY` | Server secret | Signs GitHub App JWTs; supports escaped newlines |
| `GITHUB_WEBHOOK_SECRET` | Server secret, unused | Reserved for a later webhook phase |
| `AWS_CONTROL_PLANE_REGION` | Server | Region used by the control-plane STS client |
| `AWS_ASSUME_ROLE_PRINCIPAL_ARN` | Server | IAM role/root principal trusted by generated customer roles |

Production should supply the control plane's AWS credentials through workload identity or an attached IAM role. Local verification uses the standard AWS SDK credential provider chain, such as AWS IAM Identity Center/SSO or a shared profile. Do not add `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` to this repository's `.env` template.

## Database model

```text
User ──< UserInstallation >── GitHubInstallation ──< Repository
                                                       │
                                                       ├── RepositoryConfig (0..1)
                                                       └── AWSConnection (0..1)
```

`AWSConnection` stores the role ARN, selected region, status, unique External ID, verified account ID, verification timestamp, and a bounded safe error message. It never stores temporary AWS credentials. The schema remains compatible with adding an environment/account join model later.

Apply existing migrations with:

```bash
pnpm prisma migrate deploy
```

## Security boundaries

- Every AWS mutation authenticates the user, authorizes installation membership, validates input, and performs AWS/database work server-side.
- A browser-provided repository ID or role ARN is never sufficient authorization.
- Only IAM role ARNs are accepted; IAM users, policies, STS assumed-role ARNs, and malformed ARNs are rejected.
- External IDs are server-generated, unique, random, stored per repository, and safe to copy into a trust policy.
- AWS SDK calls, control-plane credentials, assumed-role credentials, GitHub tokens, and secrets remain server-only.
- CloudFormation downloads require the same authenticated repository authorization and create only one IAM role, one inline starter policy, and tags.
- Disconnecting deletes the dashboard connection only. It never attempts to delete the customer's IAM role.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm prisma:format
pnpm prisma:validate
pnpm build
git diff --check
```

The normal test suite mocks STS and does not require GitHub, AWS credentials, or a live GitHub App.

## Intentionally deferred

- Terraform execution, Python agent invocation, and isolated workers
- GitHub failure webhooks and workflow monitoring
- automatic diagnosis, run ingestion, and PR comments
- queues, Redis, billing, notifications, analytics, and MCP
- CloudFormation template hosting and a production Quick Create URL
- automatic deletion or mutation of customer IAM resources
- multi-account/environment connections per repository
- GitHub Marketplace and multi-cloud support

The recommended Phase 5 starting point is a durable, idempotent job contract between GitHub failure ingestion and an isolated worker. The worker should resolve a repository's verified AWS role at execution time, request fresh STS credentials with the saved External ID, and pass only bounded execution inputs to the existing `semantic-terraform-agent` engine.
