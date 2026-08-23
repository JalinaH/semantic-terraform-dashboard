import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { MissingIntegrationConfigurationError } from "@/lib/config";
import { fetchInstallationMetadata } from "@/lib/github/app";
import { parseInstallationCallbackParameters } from "@/lib/github/callback";
import { GitHubIntegrationError, type GitHubIntegrationErrorCode } from "@/lib/github/errors";
import { connectInstallationToUser } from "@/lib/github/installations";
import {
  INSTALLATION_STATE_COOKIE,
  stateMatchesCookie,
  verifyInstallationState,
} from "@/lib/github/state";
import { syncPersistedInstallation } from "@/lib/github/sync";
import { assertInstallationIdentity, verifyUserInstallationAccess } from "@/lib/github/user-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return redirectWithError(request, "authentication_required", "/");

  const state = request.nextUrl.searchParams.get("state");
  const stateCookie = request.cookies.get(INSTALLATION_STATE_COOKIE)?.value;
  if (!state || !stateMatchesCookie(state, stateCookie)) {
    return redirectWithError(request, "invalid_callback");
  }

  try {
    const verifiedState = await verifyInstallationState(state, session.user.id);
    const { installationId } = parseInstallationCallbackParameters(request.nextUrl.searchParams);

    const userInstallation = await verifyUserInstallationAccess(session.user.id, installationId);
    const metadata = await fetchInstallationMetadata(installationId);
    assertInstallationIdentity(userInstallation, metadata);
    const installation = await connectInstallationToUser(session.user.id, metadata);
    await syncPersistedInstallation(installation);

    const destination = new URL(verifiedState.returnTo, request.nextUrl.origin);
    destination.searchParams.set("github", "connected");
    const response = NextResponse.redirect(destination);
    response.cookies.delete(INSTALLATION_STATE_COOKIE);
    return response;
  } catch (error) {
    const code = installationErrorCode(error);
    console.error("GitHub installation callback failed", {
      code,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return redirectWithError(request, code);
  }
}

function installationErrorCode(error: unknown): GitHubIntegrationErrorCode {
  if (error instanceof GitHubIntegrationError) return error.code;
  if (error instanceof MissingIntegrationConfigurationError) return "configuration_missing";
  return "sync_failed";
}

function redirectWithError(
  request: NextRequest,
  code: GitHubIntegrationErrorCode,
  pathname = "/github/error",
) {
  const destination = new URL(pathname, request.nextUrl.origin);
  destination.searchParams.set(pathname === "/" ? "auth" : "code", code);
  const response = NextResponse.redirect(destination);
  response.cookies.delete(INSTALLATION_STATE_COOKIE);
  return response;
}
