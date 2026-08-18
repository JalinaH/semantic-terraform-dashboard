# Semantic Terraform Agent Dashboard

The hosted dashboard and control plane for **Semantic Terraform Agent**. Phase 3 adds secure, persisted per-repository execution configuration without copying or invoking the Python agent engine.

## Repository boundary

```text
semantic-terraform-agent
└── Python diagnosis/verification engine, CLI, Terraform checks, bounded repair,
    reusable GitHub Actions integration, and PR comments

semantic-terraform-dashboard
└── Hosted SaaS UI/control plane for identity, installations, repository access,
    persisted configuration, future run ingestion, and analytics
```

The dashboard does not contain the Python agent and does not execute Terraform.

## Phase 3 capabilities

- GitHub App user authorization through Auth.js
- PostgreSQL-backed users, OAuth accounts, and database sessions through Prisma
- Protected dashboard, repositories, runs, settings, and GitHub onboarding routes
- Multiple personal/organization installations per dashboard user
- Repository synchronization grouped by installation account
- Soft removal of repositories no longer granted to an installation
- Persisted repository-specific Terraform, model, context, repair, trigger, and failure-stage settings
- Shared Zod validation in the browser and authoritative Server Action validation on the server
- Installation-based authorization before repository data is shown or changed
- Preserved, read-only configuration when GitHub removes a repository grant
- Real connected/configured/enabled/requiring-AWS dashboard metrics
- A typed `AgentExecutionConfig` mapper for a future worker boundary
- Honest `not_configured`, `configured`, and `disabled` states; `ready` remains reserved

Authenticated dashboard metrics do not present mock activity as real data; run ingestion remains empty. A configured repository is not operationally ready until AWS onboarding is implemented.

## Repository configuration

Each GitHub-connected repository can persist:

| Area | Fields | Phase 3 defaults |
| --- | --- | --- |
| Agent | `enabled` | `true` |
| Terraform | `terraformDir`, `terraformVersion` | `.`, `1.15.7` |
| Model | `modelProvider`, `model`, `contextMode` | `gemini`, `gemini-3.6-flash`, `auto` |
| Repair | `maxRepairAttempts` | `1` (bounded to `0` or `1`) |
| Triggers | `triggerOnPullRequest`, `triggerOnPush` | both enabled |
| Failures | `failedStages` | `plan` (`validate` is also supported) |

Terraform directories must be repository-relative, use forward slashes, avoid `..`, control characters, and unsafe path characters, and fit within 240 characters. Redundant separators and `.` segments are normalized. Terraform versions use a conservative `x.y.z` pattern. Providers, models, context modes, repair attempts, and failure stages are allow-listed.

Configuration states are deliberately narrow:

- `not_configured`: no saved `RepositoryConfig`
- `configured`: saved and enabled, but not operationally ready
- `disabled`: saved with the agent turned off
- `ready`: reserved for a future phase after AWS verification access exists

## Security model

User authorization and installation authorization are intentionally separate. Auth.js persists provider tokens in server-only Prisma `Account` rows. The client session exposes only a safe identity projection. Installation callbacks require signed, expiring state plus an HTTP-only correlation cookie, then verify the installation through both the user and App API views.

Repository configuration writes use a Server Action that authenticates again, validates the same allow-listed schema used by the form, verifies the current user is joined to the repository's GitHub installation, and only then upserts the unique config record. A browser-supplied repository ID is never trusted on its own. Safe action responses contain a status, user-facing message, field errors, and save timestamp—not Prisma records or secrets.

The GitHub App private key, client secret, webhook secret, OAuth tokens, and installation tokens must never use a `NEXT_PUBLIC_` variable. Installation tokens are generated as needed rather than persisted as credentials. No GitHub personal access token is accepted.

## Technology

- Next.js 16 App Router and React 19
- strict TypeScript and Tailwind CSS 4
- shadcn/ui-style local components and Lucide icons
- Auth.js / NextAuth 5 with the Prisma adapter
- Prisma 6 targeting PostgreSQL
- Octokit REST and `jose` for server-side GitHub App authentication
- Zod 4 for shared repository configuration validation
- Vitest for isolated authentication, GitHub, configuration, authorization, and mapper tests
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

The app still builds and the public landing page renders when GitHub variables are absent; it shows an explicit unconfigured state and disables sign-in. Real authenticated routes and repository persistence require PostgreSQL and a registered GitHub App.

Follow [docs/github-app-setup.md](docs/github-app-setup.md) for the exact callback URL, Setup URL, permission, private-key, and local smoke-test steps.

## Environment variables

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Server | PostgreSQL connection for Prisma/Auth.js |
| `NEXT_PUBLIC_APP_URL` | Public | Canonical local application URL |
| `AUTH_SECRET` | Server secret | Auth.js cookie/token and installation-state signing |
| `AUTH_TRUST_HOST` | Server | Allows the local development host |
| `GITHUB_APP_ID` | Server | Numeric GitHub App ID |
| `GITHUB_APP_CLIENT_ID` | Server | GitHub App OAuth client ID and preferred App JWT issuer |
| `GITHUB_APP_CLIENT_SECRET` | Server secret | GitHub App user-authorization secret |
| `GITHUB_APP_SLUG` | Server | Builds the App installation URL |
| `GITHUB_APP_PRIVATE_KEY` | Server secret | Signs GitHub App JWTs; supports escaped newlines |
| `GITHUB_WEBHOOK_SECRET` | Server secret, unused | Reserved for a later webhook phase |

Do not put OAuth tokens, installation tokens, client secrets, webhook secrets, or private keys in client components or `NEXT_PUBLIC_*` values.

## Repository synchronization and configuration

An installation callback retrieves a short-lived installation token, pages through all repositories granted to that installation, and upserts GitHub identity, owner/name, default branch, privacy, and archive state. Manual **Sync repositories** repeats that operation. Repositories no longer returned by GitHub are marked `accessible = false` with `removedAt`; neither their configuration nor future history is deleted. Their detail page remains visible only to installation-linked users and becomes read-only until access is restored.

## Database changes

The Prisma schema includes Auth.js `Account`, `Session`, and `VerificationToken` models plus a `UserInstallation` join model:

```text
User ──< UserInstallation >── GitHubInstallation ──< Repository
```

This supports several installations per user and leaves room for several dashboard users to be associated with the same organization installation later. `RepositoryConfig.repositoryId` is unique, so a repository has at most one current configuration. The Phase 3 flow does not implement organization roles or invitations.

## Future worker contract

`toAgentExecutionConfig()` converts the safe saved configuration into a small typed contract containing Terraform directory/version/failure stages, provider/model/context, bounded repair attempts, and trigger preferences. It deliberately includes no OAuth token, installation token, private key, AWS credential, or full Prisma object. No worker or Python agent invocation exists yet.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm prisma:validate
pnpm build
git diff --check
```

The normal test suite does not call GitHub or require a live database.

## Intentionally deferred

- AWS onboarding, CloudFormation, or STS AssumeRole
- GitHub webhooks and automatic repository synchronization
- workflow-run monitoring and Terraform execution
- workers, queues, Redis, or Python agent invocation
- real dashboard run ingestion and PR diagnosis comments
- AWS connection, readiness transition, and provider-authenticated verification
- organization roles, invitations, and multi-user permissions
- notifications, billing, analytics tracking, MCP, or Marketplace publication

The recommended Phase 4 starting point is a repository-scoped AWS connection state machine backed by short-lived STS `AssumeRole`: generate a least-privilege onboarding contract, verify role ownership server-side, and transition an enabled, configured repository to `ready` only after a live identity check. Keep credentials and Terraform execution outside the browser and preserve the control-plane/agent-engine boundary.
