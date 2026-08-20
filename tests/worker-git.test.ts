import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { buildRepositoryCloneUrl, createRepositoryDiff } from "@/worker/github";
import { claimedRun } from "@/tests/phase5-fixtures";

const execute = promisify(execFile);

describe("worker Git checkout contract", () => {
  it("constructs a token-free repository remote URL", () => {
    const url = buildRepositoryCloneUrl("acme/infrastructure");
    expect(url).toBe("https://github.com/acme/infrastructure.git");
    expect(url).not.toContain("x-access-token");
    expect(url).not.toContain("github_pat_");
  });

  it("generates the explicit base-to-failing-revision diff", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "stfa-git-test-"));
    try {
      await git(directory, "init");
      await git(directory, "config", "user.email", "test@example.com");
      await git(directory, "config", "user.name", "STFA Test");
      await writeFile(path.join(directory, "main.tf"), "resource \"aws_s3_bucket\" \"assets\" {}\n");
      await git(directory, "add", "main.tf");
      await git(directory, "commit", "-m", "base");
      const baseSha = (await git(directory, "rev-parse", "HEAD")).trim();
      await writeFile(path.join(directory, "main.tf"), "resource \"aws_s3_bucket\" \"assets\" {\n  force_destroy = true\n}\n");
      await git(directory, "add", "main.tf");
      await git(directory, "commit", "-m", "head");
      const commitSha = (await git(directory, "rev-parse", "HEAD")).trim();
      const diff = await createRepositoryDiff(claimedRun({ baseSha, commitSha, headSha: commitSha }), directory);
      expect(diff).toContain("+  force_destroy = true");
      expect(diff).toContain("diff --git a/main.tf b/main.tf");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

async function git(cwd: string, ...args: string[]) {
  const result = await execute("git", args, { cwd });
  return result.stdout;
}
