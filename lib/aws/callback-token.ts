import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const CALLBACK_TOKEN_PREFIX = "tfxcb_";

export function generateAwsCallbackToken() {
  return `${CALLBACK_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashAwsCallbackToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function callbackTokenMatches(token: string, expectedHash: string) {
  const actual = Buffer.from(hashAwsCallbackToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
