# TerraFix architecture

TerraFix is the hosted control plane and observability product. It owns authenticated GitHub installation access, repository configuration, AWS cross-account onboarding, webhook/worker orchestration, durable `AgentRun` records, PR publication, and authorized usage analytics.

`semantic-terraform-agent` remains the inference and verification engine. Semantic Terraform Agent v1.0.0 collects bounded Terraform evidence, builds deterministic context, optionally retrieves/slices provider schema, routes model calls, proposes candidates, and verifies patches in isolation. The dashboard does not perform Terraform reasoning.

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
