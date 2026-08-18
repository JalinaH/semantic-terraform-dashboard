import { randomUUID, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { getAuthSecret } from "@/lib/config";
import { GitHubIntegrationError } from "@/lib/github/errors";
import { validateInternalRedirect } from "@/lib/security/redirect";

const STATE_ISSUER = "semantic-terraform-dashboard";
const STATE_AUDIENCE = "github-app-installation";
export const INSTALLATION_STATE_COOKIE = "stfa_github_install_state";

interface InstallationStateOptions {
  userId: string;
  returnTo?: string;
  secret?: string;
  now?: Date;
  nonce?: string;
}

export async function createInstallationState({
  userId,
  returnTo = "/repositories",
  secret = getAuthSecret(),
  now = new Date(),
  nonce = randomUUID(),
}: InstallationStateOptions) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ returnTo: validateInternalRedirect(returnTo, "/repositories") })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(STATE_ISSUER)
    .setAudience(STATE_AUDIENCE)
    .setSubject(userId)
    .setJti(nonce)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 10 * 60)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyInstallationState(
  state: string,
  expectedUserId: string,
  secret = getAuthSecret(),
) {
  try {
    const { payload } = await jwtVerify(state, new TextEncoder().encode(secret), {
      issuer: STATE_ISSUER,
      audience: STATE_AUDIENCE,
      subject: expectedUserId,
      algorithms: ["HS256"],
    });
    if (!payload.jti || typeof payload.returnTo !== "string") {
      throw new GitHubIntegrationError("invalid_callback");
    }
    return {
      nonce: payload.jti,
      returnTo: validateInternalRedirect(payload.returnTo, "/repositories"),
    };
  } catch (error) {
    if (error instanceof GitHubIntegrationError) throw error;
    throw new GitHubIntegrationError("invalid_callback", { cause: error });
  }
}

export function stateMatchesCookie(state: string, cookieState: string | undefined) {
  if (!cookieState) return false;
  const stateBytes = Buffer.from(state);
  const cookieBytes = Buffer.from(cookieState);
  return stateBytes.length === cookieBytes.length && timingSafeEqual(stateBytes, cookieBytes);
}
