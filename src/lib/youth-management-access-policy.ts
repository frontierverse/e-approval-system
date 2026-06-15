export function shouldClearYouthManagementAccess(
  pathname: string,
  method = "GET",
) {
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }

  if (pathname === "/youth" || pathname.startsWith("/youth/")) {
    return false;
  }

  if (pathname.startsWith("/api/")) {
    return false;
  }

  return true;
}
