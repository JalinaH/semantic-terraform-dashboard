import "server-only";

import {
  AssumeRoleCommand,
  GetCallerIdentityCommand,
  STSClient,
} from "@aws-sdk/client-sts";
import { getAwsControlPlaneConfiguration } from "@/lib/config";
import { AwsVerificationError, classifyAwsSdkError } from "@/lib/aws/errors";
import type { AwsRoleVerifier } from "@/lib/aws/types";
import { parseIamRoleArn } from "@/lib/validation/aws-connection";

const ROLE_SESSION_NAME = "semantic-terraform-dashboard-verification";
const SESSION_DURATION_SECONDS = 900;

export const awsStsRoleVerifier: AwsRoleVerifier = {
  async verify(request) {
    const expected = parseIamRoleArn(request.roleArn);
    const { region: controlPlaneRegion } = getAwsControlPlaneConfiguration();
    const controlPlaneSts = new STSClient({ region: controlPlaneRegion });
    let assumedRoleSts: STSClient | undefined;

    try {
      const assumed = await controlPlaneSts.send(new AssumeRoleCommand({
        RoleArn: expected.roleArn,
        RoleSessionName: ROLE_SESSION_NAME,
        DurationSeconds: SESSION_DURATION_SECONDS,
        ExternalId: request.externalId,
      }));
      const credentials = assumed.Credentials;
      if (!credentials?.AccessKeyId || !credentials.SecretAccessKey || !credentials.SessionToken) {
        throw new AwsVerificationError("credentials_unavailable");
      }

      assumedRoleSts = new STSClient({
        region: request.region,
        credentials: {
          accessKeyId: credentials.AccessKeyId,
          secretAccessKey: credentials.SecretAccessKey,
          sessionToken: credentials.SessionToken,
          expiration: credentials.Expiration,
        },
      });
      const identity = await assumedRoleSts.send(new GetCallerIdentityCommand({}));
      if (!identity.Account || !identity.Arn) throw new AwsVerificationError("identity_mismatch");
      const expectedArnFragment = `:assumed-role/${expected.roleName}/`;
      if (identity.Account !== expected.accountId || !identity.Arn.includes(expectedArnFragment)) {
        throw new AwsVerificationError("identity_mismatch");
      }
      return { accountId: identity.Account, assumedRoleArn: identity.Arn };
    } catch (error) {
      throw classifyAwsSdkError(error);
    } finally {
      assumedRoleSts?.destroy();
      controlPlaneSts.destroy();
    }
  },
};
