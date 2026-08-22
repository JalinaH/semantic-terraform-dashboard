import { createHash } from "node:crypto";
import { STARTER_VERIFICATION_ACTIONS } from "@/lib/aws/policies";
import { iamPrincipalArnSchema } from "@/lib/validation/aws-connection";

export interface CloudFormationTemplateInput {
  trustedPrincipalArn: string;
  externalId: string;
  repositoryId: string;
  repositoryFullName: string;
}

export function getVerificationRoleName(repositoryId: string) {
  const suffix = createHash("sha256").update(repositoryId).digest("hex").slice(0, 10);
  return `SemanticTerraformAgentVerificationRole-${suffix}`;
}

export function sanitizeCloudFormationTag(value: string) {
  return value.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 256);
}

export function generateCloudFormationTemplate(input: CloudFormationTemplateInput) {
  const principal = iamPrincipalArnSchema.parse(input.trustedPrincipalArn);
  if (!input.externalId.trim()) throw new Error("An external ID is required.");
  const roleName = getVerificationRoleName(input.repositoryId);
  const repositoryTag = sanitizeCloudFormationTag(input.repositoryFullName);
  const actions = STARTER_VERIFICATION_ACTIONS.map((action) => `                  - ${action}`).join("\n");

  return `AWSTemplateFormatVersion: "2010-09-09"
Description: >-
  Creates the repository-scoped IAM role used by TerraFix for
  temporary, read-oriented Terraform plan verification.
Resources:
  VerificationRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: ${roleName}
      Description: Repository-scoped role for TerraFix verification
      MaxSessionDuration: 3600
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              AWS: ${yamlString(principal)}
            Action: sts:AssumeRole
            Condition:
              StringEquals:
                sts:ExternalId: ${yamlString(input.externalId)}
      Policies:
        - PolicyName: SemanticTerraformAgentStarterVerification
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Sid: TerraformPlanReadOnlyStarter
                Effect: Allow
                Action:
${actions}
                Resource: "*"
      Tags:
        - Key: ManagedBy
          Value: SemanticTerraformAgent
        - Key: Repository
          Value: ${yamlString(repositoryTag)}
Outputs:
  RoleArn:
    Description: Paste this role ARN into the TerraFix dashboard.
    Value: !GetAtt VerificationRole.Arn
`;
}

function yamlString(value: string) {
  return JSON.stringify(value);
}

export function buildCloudFormationQuickCreateUrl(templateUrl: string, stackName: string, region: string) {
  const template = new URL(templateUrl);
  if (template.protocol !== "https:") throw new Error("CloudFormation template URLs must use HTTPS.");
  if (!/^[A-Za-z][A-Za-z0-9-]{0,127}$/.test(stackName)) throw new Error("Invalid CloudFormation stack name.");
  const url = new URL(`https://${region}.console.aws.amazon.com/cloudformation/home`);
  url.searchParams.set("region", region);
  url.hash = `/stacks/create/review?templateURL=${encodeURIComponent(template.toString())}&stackName=${encodeURIComponent(stackName)}`;
  return url.toString();
}
