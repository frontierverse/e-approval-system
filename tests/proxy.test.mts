import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy.ts";
import { sessionCookieName } from "../src/lib/session-constants.ts";

describe("authentication proxy", () => {
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
