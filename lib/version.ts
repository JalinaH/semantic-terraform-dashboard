import { PINNED_AGENT_VERSION } from "@/lib/config";

export const TERRAFIX_VERSION = "0.6.0";
export const AGENT_VERSION = PINNED_AGENT_VERSION;

export function getSafeBuildVersion() {
  const value = process.env.TERRAFIX_BUILD_SHA?.trim() || process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  return value && /^[a-f0-9]{7,64}$/i.test(value) ? value.slice(0, 12) : null;
}
