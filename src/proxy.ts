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
    // A background chat request must receive 401 so it clears private state;
    // redirecting to an HTML login page would look like a successful fetch.
    if (pathname === "/api/chat" || pathname.startsWith("/api/chat/")) {
      return NextResponse.json({ error: "인증이 필요합니다." }, {
        status: 401,
        headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
      });
    }
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
