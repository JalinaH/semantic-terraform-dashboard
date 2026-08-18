export interface SessionIdentitySource {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  githubUserId?: string | null;
  githubLogin?: string | null;
  avatarUrl?: string | null;
}

export function toSafeSessionUser(user: SessionIdentitySource) {
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    image: user.image ?? null,
    githubUserId: user.githubUserId ?? null,
    githubLogin: user.githubLogin ?? null,
    avatarUrl: user.avatarUrl ?? user.image ?? null,
  };
}
