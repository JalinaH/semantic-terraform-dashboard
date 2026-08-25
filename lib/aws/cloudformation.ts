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
  return `TerraFixVerificationRole-${suffix}`;
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
        - PolicyName: TerraFixStarterVerification
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
          Value: TerraFix
        - Key: Repository
          Value: ${yamlString(repositoryTag)}
Outputs:
  RoleArn:
    Description: IAM role ARN for manual TerraFix onboarding and debugging.
    Value: !GetAtt VerificationRole.Arn
  TerraFixRoleArn:
    Description: IAM role ARN created for TerraFix verification.
    Value: !GetAtt VerificationRole.Arn
`;
}

function yamlString(value: string) {
  return JSON.stringify(value);
}

export function buildCloudFormationQuickCreateUrl(
  templateUrl: string,
  stackName: string,
  region: string,
  parameters: Record<string, string> = {},
) {
  const template = new URL(templateUrl);
  if (template.protocol !== "https:") throw new Error("CloudFormation template URLs must use HTTPS.");
  if (!/^[A-Za-z][A-Za-z0-9-]{0,127}$/.test(stackName)) throw new Error("Invalid CloudFormation stack name.");
  const url = new URL(`https://${region}.console.aws.amazon.com/cloudformation/home`);
  url.searchParams.set("region", region);
  const quickCreate = new URLSearchParams({ templateURL: template.toString(), stackName });
  for (const [name, value] of Object.entries(parameters)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,254}$/.test(name)) throw new Error("Invalid CloudFormation parameter name.");
    quickCreate.set(`param_${name}`, value);
  }
  url.hash = `/stacks/create/review?${quickCreate.toString()}`;
  return url.toString();
}

/**
 * Public, immutable, parameterized template for guided onboarding. It contains
 * no repository data or tokens; all session-specific values arrive through the
 * short-lived Quick Create URL.
 */
export function generateGuidedOnboardingTemplate() {
  const actions = STARTER_VERIFICATION_ACTIONS.map((action) => `                  - ${action}`).join("\n");
  return `AWSTemplateFormatVersion: "2010-09-09"
Description: Creates a least-privilege TerraFix verification role and reports it for STS verification.
Parameters:
  TrustedPrincipalArn:
    Type: String
    Description: TerraFix control-plane IAM principal.
    AllowedPattern: '^arn:aws:iam::[0-9]{12}:(role/[A-Za-z0-9+=,.@_/-]+|root)$'
  ExternalId:
    Type: String
    MinLength: 40
    MaxLength: 128
    AllowedPattern: '^[A-Za-z0-9_-]+$'
  RepositoryId:
    Type: String
    MinLength: 1
    MaxLength: 64
    AllowedPattern: '^[A-Za-z0-9_-]+$'
  RepositoryFullName:
    Type: String
    MinLength: 1
    MaxLength: 256
  OnboardingSessionId:
    Type: String
    MinLength: 1
    MaxLength: 64
    AllowedPattern: '^[A-Za-z0-9_-]+$'
  CallbackEndpoint:
    Type: String
    AllowedPattern: '^https://\\S+$'
  CallbackToken:
    Type: String
    MinLength: 40
    MaxLength: 128
    AllowedPattern: '^[A-Za-z0-9_-]+$'
  VerificationRoleName:
    Type: String
    MinLength: 1
    MaxLength: 64
    AllowedPattern: '^[A-Za-z0-9+=,.@_-]+$'
Resources:
  VerificationRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Ref VerificationRoleName
      Description: Repository-scoped role for TerraFix verification
      MaxSessionDuration: 3600
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              AWS: !Ref TrustedPrincipalArn
            Action: sts:AssumeRole
            Condition:
              StringEquals:
                sts:ExternalId: !Ref ExternalId
      Policies:
        - PolicyName: TerraFixStarterVerification
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
          Value: TerraFix
        - Key: Repository
          Value: !Ref RepositoryFullName
        - Key: TerraFixRepositoryId
          Value: !Ref RepositoryId
  CallbackExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      Policies:
        - PolicyName: TerraFixCallbackLogs
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action: logs:CreateLogGroup
                Resource: !Sub arn:aws:logs:\${AWS::Region}:\${AWS::AccountId}:*
              - Effect: Allow
                Action:
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                Resource: !Sub arn:aws:logs:\${AWS::Region}:\${AWS::AccountId}:log-group:/aws/lambda/*
  CallbackFunction:
    Type: AWS::Lambda::Function
    Properties:
      Description: Reports the TerraFix role ARN once during CloudFormation onboarding.
      Runtime: nodejs22.x
      Handler: index.handler
      Timeout: 60
      Role: !GetAtt CallbackExecutionRole.Arn
      Code:
        ZipFile: |
          const https = require("https");

          function send(url, method, body, headers = {}) {
            return new Promise((resolve, reject) => {
              const parsed = new URL(url);
              const request = https.request(parsed, {
                method,
                headers: { "content-length": Buffer.byteLength(body), ...headers },
                timeout: 20000,
              }, (response) => {
                response.resume();
                response.on("end", () => resolve(response.statusCode || 500));
              });
              request.on("timeout", () => request.destroy(new Error("timeout")));
              request.on("error", reject);
              request.end(body);
            });
          }

          async function respond(event, status, physicalId, reason) {
            const response = {
              Status: status,
              Reason: reason,
              PhysicalResourceId: physicalId,
              StackId: event.StackId,
              RequestId: event.RequestId,
              LogicalResourceId: event.LogicalResourceId,
            };
            if (event.RequestType !== "Delete") response.NoEcho = true;
            const body = JSON.stringify(response);
            const result = await send(event.ResponseURL, "PUT", body, { "content-type": "" });
            if (result < 200 || result >= 300) throw new Error("response rejected");
          }

          exports.handler = async (event) => {
            const properties = event.ResourceProperties || {};
            const physicalId = event.PhysicalResourceId || "terrafix-" + properties.OnboardingSessionId;
            let status = "SUCCESS";
            let reason;
            try {
              if (event.RequestType === "Create") {
                const payload = JSON.stringify({
                  sessionId: properties.OnboardingSessionId,
                  roleArn: properties.RoleArn,
                  awsAccountId: properties.AwsAccountId,
                  callbackToken: properties.CallbackToken,
                });
                const result = await send(properties.CallbackEndpoint, "POST", payload, { "content-type": "application/json" });
                if (result < 200 || result >= 300) throw new Error("callback rejected");
              }
            } catch {
              status = "FAILED";
              reason = "TerraFix onboarding callback was not accepted.";
            }
            await respond(event, status, physicalId, reason);
          };
  OnboardingCallback:
    Type: Custom::TerraFixOnboarding
    DependsOn: VerificationRole
    Properties:
      ServiceToken: !GetAtt CallbackFunction.Arn
      OnboardingSessionId: !Ref OnboardingSessionId
      CallbackEndpoint: !Ref CallbackEndpoint
      CallbackToken: !Ref CallbackToken
      RoleArn: !GetAtt VerificationRole.Arn
      AwsAccountId: !Ref AWS::AccountId
Outputs:
  TerraFixRoleArn:
    Description: IAM role ARN created for TerraFix verification.
    Value: !GetAtt VerificationRole.Arn
`;
}
