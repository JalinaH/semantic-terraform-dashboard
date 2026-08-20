import { describe, expect, it } from "vitest";
import {
  AwsConnectionAccessError,
  disconnectAwsConnection,
  getAuthorizedAwsContext,
  saveAwsRole,
  startAwsOnboarding,
  verifyAwsConnection,
  type AwsConnectionStore,
  type AwsRepositoryAccess,
} from "@/lib/aws/connection";
import { AwsVerificationError } from "@/lib/aws/errors";
import { generateAuthorizedCloudFormationTemplate } from "@/lib/aws/onboarding";
import type { AwsConnectionRecord, AwsConnectionStatus, AwsRoleVerifier } from "@/lib/aws/types";

class MemoryAwsStore implements AwsConnectionStore {
  records = new Map<string, AwsConnectionRecord>();
  accesses = new Map<string, Omit<AwsRepositoryAccess, "connection">>();

  constructor() {
    this.accesses.set("user-1:repo-1", { repositoryId: "repo-1", repositoryFullName: "owner/repo", accessible: true, configured: true });
  }

  async findAccess(userId: string, repositoryId: string) {
    const access = this.accesses.get(`${userId}:${repositoryId}`);
    return access ? { ...access, connection: this.records.get(repositoryId) ?? null } : null;
  }

  async startOnboarding(repositoryId: string, region: string, newExternalId: string) {
    const previous = this.records.get(repositoryId);
    return this.save({
      ...baseRecord(repositoryId),
      ...previous,
      region,
      externalId: previous?.externalId ?? newExternalId,
      status: "pending",
      awsAccountId: null,
      lastVerifiedAt: null,
      verificationError: null,
    });
  }

  async saveRole(repositoryId: string, roleArn: string) {
    return this.save({ ...this.required(repositoryId), roleArn, status: "pending", awsAccountId: null, lastVerifiedAt: null, verificationError: null });
  }

  async markConnected(repositoryId: string, accountId: string, verifiedAt: Date) {
    return this.save({ ...this.required(repositoryId), status: "connected", awsAccountId: accountId, lastVerifiedAt: verifiedAt, verificationError: null });
  }

  async markFailed(repositoryId: string, status: Extract<AwsConnectionStatus, "verification_failed" | "access_removed">, safeError: string) {
    return this.save({ ...this.required(repositoryId), status, verificationError: safeError });
  }

  async disconnect(repositoryId: string) { this.records.delete(repositoryId); }
  private required(id: string) { const record = this.records.get(id); if (!record) throw new Error("missing"); return record; }
  private save(record: AwsConnectionRecord) { this.records.set(record.repositoryId, record); return record; }
}

const successfulVerifier: AwsRoleVerifier = {
  async verify() { return { accountId: "123456789012", assumedRoleArn: "arn:aws:sts::123456789012:assumed-role/Role/session" }; },
};

describe("AWS connection service", () => {
  it("starts a pending connection with the server-generated external ID", async () => {
    const store = new MemoryAwsStore();
    const connection = await startAwsOnboarding(store, () => "stfa_random", "user-1", "repo-1", "ap-south-1");
    expect(connection).toMatchObject({ status: "pending", externalId: "stfa_random", region: "ap-south-1" });
  });

  it("requires repository configuration before onboarding", async () => {
    const store = new MemoryAwsStore();
    store.accesses.set("user-1:repo-1", { repositoryId: "repo-1", repositoryFullName: "owner/repo", accessible: true, configured: false });
    await expect(startAwsOnboarding(store, () => "random", "user-1", "repo-1", "ap-south-1"))
      .rejects.toMatchObject({ code: "repository_not_configured" } satisfies Partial<AwsConnectionAccessError>);
  });

  it("blocks another user from viewing, downloading, saving, or verifying another repository connection", async () => {
    const store = await startedStore();
    await expect(getAuthorizedAwsContext(store, "other-user", "repo-1")).rejects.toMatchObject({ code: "repository_not_found" });
    await expect(generateAuthorizedCloudFormationTemplate(store, "other-user", "repo-1", "arn:aws:iam::111122223333:role/ControlPlane")).rejects.toMatchObject({ code: "repository_not_found" });
    await expect(saveAwsRole(store, "other-user", "repo-1", validRoleArn)).rejects.toMatchObject({ code: "repository_not_found" });
    await expect(verifyAwsConnection(store, successfulVerifier, "other-user", "repo-1")).rejects.toMatchObject({ code: "repository_not_found" });
  });

  it("blocks operations when GitHub access was removed", async () => {
    const store = await startedStore();
    store.accesses.set("user-1:repo-1", { repositoryId: "repo-1", repositoryFullName: "owner/repo", accessible: false, configured: true });
    await expect(saveAwsRole(store, "user-1", "repo-1", validRoleArn)).rejects.toMatchObject({ code: "repository_access_removed" });
  });

  it("persists a role, connected status, account ID, and verification time", async () => {
    const store = await startedStore();
    await saveAwsRole(store, "user-1", "repo-1", validRoleArn);
    const connection = await verifyAwsConnection(store, successfulVerifier, "user-1", "repo-1");
    expect(connection.status).toBe("connected");
    expect(connection.awsAccountId).toBe("123456789012");
    expect(connection.lastVerifiedAt).toBeInstanceOf(Date);
    expect(connection.verificationError).toBeNull();
  });

  it("stores only the bounded safe verification message", async () => {
    const store = await startedStore();
    await saveAwsRole(store, "user-1", "repo-1", validRoleArn);
    const verifier: AwsRoleVerifier = { async verify() { throw new AwsVerificationError("access_denied", { cause: new Error("secret raw details") }); } };
    await expect(verifyAwsConnection(store, verifier, "user-1", "repo-1")).rejects.toMatchObject({ code: "access_denied" });
    expect(store.records.get("repo-1")?.status).toBe("verification_failed");
    expect(store.records.get("repo-1")?.verificationError).not.toContain("secret raw details");
  });

  it("marks a formerly connected role as access removed when re-verification is denied", async () => {
    const store = await startedStore();
    await saveAwsRole(store, "user-1", "repo-1", validRoleArn);
    await verifyAwsConnection(store, successfulVerifier, "user-1", "repo-1");
    const denied: AwsRoleVerifier = { async verify() { throw new AwsVerificationError("access_denied"); } };
    await expect(verifyAwsConnection(store, denied, "user-1", "repo-1")).rejects.toMatchObject({ code: "access_denied" });
    expect(store.records.get("repo-1")?.status).toBe("access_removed");
  });

  it("disconnects only the dashboard record", async () => {
    const store = await startedStore();
    await disconnectAwsConnection(store, "user-1", "repo-1");
    expect(store.records.has("repo-1")).toBe(false);
  });
});

const validRoleArn = "arn:aws:iam::123456789012:role/SemanticTerraformAgentVerificationRole";
async function startedStore() { const store = new MemoryAwsStore(); await startAwsOnboarding(store, () => "stfa_random", "user-1", "repo-1", "ap-south-1"); return store; }
function baseRecord(repositoryId: string): AwsConnectionRecord {
  const now = new Date("2026-08-19T00:00:00.000Z");
  return { id: `aws-${repositoryId}`, repositoryId, roleArn: null, region: "ap-south-1", status: "pending", externalId: "", awsAccountId: null, lastVerifiedAt: null, verificationError: null, createdAt: now, updatedAt: now };
}
