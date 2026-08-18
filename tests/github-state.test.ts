import { describe, expect, it } from "vitest";
import { createInstallationState, stateMatchesCookie, verifyInstallationState } from "@/lib/github/state";
import { validateInternalRedirect } from "@/lib/security/redirect";

const SECRET = "a-test-secret-long-enough-for-state-signing";

describe("installation state", () => {
  it("binds the callback to a user and safe internal destination", async () => {
    const token = await createInstallationState({ userId: "user_1", returnTo: "/settings?tab=github", secret: SECRET, nonce: "nonce-1" });
    await expect(verifyInstallationState(token, "user_1", SECRET)).resolves.toEqual({ nonce: "nonce-1", returnTo: "/settings?tab=github" });
    await expect(verifyInstallationState(token, "user_2", SECRET)).rejects.toMatchObject({ code: "invalid_callback" });
  });

  it("requires the signed state to match the HTTP-only correlation cookie", async () => {
    const token = await createInstallationState({ userId: "user_1", secret: SECRET });
    expect(stateMatchesCookie(token, token)).toBe(true);
    expect(stateMatchesCookie(token, `${token}x`)).toBe(false);
    expect(stateMatchesCookie(token, undefined)).toBe(false);
  });

  it.each(["https://evil.example/x", "//evil.example/x", "/\\evil", "/safe\nLocation: x"])("rejects unsafe redirect %s", (value) => {
    expect(validateInternalRedirect(value, "/dashboard")).toBe("/dashboard");
  });

  it("preserves valid internal paths", () => {
    expect(validateInternalRedirect("/repositories?github=connected#top")).toBe("/repositories?github=connected#top");
  });
});
