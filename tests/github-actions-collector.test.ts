import { describe, expect, it } from "vitest";
import { collectTerraformFailureLog, extractTerraformFailureText, inferFailedStage } from "@/lib/github/actions";

describe("GitHub Actions failure collector", () => {
  it("selects failed Terraform jobs and keeps bounded relevant evidence", async () => {
    const result = await collectTerraformFailureLog({
      async listJobs() {
        return [
          { id: 1, name: "Unit tests", conclusion: "failure", steps: [{ name: "vitest", conclusion: "failure" }] },
          { id: 2, name: "Terraform plan", conclusion: "failure", steps: [{ name: "terraform plan", conclusion: "failure" }] },
        ];
      },
      async downloadJobLog(jobId) {
        return jobId === 2 ? "terraform plan\nError: expected read_capacity to be at least 1\nresource aws_dynamodb_table.orders" : "test failure";
      },
    }, 7001);
    expect(result).toMatchObject({ failedStage: "plan", jobIds: [2] });
    expect(result?.log).toContain("aws_dynamodb_table.orders");
    expect(result?.log).not.toContain("test failure");
  });

  it("returns null when failed logs contain no Terraform evidence", async () => {
    expect(await collectTerraformFailureLog({
      async listJobs() { return [{ id: 1, name: "build", conclusion: "failure", steps: [] }]; },
      async downloadJobLog() { return "npm test exited 1"; },
    }, 1)).toBeNull();
  });

  it("strips ANSI control sequences and bounds large logs", () => {
    const log = `${"ordinary output\n".repeat(10_000)}\u001b[31mError: terraform validate failed\u001b[0m`;
    const extracted = extractTerraformFailureText(log);
    expect(extracted).toContain("terraform validate failed");
    expect(extracted).not.toContain("\u001b[31m");
    expect(extracted!.length).toBeLessThanOrEqual(40_000);
    expect(inferFailedStage(extracted!)).toBe("validate");
  });
});
