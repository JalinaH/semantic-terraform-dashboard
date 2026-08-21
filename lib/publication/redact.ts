const SECRET_PATTERNS: Array<{ code: string; pattern: RegExp; replacement: string }> = [
  { code: "aws_access_key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, replacement: "[REDACTED AWS ACCESS KEY]" },
  { code: "github_token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, replacement: "[REDACTED GITHUB TOKEN]" },
  { code: "private_key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replacement: "[REDACTED PRIVATE KEY]" },
  { code: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, replacement: "Bearer [REDACTED]" },
  { code: "secret_environment", pattern: /\b(?:AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|GEMINI_API_KEY|GITHUB_TOKEN|GITHUB_APP_PRIVATE_KEY)\s*=\s*[^\s\n]+/gi, replacement: "[REDACTED SECRET ENVIRONMENT VALUE]" },
];

export function redactPublicationSecrets(value: string) {
  const warnings = new Set<string>();
  let content = value;
  for (const candidate of SECRET_PATTERNS) {
    content = content.replace(candidate.pattern, () => {
      warnings.add(candidate.code);
      return candidate.replacement;
    });
  }
  return { content, warnings: [...warnings] };
}
