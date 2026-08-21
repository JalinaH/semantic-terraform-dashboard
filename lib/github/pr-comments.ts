import "server-only";

import { Octokit } from "@octokit/rest";
import { getGitHubAppBotLogin } from "@/lib/config";
import { createInstallationAccess } from "@/lib/github/app";
import { AGENT_COMMENT_MARKER } from "@/lib/publication/render-agent-comment";
import { classifyGitHubPublicationError, PublicationError } from "@/lib/publication/errors";

const API_VERSION = "2022-11-28";
const USER_AGENT = "semantic-terraform-dashboard/0.6";

export interface PublishedGitHubComment {
  id: string;
  nodeId: string | null;
  url: string;
}

interface GitHubCommentRecord extends PublishedGitHubComment {
  numericId: number;
  body: string | null;
  authorLogin: string | null;
  authorType: string | null;
}

interface GitHubCommentApi {
  list(page: number): Promise<GitHubCommentRecord[]>;
  update(commentId: number, body: string): Promise<PublishedGitHubComment>;
  create(body: string): Promise<PublishedGitHubComment>;
}

export interface GitHubPrCommentPublisher {
  publish(input: {
    installationId: string;
    owner: string;
    repository: string;
    pullRequestNumber: number;
    body: string;
  }): Promise<PublishedGitHubComment>;
}

export function createGitHubPrCommentPublisher(dependencies: {
  getAccess: typeof createInstallationAccess;
  getBotLogin: () => string;
  createApi: (token: string, input: { owner: string; repository: string; pullRequestNumber: number }) => GitHubCommentApi;
}): GitHubPrCommentPublisher {
  return {
    async publish(input) {
      try {
        const access = await dependencies.getAccess(input.installationId);
        if (access.pullRequestsPermission !== "write") throw new PublicationError("github_permission_missing");
        const api = dependencies.createApi(access.token, input);
        const botLogin = dependencies.getBotLogin().toLowerCase();
        let page = 1;
        let existing: GitHubCommentRecord | null = null;
        while (page <= 10 && !existing) {
          const comments = await api.list(page);
          existing = comments.find((comment) =>
            comment.body?.includes(AGENT_COMMENT_MARKER)
            && comment.authorType === "Bot"
            && comment.authorLogin?.toLowerCase() === botLogin,
          ) ?? null;
          if (comments.length < 100) break;
          page += 1;
        }
        return existing ? api.update(existing.numericId, input.body) : api.create(input.body);
      } catch (error) {
        throw classifyGitHubPublicationError(error);
      }
    },
  };
}

export const githubPrCommentPublisher = createGitHubPrCommentPublisher({
  getAccess: createInstallationAccess,
  getBotLogin: getGitHubAppBotLogin,
  createApi(token, input) {
    const octokit = new Octokit({ auth: token, userAgent: USER_AGENT });
    return {
      async list(page) {
        const response = await octokit.rest.issues.listComments({
          owner: input.owner,
          repo: input.repository,
          issue_number: input.pullRequestNumber,
          per_page: 100,
          page,
          headers: { "X-GitHub-Api-Version": API_VERSION },
        });
        return response.data.map((comment) => ({
          id: String(comment.id),
          numericId: comment.id,
          nodeId: comment.node_id ?? null,
          url: comment.html_url,
          body: comment.body ?? null,
          authorLogin: comment.user?.login ?? null,
          authorType: comment.user?.type ?? null,
        }));
      },
      async update(commentId, body) {
        const response = await octokit.rest.issues.updateComment({
          owner: input.owner,
          repo: input.repository,
          comment_id: commentId,
          body,
          headers: { "X-GitHub-Api-Version": API_VERSION },
        });
        return { id: String(response.data.id), nodeId: response.data.node_id ?? null, url: response.data.html_url };
      },
      async create(body) {
        const response = await octokit.rest.issues.createComment({
          owner: input.owner,
          repo: input.repository,
          issue_number: input.pullRequestNumber,
          body,
          headers: { "X-GitHub-Api-Version": API_VERSION },
        });
        return { id: String(response.data.id), nodeId: response.data.node_id ?? null, url: response.data.html_url };
      },
    };
  },
});
