import { describe, expect, it } from "vitest";
import { normalizeGitHubAppSlug } from "@/lib/config";
import { buildGitHubAppInstallationUrl } from "@/lib/github/urls";

describe("GitHub App slug normalization", () => {
  it.each([
    ["semantic-terraform-agent-dev", "semantic-terraform-agent-dev"],
    ["https://github.com/apps/semantic-terraform-agent-dev", "semantic-terraform-agent-dev"],
    ["https://github.com/apps/semantic-terraform-agent-dev/", "semantic-terraform-agent-dev"],
    ["https://github.com/settings/apps/semantic-terraform-agent-dev", "semantic-terraform-agent-dev"],
  ])("normalizes %s", (value, expected) => {
    expect(normalizeGitHubAppSlug(value)).toBe(expected);
  });

  it.each([
    "https://example.com/apps/semantic-terraform-agent-dev",
    "https://github.com/settings/apps/",
    "semantic terraform agent",
    "",
  ])("rejects invalid value %s", (value) => {
    expect(normalizeGitHubAppSlug(value)).toBeNull();
  });

  it("builds the canonical GitHub installation URL", () => {
    expect(buildGitHubAppInstallationUrl("semantic-terraform-agent-dev", "signed-state")).toBe(
      "https://github.com/apps/semantic-terraform-agent-dev/installations/new?state=signed-state",
    );
  });
});
