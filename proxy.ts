import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { shouldRedirectUnauthenticated } from "@/lib/auth/protection";

export const proxy = auth((request) => {
  if (shouldRedirectUnauthenticated(request.nextUrl.pathname, Boolean(request.auth?.user))) {
    const destination = new URL("/", request.nextUrl.origin);
    destination.searchParams.set("auth", "required");
    return NextResponse.redirect(destination);
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/repositories/:path*",
    "/runs/:path*",
    "/settings/:path*",
    "/github/:path*",
  ],
};
