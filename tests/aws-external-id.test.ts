import { describe, expect, it } from "vitest";
import { generateExternalId } from "@/lib/aws/external-id";

describe("AWS External IDs", () => {
  it("generates non-empty, high-entropy repository identifiers", () => {
    const externalId = generateExternalId();
    expect(externalId).toMatch(/^stfa_[A-Za-z0-9_-]{43}$/);
    expect(externalId.length).toBeGreaterThan(40);
  });

  it("does not reuse or derive the value from a repository ID", () => {
    const repositoryId = "repo-known-value";
    const values = new Set(Array.from({ length: 64 }, () => generateExternalId()));
    expect(values.size).toBe(64);
    for (const value of values) expect(value).not.toContain(repositoryId);
  });
});
