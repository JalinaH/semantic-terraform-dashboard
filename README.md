# Semantic Terraform Agent Dashboard

The hosted dashboard and control-plane foundation for **Semantic Terraform Agent**. It presents repository configuration, diagnosis runs, candidate patches, verification evidence, and performance metadata without duplicating the agent engine.

## Repository boundary

The product is intentionally split into two repositories:

```text
semantic-terraform-agent
└── Reusable Python diagnosis and verification engine, CLI, GitHub Actions integration,
    Gemini reasoning, isolated Terraform checks, bounded repair, and PR comments

semantic-terraform-dashboard
└── Hosted SaaS interface and future control plane for onboarding, configuration,
    run ingestion, history, and analytics
```

No Python agent code is copied into this repository. Phase 1 uses typed mock data and does not invoke the engine.

## Phase 1 capabilities

- Responsive landing page and authenticated-style application shell
- Overview metrics, recent run history, and repository health
- Repository list and preview configuration screens
- Filter-ready run table and result-oriented run detail visualization
- Unified diff presentation, ordered verification stages, and bounded attempt history
- Light, dark, and system themes with persisted browser preference
- PostgreSQL-ready Prisma schema and a development-safe Prisma singleton
- Strict TypeScript types for repository, context, status, stage, run, and performance data

## Intentionally not implemented

- Authentication or multi-user permissions
- GitHub OAuth, GitHub App installation, or webhooks
- AWS AssumeRole or CloudFormation onboarding
- Worker execution, job queues, or Python agent invocation
- Persistent run ingestion or PR comments
- Billing, email, product analytics, or production deployment

These integrations belong to later phases. Controls that depend on them are disabled or marked **Coming later**.

## Technology

- Next.js App Router with React and strict TypeScript
- Tailwind CSS with semantic CSS-variable tokens
- shadcn/ui-style local components and Lucide icons
- Prisma ORM targeting PostgreSQL
- `next-themes` for light, dark, and system appearance
- pnpm package management

## Local development

Requirements: Node.js 20.9 or newer and pnpm.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The dashboard is available at [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

The Phase 1 UI is entirely backed by `lib/mock-data.ts`; PostgreSQL is optional for previewing every route.

## Optional Prisma setup

Copy the environment template only when you want to validate or evolve the database layer:

```bash
cp .env.example .env
pnpm prisma:generate
pnpm prisma:validate
```

Set `DATABASE_URL` to a local PostgreSQL database before migrations or database queries. The committed example contains development placeholders only. Permanent AWS access keys are never part of this data model.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm prisma:validate
pnpm build
git diff --check
```

## Phase 2 starting point

Start with GitHub identity and installation boundaries rather than agent execution:

1. Add GitHub OAuth for dashboard identity.
2. Create the GitHub App with least-privilege repository metadata, Actions, checks, pull request, and contents permissions appropriate to the planned workflow.
3. Implement the installation callback and sync `GitHubInstallation` plus `Repository` records.
4. Add explicit installation-state and permission-review screens.
5. Only after onboarding is stable, add signed webhook ingestion and a durable job boundary that calls the separate Python agent service.

Keep GitHub credentials server-only and preserve the current engine/control-plane separation.
