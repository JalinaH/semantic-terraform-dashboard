import { describe, expect, it } from "vitest";
import { safeStartupDiagnostic } from "@/worker/diagnostics";

describe("worker startup diagnostics", () => {
  it("reports a safe Prisma code without serializing its connection message", () => {
    const error = Object.assign(new Error("postgresql://user:secret@example.test/database"), { code: "P2021" });
    const diagnostic = safeStartupDiagnostic(error);
    expect(diagnostic).toEqual({ errorName: "Error", errorCode: "P2021" });
    expect(JSON.stringify(diagnostic)).not.toContain("secret");
    expect(JSON.stringify(diagnostic)).not.toContain("example.test");
  });

  it("uses a bounded generic code for unknown failures", () => {
    expect(safeStartupDiagnostic(new Error("private details"))).toEqual({
      errorName: "Error",
      errorCode: "worker_startup_failed",
    });
  });
});
