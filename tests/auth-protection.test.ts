import { describe, expect, it } from "vitest";
import { isProtectedPath, shouldRedirectUnauthenticated } from "@/lib/auth/protection";

describe("protected routes", () => {
  it.each(["/dashboard", "/repositories", "/repositories/repo_1", "/runs", "/settings", "/github/install"])("protects %s", (pathname) => {
    expect(isProtectedPath(pathname)).toBe(true);
    expect(shouldRedirectUnauthenticated(pathname, false)).toBe(true);
    expect(shouldRedirectUnauthenticated(pathname, true)).toBe(false);
  });

  it.each(["/", "/auth/error", "/api/auth/callback/github"])("leaves %s public", (pathname) => {
    expect(isProtectedPath(pathname)).toBe(false);
  });
});
