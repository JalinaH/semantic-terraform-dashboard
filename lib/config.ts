import { awsRegionSchema, iamPrincipalArnSchema } from "@/lib/validation/aws-connection";

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

export interface GitHubAppSigningConfiguration {
  clientId: string;
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

export function getGitHubAppSigningConfiguration(): GitHubAppSigningConfiguration {
  const missing = [
    ...(!present(process.env.GITHUB_APP_CLIENT_ID) ? ["GITHUB_APP_CLIENT_ID"] : []),
    ...(!present(process.env.GITHUB_APP_PRIVATE_KEY) ? ["GITHUB_APP_PRIVATE_KEY"] : []),
  ];
  if (missing.length) throw new MissingIntegrationConfigurationError(missing);
  return {
    clientId: process.env.GITHUB_APP_CLIENT_ID!.trim(),
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

export function getGitHubAppBotLogin() {
  const slug = normalizeGitHubAppSlug(process.env.GITHUB_APP_SLUG);
  if (!slug) throw new MissingIntegrationConfigurationError(["GITHUB_APP_SLUG"]);
  return `${slug}[bot]`;
}

export interface AwsControlPlaneConfiguration {
  region: string;
  principalArn: string;
}

export class MissingAwsConfigurationError extends Error {
  constructor(readonly missing: string[]) {
    super(`AWS control-plane configuration is missing ${missing.length} required value(s).`);
    this.name = "MissingAwsConfigurationError";
  }
}

export function getAwsControlPlaneConfigurationStatus() {
  const regionResult = awsRegionSchema.safeParse(process.env.AWS_CONTROL_PLANE_REGION?.trim());
  const principalResult = iamPrincipalArnSchema.safeParse(process.env.AWS_ASSUME_ROLE_PRINCIPAL_ARN?.trim());
  const missing = [
    ...(!regionResult.success ? ["AWS_CONTROL_PLANE_REGION"] : []),
    ...(!principalResult.success ? ["AWS_ASSUME_ROLE_PRINCIPAL_ARN"] : []),
  ];
  return { configured: missing.length === 0, missing };
}

export function getAwsControlPlaneConfiguration(): AwsControlPlaneConfiguration {
  const status = getAwsControlPlaneConfigurationStatus();
  if (!status.configured) throw new MissingAwsConfigurationError(status.missing);
  return {
    region: awsRegionSchema.parse(process.env.AWS_CONTROL_PLANE_REGION?.trim()),
    principalArn: iamPrincipalArnSchema.parse(process.env.AWS_ASSUME_ROLE_PRINCIPAL_ARN?.trim()),
  };
}

export class MissingWebhookConfigurationError extends Error {
  constructor() {
    super("GitHub webhook verification is not configured.");
    this.name = "MissingWebhookConfigurationError";
  }
}

export function getGitHubWebhookSecret() {
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  if (!secret) throw new MissingWebhookConfigurationError();
  return secret;
}

export const PINNED_AGENT_VERSION = "1.1.0";
export const PINNED_AGENT_COMMIT = "b67ddc0cf8579c5566a2335a71b586ed167d1480";
const supportedAgentVersionPattern = /^1\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export interface WorkerConfiguration {
  pollIntervalMs: number;
  jobTimeoutSeconds: number;
  agentCommand: string;
  agentVersion: string;
}

export function getWorkerConfiguration(): WorkerConfiguration {
  return {
    pollIntervalMs: boundedInteger(process.env.WORKER_POLL_INTERVAL_MS, 5_000, 500, 60_000),
    jobTimeoutSeconds: boundedInteger(process.env.WORKER_JOB_TIMEOUT_SECONDS, 600, 60, 1_800),
    agentCommand: process.env.SEMANTIC_TERRAFORM_AGENT_COMMAND?.trim() || "semantic-terraform-agent",
    agentVersion: process.env.SEMANTIC_TERRAFORM_AGENT_VERSION?.trim() || PINNED_AGENT_VERSION,
  };
}

export interface RuntimeConfigurationStatus {
  configured: boolean;
  missing: string[];
  invalid: string[];
}

export class InvalidRuntimeConfigurationError extends Error {
  readonly code = "worker_configuration_invalid";

  constructor(readonly target: "dashboard" | "worker", readonly status: RuntimeConfigurationStatus) {
    const details = [
      ...status.missing.map((name) => `Missing ${name}`),
      ...status.invalid.map((name) => `Invalid ${name}`),
    ];
    super(`${target === "dashboard" ? "Dashboard" : "Worker"} configuration error: ${details.join(", ")}.`);
    this.name = "InvalidRuntimeConfigurationError";
  }
}

export function getDashboardRuntimeConfigurationStatus(): RuntimeConfigurationStatus {
  const required = [
    "DATABASE_URL",
    "AUTH_SECRET",
    "AUTH_TRUST_HOST",
    "GITHUB_APP_ID",
    "GITHUB_APP_CLIENT_ID",
    "GITHUB_APP_CLIENT_SECRET",
    "GITHUB_APP_PRIVATE_KEY",
    "GITHUB_APP_SLUG",
    "GITHUB_WEBHOOK_SECRET",
    "AWS_CONTROL_PLANE_REGION",
    "AWS_ASSUME_ROLE_PRINCIPAL_ARN",
    "NEXT_PUBLIC_APP_URL",
  ] as const;
  const missing = required.filter((name) => !present(process.env[name]));
  const invalid = [
    ...(present(process.env.AUTH_TRUST_HOST) && process.env.AUTH_TRUST_HOST !== "true" ? ["AUTH_TRUST_HOST"] : []),
    ...(present(process.env.NEXT_PUBLIC_APP_URL) && !getApplicationOrigin() ? ["NEXT_PUBLIC_APP_URL"] : []),
    ...(present(process.env.GITHUB_APP_SLUG) && !normalizeGitHubAppSlug(process.env.GITHUB_APP_SLUG) ? ["GITHUB_APP_SLUG"] : []),
    ...getAwsControlPlaneConfigurationStatus().missing.filter((name) => !missing.includes(name as typeof required[number])),
  ];
  return { configured: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function getWorkerRuntimeConfigurationStatus(): RuntimeConfigurationStatus {
  const required = [
    "DATABASE_URL",
    "GITHUB_APP_CLIENT_ID",
    "GITHUB_APP_PRIVATE_KEY",
    "AWS_CONTROL_PLANE_REGION",
    "AWS_ASSUME_ROLE_PRINCIPAL_ARN",
    "OPENROUTER_API_KEY",
  ] as const;
  const missing = required.filter((name) => !present(process.env[name]));
  const configuredVersion = process.env.SEMANTIC_TERRAFORM_AGENT_VERSION?.trim() || PINNED_AGENT_VERSION;
  const invalid = [
    ...(present(process.env.AWS_CONTROL_PLANE_REGION) && !awsRegionSchema.safeParse(process.env.AWS_CONTROL_PLANE_REGION?.trim()).success ? ["AWS_CONTROL_PLANE_REGION"] : []),
    ...(present(process.env.AWS_ASSUME_ROLE_PRINCIPAL_ARN) && !iamPrincipalArnSchema.safeParse(process.env.AWS_ASSUME_ROLE_PRINCIPAL_ARN?.trim()).success ? ["AWS_ASSUME_ROLE_PRINCIPAL_ARN"] : []),
    ...(!supportedAgentVersionPattern.test(configuredVersion) ? ["SEMANTIC_TERRAFORM_AGENT_VERSION"] : []),
  ];
  return { configured: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function assertDashboardRuntimeConfiguration() {
  const status = getDashboardRuntimeConfigurationStatus();
  if (!status.configured) throw new InvalidRuntimeConfigurationError("dashboard", status);
}

export function assertWorkerRuntimeConfiguration() {
  const status = getWorkerRuntimeConfigurationStatus();
  if (!status.configured) throw new InvalidRuntimeConfigurationError("worker", status);
}

export function getHostedExecutionConfigurationStatus() {
  const missing = [
    ...(!present(process.env.GITHUB_WEBHOOK_SECRET) ? ["GITHUB_WEBHOOK_SECRET"] : []),
    ...getAwsControlPlaneConfigurationStatus().missing,
  ];
  return { configured: missing.length === 0, missing };
}

export function getApplicationOrigin() {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}
