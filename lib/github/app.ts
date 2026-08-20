import { createPrivateKey } from "node:crypto";
import { SignJWT, decodeProtectedHeader, decodeJwt } from "jose";
import { Octokit } from "@octokit/rest";
import { getGitHubAppSigningConfiguration, type GitHubAppSigningConfiguration } from "@/lib/config";
import { GitHubIntegrationError, mapGitHubApiError } from "@/lib/github/errors";

const API_VERSION = "2022-11-28";
const USER_AGENT = "semantic-terraform-dashboard/0.5";

export interface GitHubInstallationMetadata {
  installationId: string;
  accountId: string | null;
  accountLogin: string;
  accountType: "USER" | "ORGANIZATION";
  repositorySelection: "ALL" | "SELECTED";
  htmlUrl: string | null;
  suspendedAt: Date | null;
}

export interface GitHubRepositorySnapshot {
  githubRepositoryId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  archived: boolean;
}

interface CreateAppJwtOptions {
  issuer: string;
  privateKey: string;
  now?: Date;
}

export async function createGitHubAppJwt({ issuer, privateKey, now = new Date() }: CreateAppJwtOptions) {
  const issuedAt = Math.floor(now.getTime() / 1000) - 60;
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(issuer)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 9 * 60)
    .sign(createPrivateKey(privateKey));
}

export function inspectAppJwt(token: string) {
  const header = decodeProtectedHeader(token);
  const payload = decodeJwt(token);
  return { algorithm: header.alg, issuer: payload.iss, issuedAt: payload.iat, expiresAt: payload.exp };
}

async function createAppOctokit(configuration: GitHubAppSigningConfiguration) {
  const token = await createGitHubAppJwt({
    issuer: configuration.clientId,
    privateKey: configuration.privateKey,
  });
  return new Octokit({ auth: token, userAgent: USER_AGENT });
}

function numericInstallationId(value: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new GitHubIntegrationError("invalid_callback");
  }
  return parsed;
}

export async function fetchInstallationMetadata(
  installationId: string,
  configuration = getGitHubAppSigningConfiguration(),
): Promise<GitHubInstallationMetadata> {
  try {
    const octokit = await createAppOctokit(configuration);
    const response = await octokit.rest.apps.getInstallation({
      installation_id: numericInstallationId(installationId),
      headers: { "X-GitHub-Api-Version": API_VERSION },
    });
    const account = response.data.account;
    if (!account || !("login" in account)) {
      throw new GitHubIntegrationError("installation_inaccessible");
    }
    const accountType = response.data.target_type === "Organization" ? "ORGANIZATION" : "USER";
    return {
      installationId: String(response.data.id),
      accountId: "id" in account ? String(account.id) : null,
      accountLogin: account.login,
      accountType,
      repositorySelection: response.data.repository_selection === "all" ? "ALL" : "SELECTED",
      htmlUrl: response.data.html_url ?? null,
      suspendedAt: response.data.suspended_at ? new Date(response.data.suspended_at) : null,
    };
  } catch (error) {
    if (error instanceof GitHubIntegrationError) throw error;
    throw mapGitHubApiError(error, "github_unavailable");
  }
}

export async function createInstallationAccessToken(
  installationId: string,
  configuration = getGitHubAppSigningConfiguration(),
) {
  try {
    const octokit = await createAppOctokit(configuration);
    const response = await octokit.rest.apps.createInstallationAccessToken({
      installation_id: numericInstallationId(installationId),
      headers: { "X-GitHub-Api-Version": API_VERSION },
    });
    return response.data.token;
  } catch (error) {
    throw mapGitHubApiError(error, "github_unavailable");
  }
}

export async function listInstallationRepositories(installationId: string) {
  try {
    const token = await createInstallationAccessToken(installationId);
    const octokit = new Octokit({ auth: token, userAgent: USER_AGENT });
    const repositories: GitHubRepositorySnapshot[] = [];
    let page = 1;

    while (true) {
      const response = await octokit.rest.apps.listReposAccessibleToInstallation({
        per_page: 100,
        page,
        headers: { "X-GitHub-Api-Version": API_VERSION },
      });
      repositories.push(
        ...response.data.repositories.map((repository) => ({
          githubRepositoryId: String(repository.id),
          owner: repository.owner.login,
          name: repository.name,
          fullName: repository.full_name,
          defaultBranch: repository.default_branch,
          private: repository.private,
          archived: repository.archived,
        })),
      );
      if (response.data.repositories.length < 100) break;
      page += 1;
    }
    return repositories;
  } catch (error) {
    if (error instanceof GitHubIntegrationError) throw error;
    throw mapGitHubApiError(error, "sync_failed");
  }
}
