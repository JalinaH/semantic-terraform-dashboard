import { AwsConnectionAccessError, getAuthorizedAwsContext, type AwsConnectionStore } from "@/lib/aws/connection";
import { generateCloudFormationTemplate } from "@/lib/aws/cloudformation";

export async function generateAuthorizedCloudFormationTemplate(
  store: AwsConnectionStore,
  userId: string,
  repositoryId: string,
  trustedPrincipalArn: string,
) {
  const access = await getAuthorizedAwsContext(store, userId, repositoryId);
  if (!access.connection) throw new AwsConnectionAccessError("connection_not_started");
  return {
    repositoryFullName: access.repositoryFullName,
    template: generateCloudFormationTemplate({
      trustedPrincipalArn,
      externalId: access.connection.externalId,
      repositoryId: access.repositoryId,
      repositoryFullName: access.repositoryFullName,
    }),
  };
}
