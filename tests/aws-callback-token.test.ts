import { describe, expect, it } from "vitest";
import { callbackTokenMatches, generateAwsCallbackToken, hashAwsCallbackToken } from "@/lib/aws/callback-token";

describe("AWS callback tokens", () => {
  it("generates high-entropy tokens and persists only a one-way hash", () => {
    const token = generateAwsCallbackToken();
    const hash = hashAwsCallbackToken(token);
    expect(token).toMatch(/^tfxcb_[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(callbackTokenMatches(token, hash)).toBe(true);
    expect(callbackTokenMatches(`${token}x`, hash)).toBe(false);
  });
});
