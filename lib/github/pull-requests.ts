import "server-only";

import { Octokit } from "@octokit/rest";
import { createInstallationAccess } from "@/lib/github/app";
import type { PullRequestHeadSnapshot } from "@/lib/patch-application/types";

const API_VERSION = "2022-11-28";
const USER_AGENT = "terrafix-dashboard/0.11";

export async function fetchPullRequestHead(input: {
  installationId: string;
  owner: string;
  repository: string;
  pullRequestNumber: number;
}): Promise<{ snapshot: PullRequestHeadSnapshot; contentsPermission: string | null; token: string }> {
  const access = await createInstallationAccess(input.installationId);
  const octokit = new Octokit({ auth: access.token, userAgent: USER_AGENT, request: { timeout: 15_000 } });
  const response = await octokit.rest.pulls.get({
    owner: input.owner,
    repo: input.repository,
    pull_number: input.pullRequestNumber,
    headers: { "X-GitHub-Api-Version": API_VERSION },
  });
  return {
    contentsPermission: access.contentsPermission,
    token: access.token,
    snapshot: {
      state: response.data.state === "open" ? "open" : "closed",
      merged: response.data.merged,
      draft: response.data.draft ?? false,
      headSha: response.data.head.sha.toLowerCase(),
      headBranch: response.data.head.ref,
      headRepositoryFullName: response.data.head.repo?.full_name ?? null,
      baseRepositoryFullName: response.data.base.repo.full_name,
      htmlUrl: response.data.html_url,
    },
  };
}
