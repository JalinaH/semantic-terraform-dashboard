# Hosted worker

The worker is a separate control-plane process. It atomically claims `QUEUED`
`AgentRun` rows from PostgreSQL, downloads bounded GitHub Actions evidence,
checks out the exact failing revision in a disposable directory and invokes the
pinned Python agent CLI. It selects local verification when AWS is absent and
full verification after a repository role is connected.
The configured job deadline covers that complete sequence, not only the Python
child process. Progress and heartbeats are persisted on the run, and a worker
recovers expired `RUNNING` claims as safe failures after a short grace period.
After a completed run is persisted, the same process separately claims pending
PR publications and creates or updates one marked GitHub App comment. A comment
failure never changes the completed agent-run outcome.

Diagnosis never pushes or commits. A separate confirmed `PatchApplication` job
can create one non-force bot commit after exact-head, hash, file-scope, and fresh
Terraform verification checks. A fully verified request must remain fully
verified. A conditionally approved local request must remain locally validated
with no plan requested. An explicitly approved environment-blocked request may
continue only on fresh full success or the same deterministic environmental
class and reason. The worker invokes the pinned agent's plan classifier only in
full mode; a semantic, unknown, invalid, or changed result stops before commit.
Neither job applies infrastructure or persists
GitHub/AWS/model credentials. The Python engine remains in
`semantic-terraform-agent` and is installed from the immutable v1.2.0 commit
supplied as `SEMANTIC_TERRAFORM_AGENT_SOURCE` at image-build time. The Dockerfile
has no mutable or stale source default and rejects a missing build argument.

Each queued run contains an immutable model-policy snapshot. Fixed policy adds
`--model-routing fixed` and the validated model ID. Auto Optimize writes the
snapshotted, TerraFix-filtered registry to a mode-0600 temporary JSON file and
adds `--model-routing auto`, `--max-model-tier`, and `--model-registry`. The
worker owns `OPENROUTER_API_KEY`; repository users never provide gateway keys.

## Local process

Install the Python agent and Terraform on the host, configure the server/worker
environment described in `.env.example`, then run:

```bash
pnpm worker
```

Process a maximum of one queued run with `pnpm worker:once`. Build and inspect
the production bundle with:

```bash
pnpm worker:build
pnpm worker:health
```

## Container

```bash
docker build -f worker/Dockerfile \
  --build-arg SEMANTIC_TERRAFORM_AGENT_SOURCE='git+https://github.com/JalinaH/semantic-terraform-agent.git@<agent-v1.2.0-commit>' \
  -t terrafix-worker:1.2.0 .
```

The container pins Node 22, Terraform 1.15.7, and Semantic Terraform Agent
v1.2.0. The image build inspects Python package metadata, and normal worker
startup repeats that version check before polling. Package metadata is the
authoritative installed-version check.

The MVP image intentionally provides one Terraform version. A repository whose
saved version differs from 1.15.7 fails safely with
`terraform_version_unavailable`; deploy a compatible image before enabling it.
Production must provide database, GitHub App, and OpenRouter configuration
through the deployment secret store. AWS workload identity is optional and is
used only for repositories with Cloud Verification connected; local children
receive no AWS credential variables.

The Docker health check runs the process-only worker health command. It reports
configuration completeness without calling PostgreSQL, GitHub, AWS, or
OpenRouter. Normal startup performs the strict configuration and agent-version
checks.
