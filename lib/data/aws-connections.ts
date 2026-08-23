import "server-only";

import { AWSConnectionStatus, type AWSConnection } from "@prisma/client";
import { db } from "@/lib/db";
import type { AwsConnectionStore } from "@/lib/aws/connection";
import type { AwsConnectionRecord, AwsConnectionStatus as DomainStatus } from "@/lib/aws/types";

const statusFromDatabase: Record<AWSConnectionStatus, DomainStatus> = {
  PENDING: "pending",
  CONNECTED: "connected",
  VERIFICATION_FAILED: "verification_failed",
  ACCESS_REMOVED: "access_removed",
};

const statusToDatabase = {
  verification_failed: AWSConnectionStatus.VERIFICATION_FAILED,
  access_removed: AWSConnectionStatus.ACCESS_REMOVED,
} as const;

export function toAwsConnectionRecord(connection: AWSConnection): AwsConnectionRecord {
  return {
    id: connection.id,
    repositoryId: connection.repositoryId,
    roleArn: connection.roleArn,
    region: connection.region,
    status: statusFromDatabase[connection.status],
    externalId: connection.externalId,
    awsAccountId: connection.awsAccountId,
    lastVerifiedAt: connection.lastVerifiedAt,
    verificationError: connection.verificationError,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

export const prismaAwsConnectionStore: AwsConnectionStore = {
  async findAccess(userId, repositoryId) {
    const repository = await db.repository.findFirst({
      where: {
        id: repositoryId,
        installation: { userInstallations: { some: { userId } } },
      },
      select: {
        id: true,
        fullName: true,
        accessible: true,
        installation: { select: { suspendedAt: true } },
        config: { select: { id: true } },
        awsConnection: true,
      },
    });
    return repository ? {
      repositoryId: repository.id,
      repositoryFullName: repository.fullName,
      accessible: repository.accessible && repository.installation.suspendedAt === null,
      configured: Boolean(repository.config),
      connection: repository.awsConnection ? toAwsConnectionRecord(repository.awsConnection) : null,
    } : null;
  },

  async startOnboarding(repositoryId, region, newExternalId) {
    const saved = await db.aWSConnection.upsert({
      where: { repositoryId },
      create: {
        repositoryId,
        region,
        externalId: newExternalId,
        status: AWSConnectionStatus.PENDING,
      },
      update: {
        region,
        status: AWSConnectionStatus.PENDING,
        awsAccountId: null,
        lastVerifiedAt: null,
        verificationError: null,
      },
    });
    return toAwsConnectionRecord(saved);
  },

  async saveRole(repositoryId, roleArn) {
    const saved = await db.aWSConnection.update({
      where: { repositoryId },
      data: {
        roleArn,
        status: AWSConnectionStatus.PENDING,
        awsAccountId: null,
        lastVerifiedAt: null,
        verificationError: null,
      },
    });
    return toAwsConnectionRecord(saved);
  },

  async markConnected(repositoryId, accountId, verifiedAt) {
    const saved = await db.aWSConnection.update({
      where: { repositoryId },
      data: {
        status: AWSConnectionStatus.CONNECTED,
        awsAccountId: accountId,
        lastVerifiedAt: verifiedAt,
        verificationError: null,
      },
    });
    return toAwsConnectionRecord(saved);
  },

  async markFailed(repositoryId, status, safeError) {
    const saved = await db.aWSConnection.update({
      where: { repositoryId },
      data: {
        status: statusToDatabase[status],
        verificationError: safeError.slice(0, 500),
      },
    });
    return toAwsConnectionRecord(saved);
  },

  async disconnect(repositoryId) {
    await db.aWSConnection.deleteMany({ where: { repositoryId } });
  },
};
