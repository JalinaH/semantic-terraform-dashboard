# Hosted worker

The worker is a separate control-plane process. It atomically claims `QUEUED`
`AgentRun` rows from PostgreSQL, downloads bounded GitHub Actions evidence,
checks out the exact failing revision in a disposable directory, assumes the
repository AWS role, and invokes the pinned Python agent CLI.
After a completed run is persisted, the same process separately claims pending
PR publications and creates or updates one marked GitHub App comment. A comment
failure never changes the completed agent-run outcome.

It never pushes, commits, applies Terraform, or persists GitHub/AWS/model
credentials. The Python engine remains in `semantic-terraform-agent` and is
installed from the exact commit configured in `worker/Dockerfile`.

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
docker build -f worker/Dockerfile -t semantic-terraform-worker:0.6.0 .
```

The container pins Node 22, Terraform 1.15.7, and the Python agent source
commit. Production should provide database, GitHub App, model, and workload AWS
configuration through the deployment secret store.
