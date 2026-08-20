import type { AwsVerificationErrorCode } from "@/lib/aws/types";

export const AWS_ERROR_MESSAGES: Record<AwsVerificationErrorCode, string> = {
  role_not_found: "AWS could not find the IAM role. Confirm the account ID and role name.",
  access_denied: "AWS denied the AssumeRole request. Review the generated trust policy and External ID.",
  invalid_external_id: "The IAM trust policy does not contain the expected repository External ID.",
  trust_policy_mismatch: "The role trust relationship does not allow the Semantic Terraform Agent service to assume it.",
  invalid_role_arn: "The role ARN is not a valid AWS IAM role ARN.",
  credentials_unavailable: "The control plane has no usable AWS credentials. Configure its workload identity or local AWS credential chain.",
  network_error: "AWS STS could not be reached. Check network access and try again.",
  identity_mismatch: "AWS returned an identity that did not match the configured role account and role name.",
  unknown: "AWS connection verification failed. Review the role setup and try again.",
};

export class AwsVerificationError extends Error {
  constructor(readonly code: AwsVerificationErrorCode, options?: { cause?: unknown }) {
    super(AWS_ERROR_MESSAGES[code], options);
    this.name = "AwsVerificationError";
  }
}

export function classifyAwsSdkError(error: unknown) {
  if (error instanceof AwsVerificationError) return error;
  const name = getStringProperty(error, "name") ?? "";
  const code = getStringProperty(error, "code") ?? "";
  const message = (getStringProperty(error, "message") ?? "").toLowerCase();

  if (name === "CredentialsProviderError" || ["InvalidClientTokenId", "UnrecognizedClientException"].includes(name)) {
    return new AwsVerificationError("credentials_unavailable", { cause: error });
  }
  if (name === "NoSuchEntity" || message.includes("cannot be found") || message.includes("does not exist")) {
    return new AwsVerificationError("role_not_found", { cause: error });
  }
  if (name === "AccessDenied" || name === "AccessDeniedException" || code === "AccessDenied") {
    if (message.includes("external id") || message.includes("externalid")) {
      return new AwsVerificationError("invalid_external_id", { cause: error });
    }
    if (message.includes("trust") || message.includes("assume role policy")) {
      return new AwsVerificationError("trust_policy_mismatch", { cause: error });
    }
    return new AwsVerificationError("access_denied", { cause: error });
  }
  if (
    ["TimeoutError", "NetworkingError"].includes(name) ||
    ["ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN"].includes(code)
  ) {
    return new AwsVerificationError("network_error", { cause: error });
  }
  return new AwsVerificationError("unknown", { cause: error });
}

function getStringProperty(value: unknown, key: string) {
  if (!value || typeof value !== "object" || !(key in value)) return undefined;
  const property = Reflect.get(value, key);
  return typeof property === "string" ? property : undefined;
}
