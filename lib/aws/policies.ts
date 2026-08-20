import { iamPrincipalArnSchema } from "@/lib/validation/aws-connection";

export interface IamPolicyDocument {
  Version: "2012-10-17";
  Statement: Array<Record<string, unknown>>;
}

export const STARTER_VERIFICATION_ACTIONS = [
  "ec2:Describe*",
  "s3:GetBucketLocation",
  "s3:GetBucketPolicyStatus",
  "s3:GetBucketVersioning",
  "s3:GetEncryptionConfiguration",
  "s3:ListAllMyBuckets",
  "s3:ListBucket",
  "dynamodb:DescribeTable",
  "dynamodb:DescribeContinuousBackups",
  "dynamodb:DescribeTimeToLive",
  "dynamodb:ListTagsOfResource",
  "iam:GetRole",
  "iam:GetRolePolicy",
  "iam:ListAttachedRolePolicies",
  "iam:ListRolePolicies",
  "kms:DescribeKey",
  "kms:ListAliases",
] as const;

export function generateTrustPolicy(trustedPrincipalArn: string, externalId: string): IamPolicyDocument {
  const principal = iamPrincipalArnSchema.parse(trustedPrincipalArn);
  if (!externalId.trim()) throw new Error("An external ID is required.");
  return {
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: { AWS: principal },
      Action: "sts:AssumeRole",
      Condition: { StringEquals: { "sts:ExternalId": externalId } },
    }],
  };
}

export function generateStarterVerificationPolicy(): IamPolicyDocument {
  return {
    Version: "2012-10-17",
    Statement: [{
      Sid: "TerraformPlanReadOnlyStarter",
      Effect: "Allow",
      Action: [...STARTER_VERIFICATION_ACTIONS],
      Resource: "*",
    }],
  };
}
