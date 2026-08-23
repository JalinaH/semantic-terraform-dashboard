# TerraFix demo consumer repository

Use a dedicated repository that is separate from both
`semantic-terraform-dashboard` and `semantic-terraform-agent`. Grant only that
repository to the TerraFix GitHub App and use a non-production AWS account with
read/plan permissions.

## Safe baseline

- `main` contains valid Terraform.
- Terraform state, if required, is isolated from production.
- CI runs `fmt -check`, `init`, `validate`, and `plan` only.
- CI never runs `apply`, `destroy`, `import`, or `taint`.
- The demo branch introduces one known semantic failure at a time.

Example `.github/workflows/terraform.yml`:

```yaml
name: Terraform CI

on:
  pull_request:
    paths:
      - "terraform/**/*.tf"
      - "terraform/**/*.tf.json"

permissions:
  contents: read

jobs:
  plan:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: terraform
    steps:
      - uses: actions/checkout@v6
      - uses: hashicorp/setup-terraform@v4
        with:
          terraform_version: 1.15.7
      - run: terraform fmt -check -recursive
      - run: terraform init -input=false
      - run: terraform validate
      - run: terraform plan -input=false -lock=false -no-color
```

Pin third-party actions to reviewed commit SHAs in a real production repository.
The example intentionally has no TerraFix action, model key, customer-role GitHub
secret, or apply step.

A copyable version is available at
`examples/demo-repository/terraform-ci.yml`.

## Primary failure: DynamoDB hash key mismatch

Start with a valid table whose `hash_key` matches an `attribute` declaration.
On the demo branch, change only the attribute name (or only `hash_key`) so they
no longer match. The failure should occur during the repository's normal
Terraform validation/planning path and appear in GitHub Actions logs.

Optional independent cases:

- configure `throughput` on an `aws_ebs_volume` using `gp2` rather than `gp3`;
- set both `bucket` and `bucket_prefix` for the same S3 bucket resource.

Do not combine cases in one PR; a single clear failure makes run attribution and
telemetry easier to explain.

## AWS and TerraFix configuration

1. Install the GitHub App on only this repository.
2. Set Terraform root `terraform`, version `1.15.7`, workflow name
   `Terraform CI`, PR trigger enabled, and path `terraform/**/*.tf`.
3. Create the generated repository IAM role in the non-production AWS account.
4. Verify STS AssumeRole/GetCallerIdentity in TerraFix.
5. Select Auto Optimize, maximum tier FREE, and enable TerraFix.
6. Confirm the repository shows all five setup checks complete.

No `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, or AWS role secret belongs in this
consumer repository. The hosted worker owns its gateway credential and uses the
dashboard-stored role ARN plus External ID.

## Reset

Before a demo, close prior failure PRs or reset the dedicated demo branch to the
known valid `main`, then reapply the one failure commit and open/update a
same-repository PR. Do not force-reset unrelated branches. After the demo,
close the PR; TerraFix will not have changed the source repository.
