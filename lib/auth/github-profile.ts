export interface GitHubIdentityProfile {
  id: number | string;
  login: string;
  name?: string | null;
  email?: string | null;
  avatar_url: string;
}

export function mapGitHubProfile(profile: GitHubIdentityProfile) {
  return {
    id: String(profile.id),
    name: profile.name || profile.login,
    email: profile.email ?? null,
    image: profile.avatar_url,
    githubUserId: String(profile.id),
    githubLogin: profile.login,
    avatarUrl: profile.avatar_url,
  };
}
