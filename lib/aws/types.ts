export type AwsConnectionStatus =
  | "pending"
  | "connected"
  | "verification_failed"
  | "access_removed";

export type AwsVerificationErrorCode =
  | "role_not_found"
  | "access_denied"
  | "invalid_external_id"
  | "trust_policy_mismatch"
  | "invalid_role_arn"
  | "credentials_unavailable"
  | "network_error"
  | "identity_mismatch"
  | "unknown";

export interface AwsConnectionRecord {
  id: string;
  repositoryId: string;
  roleArn: string | null;
  region: string;
  status: AwsConnectionStatus;
  externalId: string;
  awsAccountId: string | null;
  lastVerifiedAt: Date | null;
  verificationError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AwsVerificationResult {
  accountId: string;
  assumedRoleArn: string;
}

export interface AwsRoleVerificationRequest {
  roleArn: string;
  externalId: string;
  region: string;
}

export interface AwsRoleVerifier {
  verify(request: AwsRoleVerificationRequest): Promise<AwsVerificationResult>;
}

export interface AwsActionState {
  status: "idle" | "success" | "error";
  message?: string;
  code?: AwsVerificationErrorCode;
  fieldErrors?: Partial<Record<"region" | "roleArn" | "confirmation", string[]>>;
}
