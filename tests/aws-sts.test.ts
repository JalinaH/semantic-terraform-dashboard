import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  send: vi.fn(),
  destroy: vi.fn(),
  configs: [] as Array<Record<string, unknown>>,
}));

vi.mock("@aws-sdk/client-sts", async (importOriginal) => {
  const original = await importOriginal<typeof import("@aws-sdk/client-sts")>();
  return {
    ...original,
    STSClient: class {
      constructor(config: Record<string, unknown>) { sdk.configs.push(config); }
      send = sdk.send;
      destroy = sdk.destroy;
    },
  };
});

import { awsStsRoleVerifier } from "@/lib/aws/sts";

const request = {
  roleArn: "arn:aws:iam::123456789012:role/SemanticTerraformAgentVerificationRole",
  externalId: "stfa_test_external_id",
  region: "ap-south-1",
};

describe("AWS STS role verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdk.configs.length = 0;
    process.env.AWS_CONTROL_PLANE_REGION = "us-east-1";
    process.env.AWS_ASSUME_ROLE_PRINCIPAL_ARN = "arn:aws:iam::111122223333:role/SemanticTerraformControlPlane";
  });

  it("assumes the role with ExternalId, uses temporary credentials, and verifies caller identity", async () => {
    sdk.send
      .mockResolvedValueOnce({ Credentials: { AccessKeyId: "temporary-key", SecretAccessKey: "temporary-secret", SessionToken: "temporary-token", Expiration: new Date() } })
      .mockResolvedValueOnce({ Account: "123456789012", Arn: "arn:aws:sts::123456789012:assumed-role/SemanticTerraformAgentVerificationRole/semantic-terraform-dashboard-verification" });

    await expect(awsStsRoleVerifier.verify(request)).resolves.toMatchObject({ accountId: "123456789012" });
    const assumeRoleCommand = sdk.send.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(assumeRoleCommand.input).toMatchObject({
      RoleArn: request.roleArn,
      ExternalId: request.externalId,
      RoleSessionName: "semantic-terraform-dashboard-verification",
      DurationSeconds: 900,
    });
    expect(sdk.configs[1]).toMatchObject({ region: "ap-south-1", credentials: { accessKeyId: "temporary-key", sessionToken: "temporary-token" } });
  });

  it("classifies access denied without exposing the raw AWS error", async () => {
    sdk.send.mockRejectedValueOnce(Object.assign(new Error("not authorized for sensitive internal reason"), { name: "AccessDenied" }));
    await expect(awsStsRoleVerifier.verify(request)).rejects.toMatchObject({ code: "access_denied" });
  });

  it("classifies External ID and trust policy mismatches", async () => {
    sdk.send.mockRejectedValueOnce(Object.assign(new Error("ExternalId condition mismatch"), { name: "AccessDenied" }));
    await expect(awsStsRoleVerifier.verify(request)).rejects.toMatchObject({ code: "invalid_external_id" });
    sdk.send.mockRejectedValueOnce(Object.assign(new Error("role trust policy does not allow this principal"), { name: "AccessDenied" }));
    await expect(awsStsRoleVerifier.verify(request)).rejects.toMatchObject({ code: "trust_policy_mismatch" });
  });

  it("classifies unavailable local credentials and network failures", async () => {
    sdk.send.mockRejectedValueOnce(Object.assign(new Error("no provider"), { name: "CredentialsProviderError" }));
    await expect(awsStsRoleVerifier.verify(request)).rejects.toMatchObject({ code: "credentials_unavailable" });
    sdk.send.mockRejectedValueOnce(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    await expect(awsStsRoleVerifier.verify(request)).rejects.toMatchObject({ code: "network_error" });
  });

  it("rejects a caller identity from another account or role", async () => {
    sdk.send
      .mockResolvedValueOnce({ Credentials: { AccessKeyId: "key", SecretAccessKey: "secret", SessionToken: "token" } })
      .mockResolvedValueOnce({ Account: "999999999999", Arn: "arn:aws:sts::999999999999:assumed-role/OtherRole/session" });
    await expect(awsStsRoleVerifier.verify(request)).rejects.toMatchObject({ code: "identity_mismatch" });
  });
});
