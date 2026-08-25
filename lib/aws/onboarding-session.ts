import { randomUUID } from "node:crypto";
import { buildCloudFormationQuickCreateUrl, getVerificationRoleName } from "@/lib/aws/cloudformation";
import { callbackTokenMatches, generateAwsCallbackToken, hashAwsCallbackToken } from "@/lib/aws/callback-token";
import { AwsVerificationError } from "@/lib/aws/errors";
import { generateExternalId } from "@/lib/aws/external-id";
import type { AwsConnectionRecord, AwsRoleVerifier } from "@/lib/aws/types";
import { awsRegionSchema, parseIamRoleArn } from "@/lib/validation/aws-connection";

export const AWS_ONBOARDING_SESSION_TTL_MS = 30 * 60 * 1_000;

export type AwsOnboardingStatus =
  | "pending"
  | "stack_launched"
  | "callback_received"
  | "verifying"
  | "connected"
  | "expired"
  | "failed";

export interface AwsOnboardingSessionRecord {
  id: string;
  repositoryId: string;
  userId: string;
  installationId: string;
  externalId: string;
  callbackTokenHash: string;
  region: string;
  status: AwsOnboardingStatus;
  expiresAt: Date;
  callbackReceivedAt: Date | null;
  completedAt: Date | null;
  roleArn: string | null;
  awsAccountId: string | null;
  failureCode: AwsOnboardingFailureCode | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AwsOnboardingRepositoryAccess {
  repositoryId: string;
  repositoryFullName: string;
  installationId: string;
  accessible: boolean;
  configured: boolean;
  currentConnection: AwsConnectionRecord | null;
}

export interface CreateAwsOnboardingSessionInput {
  id: string;
  repositoryId: string;
  userId: string;
  installationId: string;
  externalId: string;
  callbackTokenHash: string;
  region: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AwsOnboardingSessionStore {
  findRepositoryAccess(userId: string, repositoryId: string): Promise<AwsOnboardingRepositoryAccess | null>;
  create(input: CreateAwsOnboardingSessionInput): Promise<AwsOnboardingSessionRecord>;
  findForCallback(sessionId: string): Promise<AwsOnboardingSessionRecord | null>;
  findForUser(userId: string, repositoryId: string, sessionId: string): Promise<AwsOnboardingSessionRecord | null>;
  findLatestForUser(userId: string, repositoryId: string): Promise<AwsOnboardingSessionRecord | null>;
  markExpired(sessionId: string, now: Date): Promise<AwsOnboardingSessionRecord>;
  claimCallback(sessionId: string, callbackTokenHash: string, roleArn: string, awsAccountId: string, now: Date): Promise<AwsOnboardingSessionRecord | null>;
  markVerifying(sessionId: string): Promise<AwsOnboardingSessionRecord>;
  markFailed(sessionId: string, code: AwsOnboardingFailureCode, completedAt: Date): Promise<AwsOnboardingSessionRecord>;
  completeVerified(input: {
    sessionId: string;
    repositoryId: string;
    roleArn: string;
    accountId: string;
    externalId: string;
    region: string;
    verifiedAt: Date;
  }): Promise<{ session: AwsOnboardingSessionRecord; connection: AwsConnectionRecord }>;
}

export type AwsOnboardingFailureCode =
  | "account_mismatch"
  | "role_not_found"
  | "access_denied"
  | "invalid_external_id"
  | "trust_policy_mismatch"
  | "invalid_role_arn"
  | "credentials_unavailable"
  | "network_error"
  | "identity_mismatch"
  | "verification_failed";

export const AWS_ONBOARDING_FAILURE_MESSAGES: Record<AwsOnboardingFailureCode, string> = {
  account_mismatch: "The AWS account did not match the role that CloudFormation created.",
  role_not_found: "AWS could not find the created role. Start the setup again or use manual setup.",
  access_denied: "TerraFix could not assume the created role. Review the role trust policy.",
  invalid_external_id: "The role trust policy does not match this secure onboarding session.",
  trust_policy_mismatch: "The created role does not trust the configured TerraFix principal.",
  invalid_role_arn: "CloudFormation returned an invalid IAM role ARN.",
  credentials_unavailable: "AWS verification is temporarily unavailable in TerraFix.",
  network_error: "TerraFix could not reach AWS STS. Try the connection again.",
  identity_mismatch: "AWS returned an identity that did not match the created role.",
  verification_failed: "TerraFix could not verify the created role. Try again or use manual setup.",
};

export class AwsOnboardingError extends Error {
  constructor(readonly code:
    | "repository_not_found"
    | "repository_access_removed"
    | "repository_not_configured"
    | "session_not_found"
    | "session_expired"
    | "invalid_callback_token"
    | "callback_consumed") {
    super(code);
    this.name = "AwsOnboardingError";
  }
}

export interface AwsOnboardingLaunchConfiguration {
  trustedPrincipalArn: string;
  templateUrl: string;
  callbackEndpoint: string;
}

export async function createAwsOnboardingSession(
  store: AwsOnboardingSessionStore,
  userId: string,
  repositoryId: string,
  regionInput: unknown,
  launch: AwsOnboardingLaunchConfiguration,
  dependencies: {
    now?: () => Date;
    generateId?: () => string;
    generateExternalId?: () => string;
    generateCallbackToken?: () => string;
  } = {},
) {
  const access = await store.findRepositoryAccess(userId, repositoryId);
  if (!access) throw new AwsOnboardingError("repository_not_found");
  if (!access.accessible) throw new AwsOnboardingError("repository_access_removed");
  if (!access.configured) throw new AwsOnboardingError("repository_not_configured");

  const region = awsRegionSchema.parse(regionInput);
  const now = (dependencies.now ?? (() => new Date()))();
  const id = (dependencies.generateId ?? randomUUID)();
  const externalId = (dependencies.generateExternalId ?? generateExternalId)();
  const callbackToken = (dependencies.generateCallbackToken ?? generateAwsCallbackToken)();
  const expiresAt = new Date(now.getTime() + AWS_ONBOARDING_SESSION_TTL_MS);
  const session = await store.create({
    id,
    repositoryId,
    userId,
    installationId: access.installationId,
    externalId,
    callbackTokenHash: hashAwsCallbackToken(callbackToken),
    region,
    expiresAt,
    createdAt: now,
  });

  const roleName = getVerificationRoleName(repositoryId);
  const launchUrl = buildCloudFormationQuickCreateUrl(
    launch.templateUrl,
    `TerraFix-${roleName.slice("TerraFixVerificationRole-".length)}`,
    region,
    {
      TrustedPrincipalArn: launch.trustedPrincipalArn,
      ExternalId: externalId,
      RepositoryId: repositoryId,
      RepositoryFullName: access.repositoryFullName,
      OnboardingSessionId: id,
      CallbackEndpoint: launch.callbackEndpoint,
      CallbackToken: callbackToken,
      VerificationRoleName: roleName,
    },
  );

  return { launchUrl, session: toSafeAwsOnboardingSession(session) };
}

export async function getAwsOnboardingSessionForUser(
  store: AwsOnboardingSessionStore,
  userId: string,
  repositoryId: string,
  sessionId: string,
  now = new Date(),
) {
  const session = await store.findForUser(userId, repositoryId, sessionId);
  if (!session) throw new AwsOnboardingError("session_not_found");
  return toSafeAwsOnboardingSession(await expireIfNeeded(store, session, now));
}

export async function getLatestAwsOnboardingSessionForUser(
  store: AwsOnboardingSessionStore,
  userId: string,
  repositoryId: string,
  now = new Date(),
) {
  const session = await store.findLatestForUser(userId, repositoryId);
  return session ? toSafeAwsOnboardingSession(await expireIfNeeded(store, session, now)) : null;
}

export interface AwsOnboardingCallbackPayload {
  sessionId: string;
  roleArn: string;
  awsAccountId: string;
  callbackToken: string;
}

export async function completeAwsOnboardingSession(
  store: AwsOnboardingSessionStore,
  verifier: AwsRoleVerifier,
  payload: AwsOnboardingCallbackPayload,
  now = new Date(),
) {
  const existing = await store.findForCallback(payload.sessionId);
  if (!existing) throw new AwsOnboardingError("session_not_found");

  if (existing.expiresAt <= now || existing.status === "expired") {
    if (["pending", "stack_launched", "callback_received", "verifying"].includes(existing.status)) {
      await store.markExpired(existing.id, now);
    }
    throw new AwsOnboardingError("session_expired");
  }

  if (existing.status === "connected") {
    if (
      callbackTokenMatches(payload.callbackToken, existing.callbackTokenHash) &&
      payload.roleArn === existing.roleArn &&
      payload.awsAccountId === existing.awsAccountId
    ) {
      return { outcome: "connected" as const, session: toSafeAwsOnboardingSession(existing), idempotent: true };
    }
    throw new AwsOnboardingError("callback_consumed");
  }
  if (["callback_received", "verifying", "failed"].includes(existing.status)) {
    if (
      callbackTokenMatches(payload.callbackToken, existing.callbackTokenHash) &&
      payload.roleArn === existing.roleArn &&
      payload.awsAccountId === existing.awsAccountId
    ) {
      return {
        outcome: existing.status === "failed" ? "failed" as const : "verifying" as const,
        session: toSafeAwsOnboardingSession(existing),
        idempotent: true,
      };
    }
    throw new AwsOnboardingError("callback_consumed");
  }
  const callbackTokenHash = hashAwsCallbackToken(payload.callbackToken);
  const claimed = await store.claimCallback(existing.id, callbackTokenHash, payload.roleArn, payload.awsAccountId, now);
  if (!claimed) {
    if (!callbackTokenMatches(payload.callbackToken, existing.callbackTokenHash)) {
      throw new AwsOnboardingError("invalid_callback_token");
    }
    throw new AwsOnboardingError("callback_consumed");
  }

  let parsedRole: ReturnType<typeof parseIamRoleArn>;
  try {
    parsedRole = parseIamRoleArn(payload.roleArn);
  } catch {
    const session = await store.markFailed(claimed.id, "invalid_role_arn", now);
    return { outcome: "failed" as const, session: toSafeAwsOnboardingSession(session), idempotent: false };
  }

  if (parsedRole.accountId !== payload.awsAccountId) {
    const session = await store.markFailed(claimed.id, "account_mismatch", now);
    return { outcome: "failed" as const, session: toSafeAwsOnboardingSession(session), idempotent: false };
  }

  await store.markVerifying(claimed.id);
  try {
    const result = await verifier.verify({
      roleArn: parsedRole.roleArn,
      externalId: claimed.externalId,
      region: claimed.region,
    });
    if (result.accountId !== parsedRole.accountId) throw new AwsVerificationError("identity_mismatch");
    const completed = await store.completeVerified({
      sessionId: claimed.id,
      repositoryId: claimed.repositoryId,
      roleArn: parsedRole.roleArn,
      accountId: result.accountId,
      externalId: claimed.externalId,
      region: claimed.region,
      verifiedAt: now,
    });
    return { outcome: "connected" as const, session: toSafeAwsOnboardingSession(completed.session), idempotent: false };
  } catch (error) {
    const code = toFailureCode(error);
    const session = await store.markFailed(claimed.id, code, now);
    return { outcome: "failed" as const, session: toSafeAwsOnboardingSession(session), idempotent: false };
  }
}

export function toSafeAwsOnboardingSession(session: AwsOnboardingSessionRecord) {
  return {
    id: session.id,
    status: session.status,
    expiresAt: session.expiresAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    roleArn: session.roleArn,
    awsAccountId: session.awsAccountId,
    failureCode: session.failureCode,
    failureMessage: session.failureCode ? AWS_ONBOARDING_FAILURE_MESSAGES[session.failureCode] : null,
  };
}

export type SafeAwsOnboardingSession = ReturnType<typeof toSafeAwsOnboardingSession>;

async function expireIfNeeded(
  store: AwsOnboardingSessionStore,
  session: AwsOnboardingSessionRecord,
  now: Date,
) {
  if (["connected", "expired", "failed"].includes(session.status) || session.expiresAt > now) return session;
  return store.markExpired(session.id, now);
}

function toFailureCode(error: unknown): AwsOnboardingFailureCode {
  if (!(error instanceof AwsVerificationError)) return "verification_failed";
  return error.code === "unknown" ? "verification_failed" : error.code;
}
