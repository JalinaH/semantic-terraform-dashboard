const BUILD_ONLY_AUTH_SECRET = "phase-2-build-only-secret-auth-disabled";

export interface IntegrationConfigurationStatus {
  authentication: boolean;
  githubApp: boolean;
  database: boolean;
  missingAuthentication: string[];
  missingGitHubApp: string[];
}

function present(value: string | undefined) {
  return Boolean(value?.trim());
}

export function getIntegrationConfigurationStatus(): IntegrationConfigurationStatus {
  const authenticationChecks = {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID,
    GITHUB_APP_CLIENT_SECRET: process.env.GITHUB_APP_CLIENT_SECRET,
  };
  const appChecks = {
    GITHUB_APP_ID: process.env.GITHUB_APP_ID,
    GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
  };
  const missingAuthentication = Object.entries(authenticationChecks)
    .filter(([, value]) => !present(value))
    .map(([key]) => key);
  const missingGitHubApp = Object.entries(appChecks)
    .filter(([, value]) => !present(value))
    .map(([key]) => key);
  if (!normalizeGitHubAppSlug(process.env.GITHUB_APP_SLUG)) {
    missingGitHubApp.push("GITHUB_APP_SLUG");
  }

  return {
    authentication: missingAuthentication.length === 0,
    githubApp: missingAuthentication.length === 0 && missingGitHubApp.length === 0,
    database: present(process.env.DATABASE_URL),
    missingAuthentication,
    missingGitHubApp,
  };
}

export function getAuthSecret() {
  return process.env.AUTH_SECRET?.trim() || BUILD_ONLY_AUTH_SECRET;
}

export interface GitHubAppConfiguration {
  appId: string;
  clientId: string;
  clientSecret: string;
  slug: string;
  privateKey: string;
}

export class MissingIntegrationConfigurationError extends Error {
  constructor(public readonly missing: string[]) {
    super(`GitHub integration is missing ${missing.length} required configuration value(s).`);
    this.name = "MissingIntegrationConfigurationError";
  }
}

export function getGitHubAppConfiguration(): GitHubAppConfiguration {
  const integration = getIntegrationConfigurationStatus();
  const slug = normalizeGitHubAppSlug(process.env.GITHUB_APP_SLUG);
  if (!integration.githubApp || !slug) {
    throw new MissingIntegrationConfigurationError([
      ...integration.missingAuthentication,
      ...integration.missingGitHubApp,
    ]);
  }

  return {
    appId: process.env.GITHUB_APP_ID!.trim(),
    clientId: process.env.GITHUB_APP_CLIENT_ID!.trim(),
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET!.trim(),
    slug,
    privateKey: normalizePrivateKey(process.env.GITHUB_APP_PRIVATE_KEY!),
  };
}

export function normalizePrivateKey(value: string) {
  return value.trim().replace(/\\n/g, "\n");
}

const GITHUB_APP_SLUG_PATTERN = /^[a-zA-Z0-9-]+$/;

/**
 * Accept the canonical slug as well as URLs commonly copied from GitHub's
 * public App page or developer settings. Only github.com URLs are trusted.
 */
export function normalizeGitHubAppSlug(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;
  if (GITHUB_APP_SLUG_PATTERN.test(candidate)) return candidate;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
    const segments = url.pathname.split("/").filter(Boolean);
    const slug =
      segments.length === 2 && segments[0] === "apps"
        ? segments[1]
        : segments.length === 3 && segments[0] === "settings" && segments[1] === "apps"
          ? segments[2]
          : null;
    return slug && GITHUB_APP_SLUG_PATTERN.test(slug) ? slug : null;
  } catch {
    return null;
  }
}
