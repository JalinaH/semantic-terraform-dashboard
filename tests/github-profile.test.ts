import { describe, expect, it } from "vitest";
import { mapGitHubProfile } from "@/lib/auth/github-profile";

describe("GitHub profile mapping", () => {
  it("maps the stable GitHub identity fields persisted by the dashboard", () => {
    expect(mapGitHubProfile({ id: 42, login: "octo-user", name: null, email: null, avatar_url: "https://avatars.githubusercontent.com/u/42" })).toEqual({
      id: "42",
      name: "octo-user",
      email: null,
      image: "https://avatars.githubusercontent.com/u/42",
      githubUserId: "42",
      githubLogin: "octo-user",
      avatarUrl: "https://avatars.githubusercontent.com/u/42",
    });
  });
});
