export function getRepositoryConfigStatus(config: { enabled: boolean } | null) {
  if (!config) return "not_configured" as const;
  if (!config.enabled) return "disabled" as const;
  return "configured" as const;
}
