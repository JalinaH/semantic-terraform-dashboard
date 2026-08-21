import "server-only";

import {
  AgentRunStatus,
  AWSConnectionStatus,
  Prisma,
  VerificationStatus,
  WebhookDeliveryStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import type { WebhookDeliveryStore } from "@/lib/webhooks/service";
import { toRepositoryConfigInput } from "@/lib/repository-config/mapper";

export const prismaWebhookDeliveryStore: WebhookDeliveryStore = {
  async reserve(input) {
    try {
      await db.webhookDelivery.create({
        data: {
          deliveryId: input.deliveryId,
          eventName: input.eventName,
          action: input.action,
        },
      });
      return "reserved";
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const retried = await db.webhookDelivery.updateMany({
          where: { deliveryId: input.deliveryId, status: WebhookDeliveryStatus.FAILED, agentRun: null },
          data: { status: WebhookDeliveryStatus.RECEIVED, outcome: null, skipReason: null, processedAt: null },
        });
        return retried.count === 1 ? "reserved" : "duplicate";
      }
      throw error;
    }
  },

  async findRepository(githubRepositoryId, installationId) {
    const repository = await db.repository.findFirst({
      where: {
        githubRepositoryId,
        installation: { installationId },
      },
      include: { config: true, awsConnection: true, installation: true },
    });
    if (!repository) return null;
    return {
      id: repository.id,
      installationDatabaseId: repository.installationId,
      installationId: repository.installation.installationId,
      installationActive: repository.installation.suspendedAt === null,
      accessible: repository.accessible,
      config: repository.config ? toRepositoryConfigInput(repository.config) : null,
      awsConnected: repository.awsConnection?.status === AWSConnectionStatus.CONNECTED,
    };
  },

  async createRun(input) {
    return db.$transaction(async (transaction) => {
      const config = input.repository.config;
      if (!config) throw new Error("Repository configuration disappeared before run creation.");
      const run = await transaction.agentRun.create({
        data: {
          repositoryId: input.repository.id,
          githubInstallationId: input.repository.installationDatabaseId,
          githubEventType: input.eventName,
          githubDeliveryId: input.deliveryId,
          githubRunId: input.githubRunId,
          githubRunAttempt: input.githubRunAttempt,
          githubWorkflowName: input.workflowName,
          pullRequestNumber: input.context.pullRequestNumber,
          commitSha: input.context.commitSha,
          baseSha: input.context.baseSha,
          headSha: input.context.headSha,
          branch: input.context.branch,
          comparisonFallback: input.context.comparisonFallback,
          status: input.status === "queued" ? AgentRunStatus.QUEUED : AgentRunStatus.SKIPPED,
          workerStage: input.status === "queued" ? "queued" : "skipped",
          heartbeatAt: input.status === "skipped" ? new Date() : null,
          skipReason: input.skipReason,
          verificationStatus: input.status === "queued" ? VerificationStatus.PENDING : VerificationStatus.VERIFICATION_SKIPPED,
          contextMode: databaseContextMode(config.contextMode),
          modelProvider: "GEMINI",
          model: config.model,
          maxRepairAttempts: config.maxRepairAttempts,
          eventMetadata: {
            workflowEvent: input.workflowEvent,
            changedFileCount: input.context.changedFiles.length,
            terraformChangedFileCount: input.context.changedFiles.filter((file) => /\.tf(?:\.json)?$/i.test(file)).length,
          },
          configSnapshot: {
            terraformDir: config.terraformDir,
            terraformVersion: config.terraformVersion,
            modelProvider: config.modelProvider,
            model: config.model,
            contextMode: config.contextMode,
            maxRepairAttempts: config.maxRepairAttempts,
            failedStages: config.failedStages,
          },
          completedAt: input.status === "skipped" ? new Date() : null,
        },
      });
      await transaction.webhookDelivery.update({
        where: { deliveryId: input.deliveryId },
        data: {
          repositoryId: input.repository.id,
          status: WebhookDeliveryStatus.PROCESSED,
          outcome: input.status,
          skipReason: input.skipReason,
          processedAt: new Date(),
        },
      });
      return { id: run.id };
    });
  },

  async complete(deliveryId, input) {
    await db.webhookDelivery.update({
      where: { deliveryId },
      data: {
        repositoryId: input.repositoryId,
        status: WebhookDeliveryStatus.PROCESSED,
        outcome: input.outcome,
        skipReason: input.skipReason,
        processedAt: new Date(),
      },
    });
  },

  async fail(deliveryId) {
    await db.webhookDelivery.update({
      where: { deliveryId },
      data: { status: WebhookDeliveryStatus.FAILED, outcome: "processing_failed", processedAt: new Date() },
    });
  },
};

function databaseContextMode(value: "auto" | "lightweight" | "schema-aware") {
  return { auto: "AUTO", lightweight: "LIGHTWEIGHT", "schema-aware": "SCHEMA_AWARE" }[value] as "AUTO" | "LIGHTWEIGHT" | "SCHEMA_AWARE";
}
