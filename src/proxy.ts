import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName } from "@/lib/session-constants";

const loginPath = "/login";
const publicApiPrefixes = ["/api/health/"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(sessionCookieName)?.value);
  const isLoginPath = pathname === loginPath;
  const isPublicPath =
    isLoginPath ||
    publicApiPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (!hasSession && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = loginPath;
    url.searchParams.set("next", pathname);

    return NextResponse.redirect(url);
  }

  if (hasSession && isLoginPath) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
