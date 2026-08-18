import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      githubUserId: string | null;
      githubLogin: string | null;
      avatarUrl: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    githubUserId?: string | null;
    githubLogin?: string | null;
    avatarUrl?: string | null;
  }
}
