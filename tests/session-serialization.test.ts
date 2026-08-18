import { describe, expect, it } from "vitest";
import { toSafeSessionUser } from "@/lib/auth/session-mapping";

describe("client session serialization", () => {
  it("includes identity fields but excludes provider and app secrets", () => {
    const source = {
      id: "user_1",
      name: "Octo User",
      email: "octo@example.com",
      image: "https://avatars.githubusercontent.com/u/1",
      githubUserId: "1",
      githubLogin: "octo",
      avatarUrl: "https://avatars.githubusercontent.com/u/1",
      access_token: "github-user-token",
      refresh_token: "github-refresh-token",
      privateKey: "github-app-private-key",
    };
    const serialized = JSON.stringify(toSafeSessionUser(source));

    expect(serialized).toContain("octo");
    expect(serialized).not.toContain("github-user-token");
    expect(serialized).not.toContain("github-refresh-token");
    expect(serialized).not.toContain("github-app-private-key");
  });
});
