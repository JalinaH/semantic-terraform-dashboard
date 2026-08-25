import { describe, expect, it } from "vitest";
import { hashAwsCallbackToken } from "@/lib/aws/callback-token";
import { AwsVerificationError } from "@/lib/aws/errors";
import {
  AWS_ONBOARDING_SESSION_TTL_MS,
  AwsOnboardingError,
  completeAwsOnboardingSession,
  createAwsOnboardingSession,
  getAwsOnboardingSessionForUser,
  type AwsOnboardingFailureCode,
  type AwsOnboardingRepositoryAccess,
  type AwsOnboardingSessionRecord,
  type AwsOnboardingSessionStore,
  type CreateAwsOnboardingSessionInput,
} from "@/lib/aws/onboarding-session";
import type { AwsConnectionRecord, AwsRoleVerifier } from "@/lib/aws/types";

const NOW = new Date("2026-08-25T12:00:00.000Z");
const ROLE_ARN = "arn:aws:iam::123456789012:role/TerraFixVerificationRole-test";
const TOKEN = "tfxcb_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

class MemoryStore implements AwsOnboardingSessionStore {
  sessions = new Map<string, AwsOnboardingSessionRecord>();
  connection: AwsConnectionRecord | null = null;
  lastCreateInput: CreateAwsOnboardingSessionInput | null = null;
  access: AwsOnboardingRepositoryAccess | null = {
    repositoryId: "repo-1",
    repositoryFullName: "acme/infrastructure",
    installationId: "installation-1",
    accessible: true,
    configured: true,
    currentConnection: null,
  };

  async findRepositoryAccess(userId: string, repositoryId: string) {
    return userId === "user-1" && repositoryId === "repo-1" ? this.access : null;
  }

  async create(input: CreateAwsOnboardingSessionInput) {
    this.lastCreateInput = input;
    for (const [id, session] of this.sessions) {
      if (session.repositoryId === input.repositoryId && ["pending", "stack_launched", "callback_received", "verifying"].includes(session.status)) {
        this.sessions.set(id, { ...session, status: "expired", completedAt: input.createdAt });
      }
    }
    const record: AwsOnboardingSessionRecord = {
      ...input,
      status: "stack_launched",
      callbackReceivedAt: null,
      completedAt: null,
      roleArn: null,
      awsAccountId: null,
      failureCode: null,
      updatedAt: input.createdAt,
    };
    this.sessions.set(record.id, record);
    return record;
  }

  async findForCallback(sessionId: string) { return this.sessions.get(sessionId) ?? null; }
  async findForUser(userId: string, repositoryId: string, sessionId: string) {
    const session = this.sessions.get(sessionId);
    return session?.userId === userId && session.repositoryId === repositoryId ? session : null;
  }
  async findLatestForUser(userId: string, repositoryId: string) {
    return [...this.sessions.values()].filter((session) => session.userId === userId && session.repositoryId === repositoryId).at(-1) ?? null;
  }
  async markExpired(sessionId: string, now: Date) { return this.save(sessionId, { status: "expired", completedAt: now }); }
  async claimCallback(sessionId: string, callbackTokenHash: string, roleArn: string, awsAccountId: string, now: Date) {
    const session = this.sessions.get(sessionId);
    if (!session || session.callbackTokenHash !== callbackTokenHash || session.expiresAt <= now || !["pending", "stack_launched"].includes(session.status)) return null;
    return this.save(sessionId, { status: "callback_received", callbackReceivedAt: now, roleArn, awsAccountId });
  }
  async markVerifying(sessionId: string) { return this.save(sessionId, { status: "verifying" }); }
  async markFailed(sessionId: string, code: AwsOnboardingFailureCode, completedAt: Date) {
    return this.save(sessionId, { status: "failed", failureCode: code, completedAt });
  }
  async completeVerified(input: { sessionId: string; repositoryId: string; roleArn: string; accountId: string; externalId: string; region: string; verifiedAt: Date }) {
    const session = this.save(input.sessionId, { status: "connected", roleArn: input.roleArn, awsAccountId: input.accountId, completedAt: input.verifiedAt });
    const previous = this.connection;
    this.connection = {
      id: previous?.id ?? "connection-1",
      repositoryId: input.repositoryId,
      roleArn: input.roleArn,
      region: input.region,
      status: "connected",
      externalId: input.externalId,
      awsAccountId: input.accountId,
      lastVerifiedAt: input.verifiedAt,
      verificationError: null,
      createdAt: previous?.createdAt ?? input.verifiedAt,
      updatedAt: input.verifiedAt,
    };
    return { session, connection: this.connection };
  }
  private save(sessionId: string, update: Partial<AwsOnboardingSessionRecord>) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("missing session");
    const saved = { ...session, ...update, updatedAt: NOW };
    this.sessions.set(sessionId, saved);
    return saved;
  }
}

const verifier: AwsRoleVerifier = {
  async verify(request) {
    expect(request.externalId).toBe("stfa_session_specific");
    return { accountId: "123456789012", assumedRoleArn: "arn:aws:sts::123456789012:assumed-role/TerraFixVerificationRole-test/session" };
  },
};

async function create(store = new MemoryStore()) {
  const created = await createAwsOnboardingSession(
    store,
    "user-1",
    "repo-1",
    "ap-south-1",
    {
      trustedPrincipalArn: "arn:aws:iam::111122223333:role/TerraFixControlPlane",
      templateUrl: "https://templates.example.test/terrafix-v1.yaml",
      callbackEndpoint: "https://dashboard.example.test/api/aws/onboarding/complete",
    },
    {
      now: () => NOW,
      generateId: () => "session-1",
      generateExternalId: () => "stfa_session_specific",
      generateCallbackToken: () => TOKEN,
    },
  );
  return { store, created };
}

describe("guided AWS onboarding sessions", () => {
  it("authorizes the repository and stores only the callback token hash", async () => {
    const { store, created } = await create();
    expect(store.lastCreateInput).toMatchObject({ userId: "user-1", repositoryId: "repo-1", installationId: "installation-1", externalId: "stfa_session_specific" });
    expect(store.lastCreateInput?.callbackTokenHash).toBe(hashAwsCallbackToken(TOKEN));
    expect(JSON.stringify(store.lastCreateInput)).not.toContain(TOKEN);
    expect(store.lastCreateInput?.expiresAt.getTime()).toBe(NOW.getTime() + AWS_ONBOARDING_SESSION_TTL_MS);
    expect(created.session).not.toHaveProperty("callbackTokenHash");
    expect(created.session).not.toHaveProperty("externalId");
    expect(created.launchUrl).toContain("param_OnboardingSessionId=session-1");
    expect(created.launchUrl).toContain(`param_CallbackToken=${TOKEN}`);
    expect(created.launchUrl).not.toContain("dashboard-secret");
  });

  it("rejects unauthorized, inaccessible, and unconfigured repositories", async () => {
    const store = new MemoryStore();
    await expect(createAwsOnboardingSession(store, "other-user", "repo-1", "ap-south-1", launchConfig())).rejects.toMatchObject({ code: "repository_not_found" } satisfies Partial<AwsOnboardingError>);
    store.access = { ...store.access!, accessible: false };
    await expect(createAwsOnboardingSession(store, "user-1", "repo-1", "ap-south-1", launchConfig())).rejects.toMatchObject({ code: "repository_access_removed" });
    store.access = { ...store.access, accessible: true, configured: false } as AwsOnboardingRepositoryAccess;
    await expect(createAwsOnboardingSession(store, "user-1", "repo-1", "ap-south-1", launchConfig())).rejects.toMatchObject({ code: "repository_not_configured" });
  });

  it("expires sessions lazily and prevents another user from reading them", async () => {
    const { store } = await create();
    await expect(getAwsOnboardingSessionForUser(store, "other-user", "repo-1", "session-1", NOW)).rejects.toMatchObject({ code: "session_not_found" });
    const expired = await getAwsOnboardingSessionForUser(store, "user-1", "repo-1", "session-1", new Date(NOW.getTime() + AWS_ONBOARDING_SESSION_TTL_MS + 1));
    expect(expired.status).toBe("expired");
  });

  it("verifies STS identity and populates the canonical connection", async () => {
    const { store } = await create();
    const result = await completeAwsOnboardingSession(store, verifier, callback(), new Date(NOW.getTime() + 1_000));
    expect(result.outcome).toBe("connected");
    expect(store.connection).toMatchObject({ roleArn: ROLE_ARN, awsAccountId: "123456789012", externalId: "stfa_session_specific", status: "connected" });
  });

  it("rejects an invalid token without consuming the session", async () => {
    const { store } = await create();
    await expect(completeAwsOnboardingSession(store, verifier, { ...callback(), callbackToken: `${TOKEN}x` }, NOW)).rejects.toMatchObject({ code: "invalid_callback_token" });
    expect(store.sessions.get("session-1")?.status).toBe("stack_launched");
  });

  it("rejects expired and unknown callback sessions", async () => {
    const { store } = await create();
    await expect(completeAwsOnboardingSession(store, verifier, callback(), new Date(NOW.getTime() + AWS_ONBOARDING_SESSION_TTL_MS + 1)))
      .rejects.toMatchObject({ code: "session_expired" });
    await expect(completeAwsOnboardingSession(store, verifier, { ...callback(), sessionId: "wrong-session" }, NOW))
      .rejects.toMatchObject({ code: "session_not_found" });
  });

  it("fails malformed role ARNs before attempting STS", async () => {
    const { store } = await create();
    const result = await completeAwsOnboardingSession(store, verifier, { ...callback(), roleArn: "arn:aws:iam::123456789012:user/not-a-role" }, NOW);
    expect(result.session).toMatchObject({ status: "failed", failureCode: "invalid_role_arn" });
  });

  it("returns an idempotent success for the same completed callback", async () => {
    const { store } = await create();
    await completeAwsOnboardingSession(store, verifier, callback(), NOW);
    const duplicate = await completeAwsOnboardingSession(store, verifier, callback(), new Date(NOW.getTime() + 1_000));
    expect(duplicate).toMatchObject({ outcome: "connected", idempotent: true });
  });

  it("acknowledges an authenticated duplicate while verification is in progress", async () => {
    const { store } = await create();
    const session = store.sessions.get("session-1")!;
    store.sessions.set("session-1", { ...session, status: "verifying", roleArn: ROLE_ARN, awsAccountId: "123456789012" });
    const duplicate = await completeAwsOnboardingSession(store, verifier, callback(), NOW);
    expect(duplicate).toMatchObject({ outcome: "verifying", idempotent: true });
  });

  it("fails malformed identity payloads and preserves an existing connection", async () => {
    const { store } = await create();
    store.connection = existingConnection();
    const result = await completeAwsOnboardingSession(store, verifier, { ...callback(), awsAccountId: "999999999999" }, NOW);
    expect(result.outcome).toBe("failed");
    expect(result.session.failureCode).toBe("account_mismatch");
    expect(store.connection).toEqual(existingConnection());
  });

  it("records safe AssumeRole failure guidance without replacing the working connection", async () => {
    const { store } = await create();
    store.connection = existingConnection();
    const denied: AwsRoleVerifier = { async verify() { throw new AwsVerificationError("access_denied", { cause: new Error("secret AWS trace") }); } };
    const result = await completeAwsOnboardingSession(store, denied, callback(), NOW);
    expect(result.session).toMatchObject({ status: "failed", failureCode: "access_denied" });
    expect(JSON.stringify(result.session)).not.toContain("secret AWS trace");
    expect(store.connection).toEqual(existingConnection());
  });

  it("expires a prior active session when the user starts again", async () => {
    const { store } = await create();
    await createAwsOnboardingSession(store, "user-1", "repo-1", "ap-south-1", launchConfig(), {
      now: () => new Date(NOW.getTime() + 1_000), generateId: () => "session-2", generateExternalId: () => "stfa_second_session", generateCallbackToken: () => `${TOKEN}2`,
    });
    expect(store.sessions.get("session-1")?.status).toBe("expired");
    expect(store.sessions.get("session-2")?.status).toBe("stack_launched");
  });
});

function callback() { return { sessionId: "session-1", roleArn: ROLE_ARN, awsAccountId: "123456789012", callbackToken: TOKEN }; }
function launchConfig() { return { trustedPrincipalArn: "arn:aws:iam::111122223333:role/TerraFixControlPlane", templateUrl: "https://templates.example.test/v1.yaml", callbackEndpoint: "https://dashboard.example.test/api/aws/onboarding/complete" }; }
function existingConnection(): AwsConnectionRecord {
  return { id: "old", repositoryId: "repo-1", roleArn: "arn:aws:iam::999999999999:role/OldWorkingRole", region: "us-east-1", status: "connected", externalId: "old-external", awsAccountId: "999999999999", lastVerifiedAt: NOW, verificationError: null, createdAt: NOW, updatedAt: NOW };
}
