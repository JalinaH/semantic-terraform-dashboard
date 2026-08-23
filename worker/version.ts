import { runCommand, type CommandResult } from "@/worker/command";

type VersionCommandRunner = (command: string, args: string[], options: { timeoutMs: number; env: NodeJS.ProcessEnv }) => Promise<CommandResult>;

export class AgentVersionError extends Error {
  constructor(readonly code: "agent_version_mismatch" | "agent_version_unavailable", options?: { cause?: unknown }) {
    super(code === "agent_version_mismatch"
      ? "The installed semantic-terraform-agent version does not match the pinned worker version."
      : "The semantic-terraform-agent installation could not be inspected.", options);
    this.name = "AgentVersionError";
  }
}

export async function verifyInstalledAgentVersion(expectedVersion: string, runner: VersionCommandRunner = runCommand) {
  let result: CommandResult;
  try {
    result = await runner("python3", [
      "-c",
      "import importlib.metadata; print(importlib.metadata.version('semantic-terraform-agent'))",
    ], {
      timeoutMs: 10_000,
      env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, LANG: process.env.LANG ?? "C.UTF-8" },
    });
  } catch (error) {
    throw new AgentVersionError("agent_version_unavailable", { cause: error });
  }
  if (result.timedOut || result.exitCode !== 0) throw new AgentVersionError("agent_version_unavailable");
  const installedVersion = result.stdout.trim();
  if (installedVersion !== expectedVersion) throw new AgentVersionError("agent_version_mismatch");
  return installedVersion;
}
