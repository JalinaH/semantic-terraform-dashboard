import { randomBytes } from "node:crypto";

export function generateExternalId() {
  return `stfa_${randomBytes(32).toString("base64url")}`;
}
