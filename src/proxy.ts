import { NextResponse, type NextRequest } from "next/server";
import {
  sessionCookieName,
  youthManagementAccessCookieName,
} from "@/lib/session-constants";
import { shouldClearYouthManagementAccess } from "@/lib/youth-management-access-policy";

const publicPaths = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(sessionCookieName)?.value);
  const isPublicPath = publicPaths.includes(pathname);

  if (!hasSession && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);

    return withYouthManagementAccessPolicy(request, NextResponse.redirect(url));
  }

  if (hasSession && isPublicPath) {
    return withYouthManagementAccessPolicy(
      request,
      NextResponse.redirect(new URL("/", request.url)),
    );
  }

  return withYouthManagementAccessPolicy(request, NextResponse.next());
}

function withYouthManagementAccessPolicy(
  request: NextRequest,
  response: NextResponse,
) {
  if (
    request.cookies.get(youthManagementAccessCookieName)?.value &&
    shouldClearYouthManagementAccess(
      request.nextUrl.pathname,
      request.method,
    )
  ) {
    response.cookies.delete(youthManagementAccessCookieName);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
