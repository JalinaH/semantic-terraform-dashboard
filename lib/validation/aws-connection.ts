import { z } from "zod";
import { AWS_REGION_VALUES } from "@/lib/aws/regions";

export const repositoryIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
export const awsRegionSchema = z.enum(AWS_REGION_VALUES, { error: "Choose a supported AWS region." });

const IAM_ROLE_ARN_PATTERN = /^arn:aws:iam::(\d{12}):role\/([A-Za-z0-9+=,.@_/-]+)$/;
const IAM_PRINCIPAL_ARN_PATTERN = /^arn:aws:iam::\d{12}:(?:role\/[A-Za-z0-9+=,.@_/-]+|root)$/;

export const iamRoleArnSchema = z
  .string()
  .trim()
  .max(2048)
  .regex(IAM_ROLE_ARN_PATTERN, "Enter an IAM role ARN such as arn:aws:iam::123456789012:role/RoleName.")
  .superRefine((value, context) => {
    const rolePath = IAM_ROLE_ARN_PATTERN.exec(value)?.[2];
    if (!rolePath || rolePath.split("/").some((segment) => !segment)) {
      context.addIssue({ code: "custom", message: "The IAM role path is malformed." });
      return;
    }
    const roleName = rolePath.split("/").at(-1);
    if (!roleName || roleName.length > 64) {
      context.addIssue({ code: "custom", message: "The IAM role name must be 64 characters or fewer." });
    }
  });

export const iamPrincipalArnSchema = z.string().trim().regex(
  IAM_PRINCIPAL_ARN_PATTERN,
  "AWS_ASSUME_ROLE_PRINCIPAL_ARN must be an IAM role or account-root ARN.",
);

export function parseIamRoleArn(roleArn: string) {
  const parsed = iamRoleArnSchema.parse(roleArn);
  const match = IAM_ROLE_ARN_PATTERN.exec(parsed)!;
  const rolePath = match[2];
  return {
    roleArn: parsed,
    accountId: match[1],
    rolePath,
    roleName: rolePath.split("/").at(-1)!,
  };
}

export const awsRegionInputSchema = z.object({ region: awsRegionSchema });
export const awsRoleInputSchema = z.object({ roleArn: iamRoleArnSchema });
