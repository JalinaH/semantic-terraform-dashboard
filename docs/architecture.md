# TerraFix architecture

TerraFix is the hosted control plane and observability product. It owns authenticated GitHub installation access, repository configuration, AWS cross-account onboarding, webhook/worker orchestration, durable `AgentRun` records, PR publication, and authorized usage analytics.

`semantic-terraform-agent` remains the inference and verification engine. Semantic Terraform Agent v1.0.0 collects bounded Terraform evidence, builds deterministic context, optionally retrieves/slices provider schema, routes model calls, proposes candidates, and verifies patches in isolation. The dashboard does not perform Terraform reasoning.

Phase 8 analytics query only normalized scalar telemetry; raw safe result JSON, per-call JSON, patches, root causes, source, and schemas are not loaded for trend aggregation. The service applies GitHub-installation authorization before optional repository scoping, creates UTC daily buckets, performs Decimal-safe cost sums, and returns current/previous summaries with completeness counts. React pages render this service contract rather than embedding Prisma calculations.

Phase 9 model selection follows a separate server-controlled chain:

```text
OpenRouter models API
        ↓ validated public metadata
TerraFix catalog sync (last-known-good persistence)
        ↓ exact versioned config/model-policy.json classification
TerraFix access policy (FREE / PRO / ADVANCED)
        ↓ authenticated + repository-authorized validation
RepositoryConfig (AUTO or FIXED)
        ↓ immutable policy + registry snapshot at queue creation
AgentRun
        ↓ exact CLI flags and local registry JSON
hosted worker → semantic-terraform-agent v1.0.0
```

OpenRouter does not assign TerraFix tiers. Unknown models are unclassified and disabled; a FREE tier additionally requires authoritative zero prompt and completion pricing. The browser receives only bounded public catalog metadata plus allowed/locked state. Gateway credentials remain in the dashboard/worker secret boundary. Model access is a feature-policy record only—there are no billing, subscription, or payment models.

```text
GitHub/AWS → TerraFix control plane → isolated worker
                                      │
                                      ▼
                     semantic-terraform-agent v1.0.0
                         inference + verification
                                      │
                                      ▼
                     safe result + normalized telemetry
                                      │
                                      ▼
                 authorized TerraFix run and usage views
```

Usage queries are server-only and always scope `AgentRun` rows through GitHub installations linked to the authenticated dashboard user. Repository-specific queries authorize the repository before returning metrics. Aggregation reads normalized scalar columns and bounded call metadata, never the raw safe result payload or secrets.
