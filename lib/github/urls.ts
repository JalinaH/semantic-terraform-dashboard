import { getGitHubAppConfiguration } from "@/lib/config";

export function getGitHubAppInstallationUrl(state: string) {
  const { slug } = getGitHubAppConfiguration();
  const url = new URL(`https://github.com/apps/${encodeURIComponent(slug)}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export function getGitHubInstallationManagementUrl(
  installationId: string,
  storedUrl: string | null,
) {
  if (storedUrl?.startsWith("https://github.com/")) return storedUrl;
  return `https://github.com/settings/installations/${encodeURIComponent(installationId)}`;
}
