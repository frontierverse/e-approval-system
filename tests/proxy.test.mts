import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy.ts";
import { sessionCookieName } from "../src/lib/session-constants.ts";

describe("authentication proxy", () => {
  test("opens the static app support page without an employee session", () => {
    const response = proxy(new NextRequest("http://localhost/mobile-app/support?from=app-store"));
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("x-middleware-next"), "1");
  });

  test("keeps routes neighboring app support and private documents protected", () => {
    for (const pathname of [
      "/mobile-app",
      "/mobile-app/supporting",
      "/mobile-app/support/private",
      "/mobile-app/privacy",
      "/documents/synthetic-document-id",
    ]) {
      const response = proxy(new NextRequest(`http://localhost${pathname}`));
      assert.equal(response.status, 307);
      assert.equal(new URL(response.headers.get("location")!).pathname, "/login");
    }
  });

  test("returns 401 JSON for background chat requests after the cookie expires", async () => {
    for (const pathname of ["/api/chat", "/api/chat/messages", "/api/chat/read", "/api/chat/stream"]) {
      const response = proxy(new NextRequest(`http://localhost${pathname}`));
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(await response.json(), { error: "인증이 필요합니다." });
    }
  });

  test("lets deployment probes reach both health endpoints without a session", () => {
    for (const pathname of ["/api/health/live", "/api/health/ready"]) {
      const response = proxy(new NextRequest(`http://localhost${pathname}`));

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("x-middleware-next"), "1");
    }
  });

  test("lets mobile requests reach their bearer or secret authentication without a web cookie", () => {
    for (const pathname of ["/api/mobile/auth/login", "/api/mobile/auth/me", "/api/mobile/inbox", "/api/mobile/push-subscription", "/api/mobile/push-dispatch"]) {
      const response = proxy(new NextRequest(`http://localhost${pathname}`));
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("x-middleware-next"), "1");
    }
  });

  test("lets only the exact maintenance endpoint reach its own secret authentication", () => {
    for (const authorization of [undefined, "Bearer invalid", "Bearer synthetic-cron-secret-only"]) {
      const response = proxy(new NextRequest("http://localhost/api/internal/resource-maintenance?invalid=%xx", {
        headers: authorization ? { authorization } : {},
      }));
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("x-middleware-next"), "1");
    }
  });

  test("keeps neighboring internal routes protected even with a bearer header", () => {
    for (const pathname of [
      "/api/internal",
      "/api/internal/other-maintenance",
      "/api/internal/resource-maintenance-extra",
      "/api/internal/resource-maintenance/status",
    ]) {
      const response = proxy(new NextRequest(`http://localhost${pathname}`, {
        headers: { authorization: "Bearer synthetic-cron-secret-only" },
      }));
      assert.equal(response.status, 307);
      const location = new URL(response.headers.get("location")!);
      assert.equal(location.pathname, "/login");
      assert.equal(location.searchParams.get("next"), pathname);
    }
  });

  test("does not bypass web authentication for neighboring mobile-like paths", () => {
    const response = proxy(new NextRequest("http://localhost/api/mobile-private"));
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location")!).pathname, "/login");
  });

  test("does not redirect an authenticated health probe to the home page", () => {
    const response = proxy(
      new NextRequest("http://localhost/api/health/live", {
        headers: {
          cookie: `${sessionCookieName}=test-session`,
        },
      }),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
  });

  test("still redirects unauthenticated protected pages to login", () => {
    const response = proxy(new NextRequest("http://localhost/youth/roster"));
    const location = response.headers.get("location");

    assert.equal(response.status, 307);
    assert.ok(location);
    assert.equal(new URL(location).pathname, "/login");
    assert.equal(new URL(location).searchParams.get("next"), "/youth/roster");
  });
});
