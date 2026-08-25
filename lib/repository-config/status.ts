export function getRepositoryConfigStatus(
  config: { enabled: boolean } | null,
  awsConnection?: { status: string } | null,
  accessible = true,
  modelPolicyValid = true,
) {
  if (!config) return "not_configured" as const;
  if (!config.enabled) return "disabled" as const;
  if (!modelPolicyValid) return "attention" as const;
  if (accessible) return "ready" as const;
  return "configured" as const;
}

export function getRepositorySetupLabel(
  accessible: boolean,
  config: { enabled: boolean } | null,
  awsConnection?: { status: string } | null,
  modelPolicyValid = true,
) {
  if (!accessible) return "GitHub access removed" as const;
  const status = getRepositoryConfigStatus(config, awsConnection, accessible, modelPolicyValid);
  if (status === "not_configured") return "Not configured" as const;
  if (status === "disabled") return "Disabled" as const;
  if (status === "attention") return "Model policy needs attention" as const;
  if (status === "ready") return "Ready" as const;
  return "GitHub access removed" as const;
}
