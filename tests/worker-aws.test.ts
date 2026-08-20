import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn() }));

vi.mock("@aws-sdk/client-sts", async (importOriginal) => {
  const original = await importOriginal<typeof import("@aws-sdk/client-sts")>();
  return { ...original, STSClient: class { send = sdk.send; destroy = sdk.destroy; } };
});

import { assumeWorkerRepositoryRole } from "@/worker/aws";
import { claimedRun } from "@/tests/phase5-fixtures";

describe("worker AWS role assumption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AWS_CONTROL_PLANE_REGION = "us-east-1";
    process.env.AWS_ASSUME_ROLE_PRINCIPAL_ARN = "arn:aws:iam::111122223333:role/ControlPlane";
  });

  it("uses the repository External ID, verifies identity, and returns temporary credentials only", async () => {
    sdk.send
      .mockResolvedValueOnce({ Credentials: { AccessKeyId: "tmp-id", SecretAccessKey: "tmp-secret", SessionToken: "tmp-session", Expiration: new Date() } })
      .mockResolvedValueOnce({ Account: "123456789012", Arn: "arn:aws:sts::123456789012:assumed-role/STFA/stfa-run" });
    const credentials = await assumeWorkerRepositoryRole(claimedRun());
    const command = sdk.send.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({ RoleArn: "arn:aws:iam::123456789012:role/STFA", ExternalId: "external", DurationSeconds: 900 });
    expect(credentials).toMatchObject({ accessKeyId: "tmp-id", sessionToken: "tmp-session", region: "us-east-1" });
  });

  it("maps denied and mismatched identities to a bounded worker error", async () => {
    sdk.send.mockRejectedValueOnce(Object.assign(new Error("secret AWS detail"), { name: "AccessDenied" }));
    await expect(assumeWorkerRepositoryRole(claimedRun())).rejects.toMatchObject({ code: "aws_assume_role_failed" });

    sdk.send
      .mockResolvedValueOnce({ Credentials: { AccessKeyId: "id", SecretAccessKey: "secret", SessionToken: "session" } })
      .mockResolvedValueOnce({ Account: "999999999999", Arn: "arn:aws:sts::999999999999:assumed-role/Other/session" });
    await expect(assumeWorkerRepositoryRole(claimedRun())).rejects.toMatchObject({ code: "aws_assume_role_failed" });
  });
});
