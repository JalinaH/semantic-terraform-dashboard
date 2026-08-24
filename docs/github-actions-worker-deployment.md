# GitHub Actions worker deployment

The production worker can be built on GitHub-hosted infrastructure and pushed
directly to ECR, so a developer does not upload container layers from a local
internet connection. `.github/workflows/deploy-worker.yml` uses GitHub OIDC to
obtain short-lived AWS credentials, builds Linux/ARM64 with BuildKit's GitHub
cache, pushes an immutable agent/dashboard commit tag, copies the running
service's task definition, changes the worker image and its declared agent
version, and waits for ECS service stability.

No AWS access-key secret belongs in GitHub.

## 1. Add the GitHub OIDC provider to AWS

In IAM, open **Identity providers**, choose **Add provider**, and configure:

- Provider type: OpenID Connect
- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

This is an account-level one-time operation. Reuse an existing provider when it
already has the same URL and audience.

## 2. Create the deployment role

Create an IAM role named `TerraFixGitHubWorkerDeployRole` with this trust policy.
Keep the subject restricted to the production branch:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::499591338187:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:JalinaH/semantic-terraform-dashboard:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

Attach a least-privilege policy. Replace the ECR repository, ECS cluster/service,
task role, and execution role ARNs when their names differ:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrAuthorization",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "PushWorkerImage",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchGetImage",
        "ecr:BatchCheckLayerAvailability",
        "ecr:CompleteLayerUpload",
        "ecr:GetDownloadUrlForLayer",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      ],
      "Resource": "arn:aws:ecr:us-east-1:499591338187:repository/semantic-terraform-worker"
    },
    {
      "Sid": "DeployEcsService",
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition",
        "ecs:UpdateService"
      ],
      "Resource": "*"
    },
    {
      "Sid": "PassOnlyWorkerRoles",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::499591338187:role/SemanticTerraformAgentWorkerTaskRole",
        "arn:aws:iam::499591338187:role/SemanticTerraformAgentWorkerExecutionRole"
      ],
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "ecs-tasks.amazonaws.com"
        }
      }
    }
  ]
}
```

`ecs:RegisterTaskDefinition` does not support resource-level restriction, which
is why the ECS statement uses `Resource: "*"`. `iam:PassRole` remains restricted
to the two worker roles.

## 3. Configure GitHub repository variables

Open the GitHub repository, then **Settings → Secrets and variables → Actions →
Variables**. Add:

| Variable | Example |
| --- | --- |
| `AWS_ACCOUNT_ID` | `499591338187` |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::499591338187:role/TerraFixGitHubWorkerDeployRole` |
| `AWS_REGION` | `us-east-1` |
| `ECR_REPOSITORY` | `semantic-terraform-worker` |
| `ECS_CLUSTER` | exact ECS cluster name |
| `ECS_SERVICE` | exact ECS service name |
| `ECS_CONTAINER_NAME` | exact worker container name, commonly `worker` |

These values are resource identifiers, not credentials. The workflow needs no
GitHub Actions secrets for AWS.

## 4. Connect agent releases

`semantic-terraform-agent/.github/workflows/release.yml` validates each pushed
`v1.x.y` tag, runs Ruff and pytest, builds release artifacts, creates the GitHub
Release, and sends a `semantic-terraform-agent-released` repository-dispatch
event. `notify-dashboard-release.yml` provides the same dispatch when a release
is created manually. Create a fine-grained personal access token
with access only to `JalinaH/semantic-terraform-dashboard` and **Contents: Read
and write**, then store it in the agent repository's Actions secrets as:

```text
DASHBOARD_DISPATCH_TOKEN
```

The token is used only to create the cross-repository dispatch. It is never
passed to Docker, AWS, ECS, the worker, or the dashboard runtime. A dedicated
GitHub App installation token can replace it later if desired.

After this one-time setup, the operator release sequence is only:

```bash
git tag v1.1.4
git push origin v1.1.4
```

Do not manually create another release for that tag; the tag workflow creates
it with generated notes and attaches the wheel/source artifacts. The dashboard
resolves the release tag independently and requires all three
values to agree:

- stable release tag such as `v1.1.4`;
- package version in the released `pyproject.toml`;
- immutable 40-character release commit SHA.

Only `v1.x.y` releases deploy automatically. A future `v2.0.0` must first update
and validate the dashboard ingestion contract.

## 5. Deploy

Push a dashboard commit to `main` that changes worker/runtime inputs, publish a
stable release in the agent repository, or open **Actions → Deploy worker to
ECS → Run workflow**. Dashboard builds use the latest stable agent release;
release-triggered builds use and verify the dispatched release. The first cloud
build downloads all base layers. Later builds reuse GitHub's BuildKit cache.
ECR also deduplicates layers.

The ECS task definition remains the source of truth for Secrets Manager
references and runtime variables. The workflow never reads secret values. It
changes only the selected container image and
`SEMANTIC_TERRAFORM_AGENT_VERSION`.

The ECS service is intentionally provisioned once. Each deployment registers a
new immutable task-definition revision and updates that existing service;
creating another service for every release would duplicate workers and cost.

For rollback, update the ECS service to a previous task-definition revision or
rerun a known-good commit through `workflow_dispatch`.
