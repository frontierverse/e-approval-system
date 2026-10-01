import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";

const previousFetch = globalThis.fetch;
const previousDev = globalThis.__DEV__;
const previousUrl = process.env.EXPO_PUBLIC_API_URL;
const source = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { apiRequest, ApiError } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
beforeEach(() => { globalThis.__DEV__ = false; process.env.EXPO_PUBLIC_API_URL = "https://example.test"; });
after(() => {
  globalThis.fetch = previousFetch;
  if (previousDev === undefined) delete globalThis.__DEV__; else globalThis.__DEV__ = previousDev;
  if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL; else process.env.EXPO_PUBLIC_API_URL = previousUrl;
});
test("web-login HTML cannot be mistaken for a successful mobile API response", async () => {
  globalThis.fetch = async () => new Response("<html>Login</html>", {status:200, headers:{"Content-Type":"text/html"}});
  await assert.rejects(apiRequest("/auth/me"), error => error instanceof ApiError && error.message.includes("관리자"));
});
test("authenticated requests send their bearer token to the configured mobile origin", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://example.test/api/mobile/auth/me");
    assert.equal(options.headers.Authorization, "Bearer test-session");
    assert.equal(options.cache, "no-store");
    return Response.json({user:{id:"staff"}});
  };
  assert.deepEqual(await apiRequest("/auth/me", {token:"test-session"}), {user:{id:"staff"}});
});
test("expired or inactive server sessions preserve the unauthorized status", async () => {
  globalThis.fetch = async () => Response.json({error:"로그인이 필요합니다."}, {status:401});
  await assert.rejects(apiRequest("/auth/me"), error=>error instanceof ApiError && error.status === 401);
});
