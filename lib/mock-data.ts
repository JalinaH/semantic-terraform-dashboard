import type { AgentRun, Metric, Repository, VerificationStep } from "@/lib/types";

const verifiedSteps: VerificationStep[] = [
  { name: "patch_check", label: "Patch check", status: "passed", detail: "Unified diff is bounded to Terraform files." },
  { name: "patch_apply", label: "Patch apply", status: "passed", detail: "Patch applied cleanly in the isolated workspace." },
  { name: "fmt", label: "Terraform fmt", status: "passed", detail: "Formatting check passed." },
  { name: "init", label: "Terraform init", status: "passed", detail: "Providers initialized from the lock file." },
  { name: "validate", label: "Terraform validate", status: "passed", detail: "Configuration is syntactically valid." },
  { name: "plan", label: "Terraform plan", status: "passed", detail: "Original semantic failure is resolved." },
];

const unavailableSteps: VerificationStep[] = [
  { name: "patch_check", label: "Patch check", status: "passed" },
  { name: "patch_apply", label: "Patch apply", status: "passed" },
  { name: "fmt", label: "Terraform fmt", status: "passed" },
  { name: "init", label: "Terraform init", status: "failed", detail: "Provider registry was unavailable." },
  { name: "validate", label: "Terraform validate", status: "skipped" },
  { name: "plan", label: "Terraform plan", status: "skipped" },
];

export const repositories: Repository[] = [
  {
    id: "repo-platform-infra",
    owner: "acme-platform",
    name: "cloud-foundation",
    fullName: "acme-platform/cloud-foundation",
    defaultBranch: "main",
    enabled: true,
    terraformDir: "infra/production",
    terraformVersion: "1.9.8",
    awsStatus: "connected",
    awsRegion: "us-east-1",
    roleArn: "arn:aws:iam::••••••••4821:role/stfa-verification",
    model: "gemini-2.5-pro",
    contextMode: "smart",
    maxRepairAttempts: 1,
    lastAnalyzed: "2026-08-18T06:42:00.000Z",
    lastRunStatus: "verified_after_retry",
    status: "healthy",
  },
  {
    id: "repo-commerce-api",
    owner: "acme-commerce",
    name: "orders-infrastructure",
    fullName: "acme-commerce/orders-infrastructure",
    defaultBranch: "main",
    enabled: true,
    terraformDir: "terraform",
    terraformVersion: "1.9.8",
    awsStatus: "connected",
    awsRegion: "eu-west-1",
    roleArn: "arn:aws:iam::••••••••9314:role/stfa-verification",
    model: "gemini-2.5-pro",
    contextMode: "smart",
    maxRepairAttempts: 1,
    lastAnalyzed: "2026-08-17T15:18:00.000Z",
    lastRunStatus: "verified_first_attempt",
    status: "healthy",
  },
  {
    id: "repo-data-platform",
    owner: "northstar-labs",
    name: "data-platform",
    fullName: "northstar-labs/data-platform",
    defaultBranch: "trunk",
    enabled: true,
    terraformDir: "envs/staging",
    terraformVersion: "1.8.5",
    awsStatus: "attention",
    awsRegion: "us-west-2",
    model: "gemini-2.5-flash",
    contextMode: "minimal",
    maxRepairAttempts: 1,
    lastAnalyzed: "2026-08-16T09:31:00.000Z",
    lastRunStatus: "verification_failed",
    status: "attention",
  },
  {
    id: "repo-docs-site",
    owner: "acme-developer",
    name: "docs-infrastructure",
    fullName: "acme-developer/docs-infrastructure",
    defaultBranch: "main",
    enabled: false,
    terraformDir: "infra",
    terraformVersion: "1.9.8",
    awsStatus: "not_connected",
    model: "gemini-2.5-flash",
    contextMode: "smart",
    maxRepairAttempts: 1,
    status: "disabled",
  },
];

export const runs: AgentRun[] = [
  {
    id: "run-1842",
    repositoryId: "repo-platform-infra",
    repositoryFullName: "acme-platform/cloud-foundation",
    pullRequestNumber: 284,
    commitSha: "c14a7f9021dbf83a66cc57a4c0de193ab22656e9",
    failedStage: "terraform plan",
    affectedResource: "aws_ebs_volume.database",
    contextMode: "smart",
    verificationStatus: "verified_after_retry",
    totalRuntimeMs: 48200,
    createdAt: "2026-08-18T06:42:00.000Z",
    diagnosis: {
      rootCause: "The volume sets throughput on a gp2 EBS volume. AWS only accepts the throughput argument for gp3 volumes.",
      affectedResources: ["aws_ebs_volume.database"],
      violatedConstraint: "throughput is configurable only when volume_type is gp3",
      modelConfidence: 0.96,
      evidenceScore: 0.92,
    },
    suggestedPatch: `diff --git a/infra/production/database.tf b/infra/production/database.tf
index 3d45b91..5aaf2e1 100644
--- a/infra/production/database.tf
+++ b/infra/production/database.tf
@@ -18,7 +18,7 @@ resource "aws_ebs_volume" "database" {
   availability_zone = var.availability_zone
   size              = 250
-  type              = "gp2"
+  type              = "gp3"
   throughput        = 250
   encrypted         = true
 }`,
    verificationSteps: verifiedSteps,
    attempts: [
      {
        attempt: 1,
        title: "Initial candidate",
        summary: "Changed the EBS volume type to gp3 and normalized an adjacent expression.",
        status: "failed",
        failureReason: "terraform fmt detected an unformatted conditional expression.",
        steps: [
          { name: "patch_check", label: "Patch check", status: "passed" },
          { name: "patch_apply", label: "Patch apply", status: "passed" },
          { name: "fmt", label: "Terraform fmt", status: "failed", detail: "infra/production/database.tf requires formatting." },
          { name: "init", label: "Terraform init", status: "skipped" },
          { name: "validate", label: "Terraform validate", status: "skipped" },
          { name: "plan", label: "Terraform plan", status: "skipped" },
        ],
      },
      {
        attempt: 2,
        title: "Bounded repair",
        summary: "Removed the unrelated formatting change and retained only the semantic fix.",
        status: "verified",
        steps: verifiedSteps,
      },
    ],
    performance: {
      collectionMs: 3200,
      schemaMs: 1800,
      llmMs: 12600,
      verificationMs: 30600,
      totalMs: 48200,
      inputTokens: 7842,
      outputTokens: 1168,
    },
  },
  {
    id: "run-1839",
    repositoryId: "repo-commerce-api",
    repositoryFullName: "acme-commerce/orders-infrastructure",
    pullRequestNumber: 91,
    commitSha: "8f1c0e4ca58257354e8dc3ef56af13a9f1df6278",
    failedStage: "terraform validate",
    affectedResource: "aws_dynamodb_table.orders",
    contextMode: "smart",
    verificationStatus: "verified_first_attempt",
    totalRuntimeMs: 31700,
    createdAt: "2026-08-17T15:18:00.000Z",
    diagnosis: {
      rootCause: "The declared HASH key does not have a matching attribute definition.",
      affectedResources: ["aws_dynamodb_table.orders"],
      violatedConstraint: "Every key_schema attribute must be declared in an attribute block.",
      modelConfidence: 0.98,
      evidenceScore: 0.96,
    },
    suggestedPatch: `diff --git a/terraform/orders.tf b/terraform/orders.tf
index 90c4be1..29f18b0 100644
--- a/terraform/orders.tf
+++ b/terraform/orders.tf
@@ -6,6 +6,11 @@ resource "aws_dynamodb_table" "orders" {
   hash_key     = "order_id"

+  attribute {
+    name = "order_id"
+    type = "S"
+  }
+
   billing_mode = "PAY_PER_REQUEST"
 }`,
    verificationSteps: verifiedSteps,
    attempts: [{ attempt: 1, title: "Initial candidate", summary: "Added the missing key attribute definition.", status: "verified", steps: verifiedSteps }],
    performance: { collectionMs: 2900, schemaMs: 1600, llmMs: 9700, verificationMs: 17500, totalMs: 31700, inputTokens: 6218, outputTokens: 784 },
  },
  {
    id: "run-1833",
    repositoryId: "repo-data-platform",
    repositoryFullName: "northstar-labs/data-platform",
    commitSha: "73de91acc2546c648b8f746c7851ab1756b9981b",
    failedStage: "terraform init",
    affectedResource: "aws_s3_bucket.assets",
    contextMode: "minimal",
    verificationStatus: "verification_unavailable",
    totalRuntimeMs: 22400,
    createdAt: "2026-08-16T09:31:00.000Z",
    diagnosis: {
      rootCause: "The configured provider could not be initialized in the isolated workspace.",
      affectedResources: ["aws_s3_bucket.assets"],
      violatedConstraint: "Provider initialization is required before semantic verification.",
      modelConfidence: 0.71,
      evidenceScore: 0.62,
    },
    suggestedPatch: `diff --git a/envs/staging/assets.tf b/envs/staging/assets.tf
index 473abbc..fd4216a 100644
--- a/envs/staging/assets.tf
+++ b/envs/staging/assets.tf
@@ -2,7 +2,7 @@ resource "aws_s3_bucket" "assets" {
-  bucket = "Assets_Bucket"
+  bucket = "assets-bucket"
 }`,
    verificationSteps: unavailableSteps,
    attempts: [{ attempt: 1, title: "Initial candidate", summary: "Normalized the invalid S3 bucket name.", status: "failed", failureReason: "Provider initialization was unavailable.", steps: unavailableSteps }],
    performance: { collectionMs: 2100, schemaMs: 1300, llmMs: 8400, verificationMs: 10600, totalMs: 22400, inputTokens: 4206, outputTokens: 612 },
  },
  {
    id: "run-1828",
    repositoryId: "repo-platform-infra",
    repositoryFullName: "acme-platform/cloud-foundation",
    pullRequestNumber: 279,
    commitSha: "a887034876e13cb728f1e7773a1cfa769e96c504",
    failedStage: "terraform plan",
    affectedResource: "aws_iam_role.deploy",
    contextMode: "full",
    verificationStatus: "patch_rejected",
    totalRuntimeMs: 18800,
    createdAt: "2026-08-15T12:04:00.000Z",
    diagnosis: {
      rootCause: "The candidate patch would alter an IAM trust policy outside the permitted repair boundary.",
      affectedResources: ["aws_iam_role.deploy"],
      violatedConstraint: "Repairs must remain scoped to the diagnosed resource argument.",
      modelConfidence: 0.82,
      evidenceScore: 0.79,
    },
    suggestedPatch: "# Candidate patch rejected before apply",
    verificationSteps: [
      { name: "patch_check", label: "Patch check", status: "failed", detail: "Patch exceeds the allowed file and resource boundary." },
      { name: "patch_apply", label: "Patch apply", status: "skipped" },
      { name: "fmt", label: "Terraform fmt", status: "skipped" },
      { name: "init", label: "Terraform init", status: "skipped" },
      { name: "validate", label: "Terraform validate", status: "skipped" },
      { name: "plan", label: "Terraform plan", status: "skipped" },
    ],
    attempts: [],
    performance: { collectionMs: 2400, schemaMs: 1700, llmMs: 14700, verificationMs: 0, totalMs: 18800, inputTokens: 10042, outputTokens: 1370 },
  },
  {
    id: "run-1821",
    repositoryId: "repo-commerce-api",
    repositoryFullName: "acme-commerce/orders-infrastructure",
    pullRequestNumber: 87,
    commitSha: "639edbcd3d6bb294416d419a9ac98d7cd4d6ca9f",
    failedStage: "terraform plan",
    affectedResource: "aws_sqs_queue.fulfillment",
    contextMode: "smart",
    verificationStatus: "verification_failed",
    totalRuntimeMs: 41300,
    createdAt: "2026-08-14T08:22:00.000Z",
    diagnosis: {
      rootCause: "The proposed visibility timeout remains lower than the consumer function timeout.",
      affectedResources: ["aws_sqs_queue.fulfillment", "aws_lambda_function.consumer"],
      violatedConstraint: "SQS visibility timeout must be greater than or equal to the Lambda function timeout.",
      modelConfidence: 0.88,
      evidenceScore: 0.83,
    },
    suggestedPatch: "# Mock patch omitted for this historical run",
    verificationSteps: [{ name: "plan", label: "Terraform plan", status: "failed", detail: "Original semantic constraint remains violated." }],
    attempts: [],
    performance: { collectionMs: 3200, schemaMs: 1900, llmMs: 12100, verificationMs: 24100, totalMs: 41300, inputTokens: 8129, outputTokens: 1003 },
  },
];

export const dashboardMetrics: Metric[] = [
  { title: "Repositories", value: "4", description: "3 actively monitored", trend: "+1 this month" },
  { title: "Agent runs", value: "128", description: "12 in the last 7 days", trend: "14.2% more activity" },
  { title: "Verified fixes", value: "96", description: "Evidence-backed candidates", trend: "8 required one repair" },
  { title: "Verification rate", value: "75.0%", description: "Across all completed runs", trend: "+3.8% from last month" },
];

export function getRepository(id: string) {
  return repositories.find((repository) => repository.id === id);
}

export function getRun(id: string) {
  return runs.find((run) => run.id === id);
}

export function getRunsForRepository(repositoryId: string) {
  return runs.filter((run) => run.repositoryId === repositoryId);
}
