"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  AwsConnectionAccessError,
  disconnectAwsConnection,
  saveAwsRole,
  startAwsOnboarding,
  verifyAwsConnection,
} from "@/lib/aws/connection";
import { AwsVerificationError } from "@/lib/aws/errors";
import { generateExternalId } from "@/lib/aws/external-id";
import { awsStsRoleVerifier } from "@/lib/aws/sts";
import type { AwsActionState } from "@/lib/aws/types";
import { getAwsControlPlaneConfigurationStatus } from "@/lib/config";
import { prismaAwsConnectionStore } from "@/lib/data/aws-connections";
import {
  awsRegionInputSchema,
  awsRoleInputSchema,
  repositoryIdSchema,
} from "@/lib/validation/aws-connection";

const GENERIC_ERROR = "The AWS connection could not be updated. Please try again.";

export async function startAwsOnboardingAction(
  repositoryId: string,
  _previousState: AwsActionState,
  formData: FormData,
): Promise<AwsActionState> {
  const identity = await getActionIdentity(repositoryId);
  if (!identity.ok) return identity.state;
  const parsed = awsRegionInputSchema.safeParse({ region: formData.get("region") });
  if (!parsed.success) return validationState("region", parsed.error.issues.map((issue) => issue.message));

  try {
    await startAwsOnboarding(
      prismaAwsConnectionStore,
      generateExternalId,
      identity.userId,
      identity.repositoryId,
      parsed.data.region,
    );
    revalidateAwsPaths(identity.repositoryId);
    return { status: "success", message: "AWS onboarding started. Create or provide the repository IAM role." };
  } catch (error) {
    return safeActionError(error, "start", identity.userId, identity.repositoryId);
  }
}

export async function saveAwsRoleAction(
  repositoryId: string,
  _previousState: AwsActionState,
  formData: FormData,
): Promise<AwsActionState> {
  const identity = await getActionIdentity(repositoryId);
  if (!identity.ok) return identity.state;
  const parsed = awsRoleInputSchema.safeParse({ roleArn: formData.get("roleArn") });
  if (!parsed.success) return validationState("roleArn", parsed.error.issues.map((issue) => issue.message));

  try {
    await saveAwsRole(prismaAwsConnectionStore, identity.userId, identity.repositoryId, parsed.data.roleArn);
    revalidateAwsPaths(identity.repositoryId);
    return { status: "success", message: "IAM role saved. Verify the connection when the trust policy is ready." };
  } catch (error) {
    return safeActionError(error, "save_role", identity.userId, identity.repositoryId);
  }
}

export async function verifyAwsConnectionAction(
  repositoryId: string,
  _previousState: AwsActionState,
  _formData: FormData,
): Promise<AwsActionState> {
  void _previousState;
  void _formData;
  const identity = await getActionIdentity(repositoryId);
  if (!identity.ok) return identity.state;
  if (!getAwsControlPlaneConfigurationStatus().configured) {
    return { status: "error", message: "AWS verification is not configured for this dashboard environment." };
  }

  try {
    const connection = await verifyAwsConnection(
      prismaAwsConnectionStore,
      awsStsRoleVerifier,
      identity.userId,
      identity.repositoryId,
    );
    revalidateAwsPaths(identity.repositoryId);
    return { status: "success", message: `AWS connection verified for account ${connection.awsAccountId}.` };
  } catch (error) {
    return safeActionError(error, "verify", identity.userId, identity.repositoryId);
  }
}

export async function disconnectAwsConnectionAction(
  repositoryId: string,
  _previousState: AwsActionState,
  formData: FormData,
): Promise<AwsActionState> {
  const identity = await getActionIdentity(repositoryId);
  if (!identity.ok) return identity.state;
  if (formData.get("confirmation") !== "disconnect") {
    return validationState("confirmation", ["Confirm that you want to disconnect this repository."]);
  }

  try {
    await disconnectAwsConnection(prismaAwsConnectionStore, identity.userId, identity.repositoryId);
    revalidateAwsPaths(identity.repositoryId);
    return { status: "success", message: "AWS disconnected from the dashboard. The IAM role was not deleted in AWS." };
  } catch (error) {
    return safeActionError(error, "disconnect", identity.userId, identity.repositoryId);
  }
}

async function getActionIdentity(repositoryId: string): Promise<
  | { ok: true; userId: string; repositoryId: string }
  | { ok: false; state: AwsActionState }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, state: { status: "error", message: "Your session expired. Sign in again." } };
  const parsedId = repositoryIdSchema.safeParse(repositoryId);
  if (!parsedId.success) return { ok: false, state: { status: "error", message: GENERIC_ERROR } };
  return { ok: true, userId: session.user.id, repositoryId: parsedId.data };
}

function validationState(field: "region" | "roleArn" | "confirmation", messages: string[]): AwsActionState {
  return { status: "error", message: "Review the highlighted field and try again.", fieldErrors: { [field]: messages } };
}

function safeActionError(error: unknown, operation: string, userId: string, repositoryId: string): AwsActionState {
  if (error instanceof AwsVerificationError) {
    return { status: "error", code: error.code, message: error.message };
  }
  if (error instanceof AwsConnectionAccessError) {
    const messages: Record<AwsConnectionAccessError["code"], string> = {
      repository_not_found: "This repository is not available to your account.",
      repository_access_removed: "Restore GitHub access before changing the AWS connection.",
      repository_not_configured: "Save the repository configuration before connecting AWS.",
      connection_not_started: "Choose an AWS region before configuring the role.",
      role_not_configured: "Save an IAM role ARN before verifying the connection.",
      connected_reconnect_required: "Use guided Reconnect to preserve the current working role until its replacement is verified.",
    };
    return { status: "error", message: messages[error.code] };
  }
  console.error("AWS connection operation failed", { operation, userId, repositoryId });
  return { status: "error", message: GENERIC_ERROR };
}

function revalidateAwsPaths(repositoryId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/repositories");
  revalidatePath(`/repositories/${repositoryId}`);
  revalidatePath(`/repositories/${repositoryId}/aws`);
  revalidatePath("/settings");
}
