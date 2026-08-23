import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { getAwsControlPlaneConfiguration } from "@/lib/config";
import { WorkerExecutionError } from "@/lib/worker/errors";
import type { TemporaryAwsCredentials } from "@/lib/worker/types";
import { parseIamRoleArn } from "@/lib/validation/aws-connection";

interface AwsRoleRun {
  id: string;
  aws: { roleArn: string; externalId: string; region: string; connected: boolean } | null;
}

export async function assumeWorkerRepositoryRole(run: AwsRoleRun, signal?: AbortSignal): Promise<TemporaryAwsCredentials> {
  if (!run.aws) throw new WorkerExecutionError("repository_access_removed");
  const expected = parseIamRoleArn(run.aws.roleArn);
  const controlPlane = new STSClient({ region: getAwsControlPlaneConfiguration().region });
  let customer: STSClient | null = null;
  try {
    const assumed = await controlPlane.send(new AssumeRoleCommand({
      RoleArn: run.aws.roleArn,
      ExternalId: run.aws.externalId,
      RoleSessionName: `stfa-${run.id.slice(0, 24)}`,
      DurationSeconds: 900,
    }), { abortSignal: signal });
    const credentials = assumed.Credentials;
    if (!credentials?.AccessKeyId || !credentials.SecretAccessKey || !credentials.SessionToken) {
      throw new WorkerExecutionError("aws_assume_role_failed");
    }
    customer = new STSClient({
      region: run.aws.region,
      credentials: {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken,
        expiration: credentials.Expiration,
      },
    });
    const identity = await customer.send(new GetCallerIdentityCommand({}), { abortSignal: signal });
    if (identity.Account !== expected.accountId || !identity.Arn?.includes(`:assumed-role/${expected.roleName}/`)) {
      throw new WorkerExecutionError("aws_assume_role_failed");
    }
    return {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
      expiration: credentials.Expiration,
      region: run.aws.region,
    };
  } catch (error) {
    if (signal?.aborted) throw new WorkerExecutionError("execution_timeout", { cause: error });
    if (error instanceof WorkerExecutionError) throw error;
    throw new WorkerExecutionError("aws_assume_role_failed", { cause: error });
  } finally {
    customer?.destroy();
    controlPlane.destroy();
  }
}
