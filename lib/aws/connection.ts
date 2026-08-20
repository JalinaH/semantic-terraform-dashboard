import type {
  AwsConnectionRecord,
  AwsConnectionStatus,
  AwsRoleVerifier,
} from "@/lib/aws/types";
import { AwsVerificationError } from "@/lib/aws/errors";
import { awsRegionSchema, iamRoleArnSchema } from "@/lib/validation/aws-connection";

export interface AwsRepositoryAccess {
  repositoryId: string;
  repositoryFullName: string;
  accessible: boolean;
  configured: boolean;
  connection: AwsConnectionRecord | null;
}

export interface AwsConnectionStore {
  findAccess(userId: string, repositoryId: string): Promise<AwsRepositoryAccess | null>;
  startOnboarding(repositoryId: string, region: string, newExternalId: string): Promise<AwsConnectionRecord>;
  saveRole(repositoryId: string, roleArn: string): Promise<AwsConnectionRecord>;
  markConnected(repositoryId: string, accountId: string, verifiedAt: Date): Promise<AwsConnectionRecord>;
  markFailed(repositoryId: string, status: Extract<AwsConnectionStatus, "verification_failed" | "access_removed">, safeError: string): Promise<AwsConnectionRecord>;
  disconnect(repositoryId: string): Promise<void>;
}

export type AwsConnectionAccessErrorCode =
  | "repository_not_found"
  | "repository_access_removed"
  | "repository_not_configured"
  | "connection_not_started"
  | "role_not_configured";

export class AwsConnectionAccessError extends Error {
  constructor(readonly code: AwsConnectionAccessErrorCode) {
    super(code);
    this.name = "AwsConnectionAccessError";
  }
}

export async function getAuthorizedAwsContext(
  store: AwsConnectionStore,
  userId: string,
  repositoryId: string,
) {
  const access = await store.findAccess(userId, repositoryId);
  if (!access) throw new AwsConnectionAccessError("repository_not_found");
  if (!access.accessible) throw new AwsConnectionAccessError("repository_access_removed");
  return access;
}

export async function startAwsOnboarding(
  store: AwsConnectionStore,
  generateExternalId: () => string,
  userId: string,
  repositoryId: string,
  regionInput: unknown,
) {
  const access = await getAuthorizedAwsContext(store, userId, repositoryId);
  if (!access.configured) throw new AwsConnectionAccessError("repository_not_configured");
  const region = awsRegionSchema.parse(regionInput);
  return store.startOnboarding(repositoryId, region, access.connection?.externalId ?? generateExternalId());
}

export async function saveAwsRole(
  store: AwsConnectionStore,
  userId: string,
  repositoryId: string,
  roleArnInput: unknown,
) {
  const access = await getAuthorizedAwsContext(store, userId, repositoryId);
  if (!access.connection) throw new AwsConnectionAccessError("connection_not_started");
  const roleArn = iamRoleArnSchema.parse(roleArnInput);
  return store.saveRole(repositoryId, roleArn);
}

export async function verifyAwsConnection(
  store: AwsConnectionStore,
  verifier: AwsRoleVerifier,
  userId: string,
  repositoryId: string,
) {
  const access = await getAuthorizedAwsContext(store, userId, repositoryId);
  const connection = access.connection;
  if (!connection) throw new AwsConnectionAccessError("connection_not_started");
  if (!connection.roleArn) throw new AwsConnectionAccessError("role_not_configured");

  try {
    const result = await verifier.verify({
      roleArn: connection.roleArn,
      externalId: connection.externalId,
      region: connection.region,
    });
    return store.markConnected(repositoryId, result.accountId, new Date());
  } catch (error) {
    const verificationError = error instanceof AwsVerificationError
      ? error
      : new AwsVerificationError("unknown", { cause: error });
    const accessRemovedCodes = new Set(["role_not_found", "access_denied", "invalid_external_id", "trust_policy_mismatch"]);
    const status = connection.status === "connected" && accessRemovedCodes.has(verificationError.code)
      ? "access_removed"
      : "verification_failed";
    await store.markFailed(repositoryId, status, verificationError.message);
    throw verificationError;
  }
}

export async function disconnectAwsConnection(
  store: AwsConnectionStore,
  userId: string,
  repositoryId: string,
) {
  const access = await getAuthorizedAwsContext(store, userId, repositoryId);
  if (!access.connection) return;
  await store.disconnect(repositoryId);
}
