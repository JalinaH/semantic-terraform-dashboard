# TerraFix architecture

TerraFix is the hosted control plane and observability product.
`semantic-terraform-agent` v1.1.4 is the separate inference and Terraform
verification engine. The Next.js dashboard never performs Terraform reasoning
and never runs a persistent worker inside Vercel.

```text
Developer Terraform PR
        ↓
GitHub Actions: normal Terraform CI
        ↓ completed failure
GitHub App workflow_run webhook
        ↓ raw HMAC + delivery idempotency
TerraFix control plane (Vercel)
        ├── Auth.js / App installation / repository synchronization
        ├── repository + AWS + model policy configuration
        ├── analytics and run views
        └── PostgreSQL WebhookDelivery + AgentRun queue
                                      ↓ atomic claim
TerraFix worker (AWS ECS Fargate)
        ├── bounded Actions evidence + exact disposable checkout
        ├── STS AssumeRole with repository External ID
        └── Semantic Terraform Agent v1.1.4
              ├── Verified Failure Memory
              ├── deterministic minimal context
              ├── server-bounded model routing
              ├── OpenRouter
              ├── provider-schema slicing
              └── isolated Terraform verification
                                      ↓ safe structured result
PostgreSQL normalized telemetry + verified-patch provenance
        ├── idempotent PR comment
        ├── run detail
        ├── usage analytics
        └── explicit human approval
                    ↓ durable PatchApplication claim
        fresh exact-SHA checkout → exact patch/hash/file checks
                    ↓ fresh Terraform verification, 0 LLM calls
        one bot commit → non-force PR-head push → normal CI
```

## Runtime boundaries

The Vercel process handles short request/response operations only. Webhook
verification/filtering may query GitHub and insert a durable queue row, then
returns. Auth callbacks, AWS STS verification, catalog reads, CloudFormation
download, and analytics are stateless server operations. They do not depend on
local files, shared memory, Docker, Python, Git, or Terraform.

The worker is an independently deployable process started with `pnpm worker` or
the worker container. PostgreSQL is its only coordination mechanism with the
dashboard. It claims the oldest queued row with `FOR UPDATE SKIP LOCKED`, writes
stages/heartbeats, enforces a complete-job deadline, and always cleans the
temporary workspace. Stale claims fail conservatively after the timeout plus a
grace period and are not retried forever.

## Trust and authorization flow

The signed-in user is linked to one or more GitHub App installations. Every
repository page, action, run query, publication request, and usage filter scopes
through those links. A repository ID supplied in a URL or form is never treated
as authorization.

Webhook deliveries are authenticated by GitHub, then matched to the persisted
installation/repository identity. Dispatch additionally requires active access,
valid configuration, verified AWS, valid model policy, enabled TerraFix, a
configured failed workflow, a Terraform path change, and a trusted same-repo
PR/direct push. Fork PRs are rejected before privileged work.

## GitHub and publication

The App requests Metadata read, Actions read, Contents write, and Pull requests
write. The only subscribed event is `workflow_run`. Installation tokens are
temporary. The worker uses them to read workflow jobs/logs, PR/commit metadata,
and the exact revision. The publication worker creates or updates one marked bot
issue comment. Contents write is exercised only by a confirmed PatchApplication
against a same-repository PR branch.

Publication has a separate durable lifecycle. GitHub failure cannot change a
completed diagnosis. A newer completed run owns the PR comment, preventing an
older slow run from overwriting it.

## AWS and model boundaries

AWS onboarding stores a role ARN, random External ID, region, verified account,
and status—not customer access keys. Dashboard verification and worker execution
use STS through the deployed control-plane identity. Temporary role credentials
exist only in worker memory and the allowlisted child environment.

The OpenRouter catalog stores bounded public metadata. TerraFix's versioned
policy—not OpenRouter—assigns FREE/ECONOMY/BALANCED/PREMIUM tiers. Unknown models
remain disabled. Repository policy is validated server-side and snapshotted on
the AgentRun so later catalog changes cannot silently rewrite run intent.
TerraFix owns the OpenRouter key; repositories do not.

## Result and analytics data

The agent result is schema-validated, bounded, and redacted. Agent v1.1.4's
verification assessment is normalized separately from the diagnosis: outcome,
pre-plan stage booleans, plan attempt/pass, apply safety, mutation eligibility
level, and bounded plan classification/reason/source metadata. Normalized nullable
columns support LLM calls, token categories, Decimal provider cost,
completeness, latency, requested/reported model, routing/context/schema
progression, reductions, and Verified Failure Memory. Explicit zero is distinct
from null.

Analytics read selected normalized fields, bucket dates in UTC, and perform
Decimal-safe cost arithmetic. Missing cost/token rows are excluded from their
sums and disclosed through completeness counts; they are never converted to
zero. Verification excludes infrastructure failures from its completed
diagnosable denominator. Repository/model filters remain authorization-scoped.

Raw prompts, full repository source, provider schemas, Terraform state, raw
failure logs, environment dumps, and credentials are not analytics inputs.

## Apply trust boundary

Diagnosis is read-only. Source mutation requires a v1.1 artifact,
explicit authenticated approval bound to patch/head SHA, current installation
Contents Write, a same-repository open PR, exact head freshness, independent
file-scope checks, and fresh deterministic verification. Fully verified requests
must pass fresh plan again. Environment-blocked conditional requests require a
separate explicit warning acceptance and may proceed only if the fresh result is
fully verified or matches the same confidently external class and reason.
Semantic, unknown, invalid, and inconsistent outcomes fail closed. The asynchronous
worker creates one non-force bot commit; it never merges. There is no execution
path for Terraform apply/destroy/import/taint. Verification remains evidence,
not proof of developer intent or production safety.
