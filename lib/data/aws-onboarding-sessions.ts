import "server-only";

import {
  AWSConnectionStatus,
  AwsOnboardingSessionStatus as DatabaseStatus,
  type AwsOnboardingSession,
} from "@prisma/client";
import { db } from "@/lib/db";
import type {
  AwsOnboardingFailureCode,
  AwsOnboardingSessionRecord,
  AwsOnboardingSessionStore,
} from "@/lib/aws/onboarding-session";
import { toAwsConnectionRecord } from "@/lib/data/aws-connections";

const statusFromDatabase = {
  PENDING: "pending",
  STACK_LAUNCHED: "stack_launched",
  CALLBACK_RECEIVED: "callback_received",
  VERIFYING: "verifying",
  CONNECTED: "connected",
  EXPIRED: "expired",
  FAILED: "failed",
} as const satisfies Record<DatabaseStatus, AwsOnboardingSessionRecord["status"]>;

function toRecord(session: AwsOnboardingSession): AwsOnboardingSessionRecord {
  return {
    ...session,
    status: statusFromDatabase[session.status],
    failureCode: session.failureCode as AwsOnboardingFailureCode | null,
  };
}

const ACTIVE_STATUSES = [
  DatabaseStatus.PENDING,
  DatabaseStatus.STACK_LAUNCHED,
  DatabaseStatus.CALLBACK_RECEIVED,
  DatabaseStatus.VERIFYING,
] as const;

export const prismaAwsOnboardingSessionStore: AwsOnboardingSessionStore = {
  async findRepositoryAccess(userId, repositoryId) {
    const repository = await db.repository.findFirst({
      where: {
        id: repositoryId,
        installation: { userInstallations: { some: { userId } } },
      },
      select: {
        id: true,
        fullName: true,
        installationId: true,
        accessible: true,
        installation: { select: { suspendedAt: true } },
        config: { select: { id: true } },
        awsConnection: true,
      },
    });
    return repository ? {
      repositoryId: repository.id,
      repositoryFullName: repository.fullName,
      installationId: repository.installationId,
      accessible: repository.accessible && repository.installation.suspendedAt === null,
      configured: Boolean(repository.config),
      currentConnection: repository.awsConnection ? toAwsConnectionRecord(repository.awsConnection) : null,
    } : null;
  },

  async create(input) {
    const session = await db.$transaction(async (transaction) => {
      await transaction.awsOnboardingSession.updateMany({
        where: { repositoryId: input.repositoryId, status: { in: [...ACTIVE_STATUSES] } },
        data: { status: DatabaseStatus.EXPIRED, completedAt: input.createdAt },
      });
      return transaction.awsOnboardingSession.create({
        data: {
          ...input,
          status: DatabaseStatus.STACK_LAUNCHED,
        },
      });
    });
    return toRecord(session);
  },

  async findForCallback(sessionId) {
    const session = await db.awsOnboardingSession.findUnique({ where: { id: sessionId } });
    return session ? toRecord(session) : null;
  },

  async findForUser(userId, repositoryId, sessionId) {
    const session = await db.awsOnboardingSession.findFirst({
      where: {
        id: sessionId,
        repositoryId,
        userId,
        repository: { installation: { userInstallations: { some: { userId } } } },
      },
    });
    return session ? toRecord(session) : null;
  },

  async findLatestForUser(userId, repositoryId) {
    const session = await db.awsOnboardingSession.findFirst({
      where: {
        repositoryId,
        userId,
        repository: { installation: { userInstallations: { some: { userId } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    return session ? toRecord(session) : null;
  },

  async markExpired(sessionId, now) {
    return toRecord(await db.awsOnboardingSession.update({
      where: { id: sessionId },
      data: { status: DatabaseStatus.EXPIRED, completedAt: now },
    }));
  },

  async claimCallback(sessionId, callbackTokenHash, roleArn, awsAccountId, now) {
    const claimed = await db.awsOnboardingSession.updateMany({
      where: {
        id: sessionId,
        callbackTokenHash,
        expiresAt: { gt: now },
        status: { in: [DatabaseStatus.PENDING, DatabaseStatus.STACK_LAUNCHED] },
      },
      data: { status: DatabaseStatus.CALLBACK_RECEIVED, callbackReceivedAt: now, roleArn, awsAccountId },
    });
    if (claimed.count !== 1) return null;
    const session = await db.awsOnboardingSession.findUniqueOrThrow({ where: { id: sessionId } });
    return toRecord(session);
  },

  async markVerifying(sessionId) {
    return toRecord(await db.awsOnboardingSession.update({
      where: { id: sessionId },
      data: { status: DatabaseStatus.VERIFYING },
    }));
  },

  async markFailed(sessionId, code, completedAt) {
    return toRecord(await db.awsOnboardingSession.update({
      where: { id: sessionId },
      data: { status: DatabaseStatus.FAILED, failureCode: code, completedAt },
    }));
  },

  async completeVerified(input) {
    return db.$transaction(async (transaction) => {
      const changed = await transaction.awsOnboardingSession.updateMany({
        where: { id: input.sessionId, status: DatabaseStatus.VERIFYING, expiresAt: { gt: input.verifiedAt } },
        data: {
          status: DatabaseStatus.CONNECTED,
          roleArn: input.roleArn,
          awsAccountId: input.accountId,
          completedAt: input.verifiedAt,
          failureCode: null,
        },
      });
      if (changed.count !== 1) throw new Error("AWS onboarding session is no longer verifiable.");
      const connection = await transaction.aWSConnection.upsert({
        where: { repositoryId: input.repositoryId },
        create: {
          repositoryId: input.repositoryId,
          roleArn: input.roleArn,
          region: input.region,
          status: AWSConnectionStatus.CONNECTED,
          externalId: input.externalId,
          awsAccountId: input.accountId,
          lastVerifiedAt: input.verifiedAt,
        },
        update: {
          roleArn: input.roleArn,
          region: input.region,
          status: AWSConnectionStatus.CONNECTED,
          externalId: input.externalId,
          awsAccountId: input.accountId,
          lastVerifiedAt: input.verifiedAt,
          verificationError: null,
        },
      });
      const session = await transaction.awsOnboardingSession.findUniqueOrThrow({ where: { id: input.sessionId } });
      return { session: toRecord(session), connection: toAwsConnectionRecord(connection) };
    });
  },
};
