const PROTECTED_PREFIXES = ["/dashboard", "/repositories", "/runs", "/settings", "/github"];

export function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function shouldRedirectUnauthenticated(pathname: string, authenticated: boolean) {
  return isProtectedPath(pathname) && !authenticated;
}
