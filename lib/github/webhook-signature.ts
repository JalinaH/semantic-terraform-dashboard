import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PATTERN = /^sha256=([a-f0-9]{64})$/i;

export function createGitHubWebhookSignature(secret: string, rawBody: Uint8Array | string) {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

export function verifyGitHubWebhookSignature(
  secret: string,
  rawBody: Uint8Array | string,
  signatureHeader: string | null,
) {
  const providedMatch = signatureHeader ? SIGNATURE_PATTERN.exec(signatureHeader.trim()) : null;
  if (!providedMatch) return false;
  const expected = Buffer.from(createGitHubWebhookSignature(secret, rawBody).slice(7), "hex");
  const provided = Buffer.from(providedMatch[1], "hex");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
