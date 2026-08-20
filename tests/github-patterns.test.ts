import { describe, expect, it } from "vitest";
import { matchesConfiguredWorkflow, matchesTerraformPath } from "@/lib/github/patterns";

describe("hosted trigger patterns", () => {
  it("matches exact workflow names case-insensitively and explicit safe globs", () => {
    expect(matchesConfiguredWorkflow("Terraform CI", ["terraform ci"], [])).toBe(true);
    expect(matchesConfiguredWorkflow("Infrastructure / Plan", [], ["Infrastructure*Plan"])).toBe(true);
    expect(matchesConfiguredWorkflow("Unit tests", ["Terraform CI"], ["Infrastructure*"])).toBe(false);
  });

  it("matches root and nested Terraform paths without matching ordinary code", () => {
    expect(matchesTerraformPath("main.tf", ["**/*.tf"])).toBe(true);
    expect(matchesTerraformPath("environments/prod/main.tf.json", ["**/*.tf.json"])).toBe(true);
    expect(matchesTerraformPath("src/main.ts", ["**/*.tf"])).toBe(false);
  });
});
