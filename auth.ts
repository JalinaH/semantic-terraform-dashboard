import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { mapGitHubProfile, type GitHubIdentityProfile } from "@/lib/auth/github-profile";
import { toSafeSessionUser } from "@/lib/auth/session-mapping";
import { getAuthSecret, getIntegrationConfigurationStatus } from "@/lib/config";

const integration = getIntegrationConfigurationStatus();

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  secret: getAuthSecret(),
  // Missing-configuration preview mode has no provider or credential flow.
  // Configured authentication still requires an explicitly trusted host.
  trustHost: process.env.AUTH_TRUST_HOST === "true" || !integration.authentication,
  session: { strategy: "database" },
  providers: integration.authentication
    ? [
        GitHub({
          clientId: process.env.GITHUB_APP_CLIENT_ID!,
          clientSecret: process.env.GITHUB_APP_CLIENT_SECRET!,
          authorization: { params: { scope: "" } },
          profile(profile) {
            return mapGitHubProfile(profile as unknown as GitHubIdentityProfile);
          },
        }),
      ]
    : [],
  pages: {
    signIn: "/",
    error: "/auth/error",
  },
  callbacks: {
    session({ session, user }) {
      Object.assign(session.user, toSafeSessionUser(user));
      return session;
    },
  },
  events: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "github" || !profile) return;
      const mapped = mapGitHubProfile(profile as unknown as GitHubIdentityProfile);
      await db.user.update({
        where: { id: user.id },
        data: {
          githubUserId: mapped.githubUserId,
          githubLogin: mapped.githubLogin,
          avatarUrl: mapped.avatarUrl,
          name: mapped.name,
          image: mapped.image,
          email: mapped.email,
        },
      });
    },
  },
});
