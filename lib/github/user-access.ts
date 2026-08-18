import { Octokit } from "@octokit/rest";
import { db } from "@/lib/db";
import { getGitHubAppConfiguration } from "@/lib/config";
import { GitHubIntegrationError, mapGitHubApiError } from "@/lib/github/errors";

const API_VERSION = "2022-11-28";

interface AccessibleInstallation {
  id: number;
  account: { id: number; login?: string } | null;
}

export function installationIsAccessible(installations: AccessibleInstallation[], installationId: string) {
  return installations.some((installation) => String(installation.id) === installationId);
}

export function assertInstallationIdentity(
  userInstallation: AccessibleInstallation,
  appInstallation: { installationId: string; accountId: string | null },
) {
  if (String(userInstallation.id) !== appInstallation.installationId) {
    throw new GitHubIntegrationError("installation_inaccessible");
  }
  if (appInstallation.accountId && userInstallation.account && String(userInstallation.account.id) !== appInstallation.accountId) {
    throw new GitHubIntegrationError("installation_inaccessible");
  }
}

export async function verifyUserInstallationAccess(userId: string, installationId: string) {
  const accessToken = await getGitHubUserAccessToken(userId);
  try {
    const octokit = new Octokit({ auth: accessToken });
    const installations: AccessibleInstallation[] = [];
    let page = 1;
    while (true) {
      const response = await octokit.rest.apps.listInstallationsForAuthenticatedUser({
        per_page: 100,
        page,
        headers: { "X-GitHub-Api-Version": API_VERSION },
      });
      installations.push(...response.data.installations);
      if (response.data.installations.length < 100) break;
      page += 1;
    }
    const installation = installations.find((candidate) => String(candidate.id) === installationId);
    if (!installation) throw new GitHubIntegrationError("installation_inaccessible");
    return installation;
  } catch (error) {
    if (error instanceof GitHubIntegrationError) throw error;
    throw mapGitHubApiError(error, "installation_inaccessible");
  }
}

async function getGitHubUserAccessToken(userId: string) {
  const account = await db.account.findFirst({
    where: { userId, provider: "github" },
    select: {
      id: true,
      access_token: true,
      expires_at: true,
      refresh_token: true,
    },
  });
  if (!account?.access_token) throw new GitHubIntegrationError("user_token_unavailable");
  const now = Math.floor(Date.now() / 1000);
  if (!account.expires_at || account.expires_at > now + 60) return account.access_token;
  if (!account.refresh_token) throw new GitHubIntegrationError("user_token_expired");

  const configuration = getGitHubAppConfiguration();
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
    cache: "no-store",
  });
  const payload: unknown = await response.json();
  if (!response.ok || !isRefreshResponse(payload)) {
    throw new GitHubIntegrationError("user_token_expired");
  }
  await db.account.update({
    where: { id: account.id },
    data: {
      access_token: payload.access_token,
      expires_at: now + payload.expires_in,
      refresh_token: payload.refresh_token ?? account.refresh_token,
      refresh_token_expires_in: payload.refresh_token_expires_in,
    },
  });
  return payload.access_token;
}

interface RefreshResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

function isRefreshResponse(value: unknown): value is RefreshResponse {
  if (!value || typeof value !== "object") return false;
  return (
    typeof Reflect.get(value, "access_token") === "string" &&
    typeof Reflect.get(value, "expires_in") === "number"
  );
}
