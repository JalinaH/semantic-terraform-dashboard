export function getRepositoryConfigStatus(
  config: { enabled: boolean } | null,
  awsConnection?: { status: string } | null,
  accessible = true,
) {
  if (!config) return "not_configured" as const;
  if (!config.enabled) return "disabled" as const;
  if (accessible && (awsConnection?.status === "CONNECTED" || awsConnection?.status === "connected")) return "ready" as const;
  return "configured" as const;
}

export function getRepositorySetupLabel(
  accessible: boolean,
  config: { enabled: boolean } | null,
  awsConnection?: { status: string } | null,
) {
  if (!accessible) return "GitHub access removed" as const;
  const status = getRepositoryConfigStatus(config, awsConnection, accessible);
  if (status === "not_configured") return "Not configured" as const;
  if (status === "disabled") return "Disabled" as const;
  if (status === "ready") return "Ready" as const;
  return "AWS setup required" as const;
}
