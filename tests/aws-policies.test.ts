import { describe, expect, it } from "vitest";
import { generateCloudFormationTemplate, getVerificationRoleName } from "@/lib/aws/cloudformation";
import { generateStarterVerificationPolicy, generateTrustPolicy } from "@/lib/aws/policies";

const principal = "arn:aws:iam::111122223333:role/SemanticTerraformControlPlane";
const externalId = "stfa_abcdefghijklmnopqrstuvwxyz0123456789ABCDE";

describe("AWS policy generation", () => {
  it("creates a repository-specific trust policy without a wildcard principal", () => {
    const policy = generateTrustPolicy(principal, externalId);
    expect(policy.Statement[0]).toMatchObject({
      Effect: "Allow",
      Principal: { AWS: principal },
      Action: "sts:AssumeRole",
      Condition: { StringEquals: { "sts:ExternalId": externalId } },
    });
    expect(JSON.stringify(policy)).not.toContain('"AWS":"*"');
  });

  it("provides a read-oriented starter policy without administrator or mutation actions", () => {
    const serialized = JSON.stringify(generateStarterVerificationPolicy());
    expect(serialized).toContain("ec2:Describe*");
    expect(serialized).not.toContain("AdministratorAccess");
    expect(serialized).not.toMatch(/:(?:Create|Delete|Put|Update|Attach|Detach|Run|Terminate|Apply)/);
  });
});

describe("CloudFormation generation", () => {
  it("creates only the documented IAM role with trust condition, policy, and tags", () => {
    const template = generateCloudFormationTemplate({
      trustedPrincipalArn: principal,
      externalId,
      repositoryId: "repo/with unsafe spaces",
      repositoryFullName: "owner/repository",
    });
    expect(template).toContain("Type: AWS::IAM::Role");
    expect(template).toContain(`AWS: "${principal}"`);
    expect(template).toContain(`sts:ExternalId: "${externalId}"`);
    expect(template).toContain("ManagedBy");
    expect(template).toContain("TerraFix");
    expect(template).toContain("                Action:\n                  - ec2:Describe*");
    expect(template).not.toMatch(/AWS::(?:EC2|Lambda|S3|IAM::User|IAM::AccessKey|VPC)/);
    expect(template).not.toContain("AdministratorAccess");
  });

  it("produces deterministic, valid IAM role names with a safe suffix", () => {
    const first = getVerificationRoleName("repo/with unsafe spaces");
    expect(first).toBe(getVerificationRoleName("repo/with unsafe spaces"));
    expect(first).toMatch(/^TerraFixVerificationRole-[a-f0-9]{10}$/);
    expect(first.length).toBeLessThanOrEqual(64);
  });
});
