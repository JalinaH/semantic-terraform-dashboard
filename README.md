# Semantic Terraform Agent Dashboard

The hosted dashboard and control plane for **Semantic Terraform Agent**. Phase 2 adds real GitHub identity, GitHub App installation, and repository discovery without copying or invoking the Python agent engine.

## Repository boundary

```text
semantic-terraform-agent
└── Python diagnosis/verification engine, CLI, Terraform checks, bounded repair,
    reusable GitHub Actions integration, and PR comments

semantic-terraform-dashboard
└── Hosted SaaS UI/control plane for identity, installations, repository access,
    future configuration, run ingestion, and analytics
```

The dashboard does not contain the Python agent and does not execute Terraform.

## Phase 2 capabilities

- GitHub App user authorization through Auth.js
- PostgreSQL-backed users, OAuth accounts, and database sessions through Prisma
- Protected dashboard, repositories, runs, settings, and GitHub onboarding routes
- State- and cookie-protected GitHub App installation setup flow
- Server-only GitHub App JWT and short-lived installation-token generation
- Verification that an installation is accessible to the signed-in GitHub user
- Multiple personal/organization installations per dashboard user
- Repository synchronization grouped by installation account
- Soft removal of repositories no longer granted to an installation
- Real GitHub avatar/login and sign-out menu
- Safe missing-configuration, denial, cancellation, rate-limit, and synchronization states
- Unit tests that mock GitHub boundaries and require no live App

Phase 1 run-detail mock data remains only as a visualization sample. Authenticated dashboard metrics do not present mock activity as real data; run ingestion remains empty.

## Security model

User authorization and installation authorization are intentionally separate. Auth.js persists provider tokens in server-only Prisma `Account` rows. The client session exposes only the user ID, GitHub user ID, login, name, email, and avatar URL. Installation callbacks require signed, expiring state plus an HTTP-only correlation cookie, then verify the installation through both the user and App API views.

The GitHub App private key, client secret, webhook secret, OAuth tokens, and installation tokens must never use a `NEXT_PUBLIC_` variable. Installation tokens are generated as needed rather than persisted as credentials. No GitHub personal access token is accepted.

## Technology

- Next.js 16 App Router and React 19
- strict TypeScript and Tailwind CSS 4
- shadcn/ui-style local components and Lucide icons
- Auth.js / NextAuth 5 with the Prisma adapter
- Prisma 6 targeting PostgreSQL
- Octokit REST and `jose` for server-side GitHub App authentication
- Vitest for isolated Phase 2 logic tests
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

The app still builds and the public landing page renders when GitHub variables are absent; it shows an explicit unconfigured state and disables sign-in. Real authenticated routes require PostgreSQL and a registered GitHub App.

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

## Repository synchronization

An installation callback retrieves a short-lived installation token, pages through all repositories granted to that installation, and upserts GitHub identity, owner/name, default branch, privacy, and archive state. Manual **Sync repositories** repeats that operation. Repositories no longer returned by GitHub are marked `accessible = false` with `removedAt`; they are not deleted, preserving a future path for historical runs.

## Database changes

The Prisma schema includes Auth.js `Account`, `Session`, and `VerificationToken` models plus a `UserInstallation` join model:

```text
User ──< UserInstallation >── GitHubInstallation ──< Repository
```

This supports several installations per user and leaves room for several dashboard users to be associated with the same organization installation later. The Phase 2 flow does not implement organization roles or invitations.

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
- repository configuration persistence
- organization roles, invitations, and multi-user permissions
- notifications, billing, analytics tracking, MCP, or Marketplace publication

The next phase should establish AWS account onboarding and repository-specific execution configuration without yet collapsing the boundary between this control plane and `semantic-terraform-agent`.
