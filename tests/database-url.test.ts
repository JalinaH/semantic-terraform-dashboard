import { describe, expect, it } from "vitest";
import { databaseUrlWithConnectionTimeout } from "@/lib/db";

describe("database connection URL", () => {
  it("adds a bounded connection timeout without changing the configured endpoint", () => {
    const input = "postgresql://user:password@db.example.test:5432/app?sslmode=require";
    const output = new URL(databaseUrlWithConnectionTimeout(input)!);
    expect(output.hostname).toBe("db.example.test");
    expect(output.searchParams.get("sslmode")).toBe("require");
    expect(output.searchParams.get("connect_timeout")).toBe("15");
  });

  it("preserves an explicitly configured connection timeout", () => {
    const input = "postgresql://user:password@db.example.test/app?connect_timeout=30";
    expect(new URL(databaseUrlWithConnectionTimeout(input)!).searchParams.get("connect_timeout")).toBe("30");
  });

  it("does not throw for missing or invalid development configuration", () => {
    expect(databaseUrlWithConnectionTimeout(undefined)).toBeUndefined();
    expect(databaseUrlWithConnectionTimeout("not-a-url")).toBe("not-a-url");
  });
});
