import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

// Execute the actual public action, storage helper, and pure dependencies. Only
// authentication, policy persistence, environment, and provider I/O are ports.
// The environment is lexical; no process credentials or ambient globals change.
const root = fileURLToPath(new URL("../", import.meta.url));
const nodeRequire = createRequire(import.meta.url);
type GrantResult = { ok: boolean; storageKey?: string; error?: string };
type Action = (
  name: string,
  mimeType: string,
  size: number,
  options?: { storageKeyPrefix?: string },
) => Promise<GrantResult>;
type TrustedGrant = (
  name: string,
  mimeType: string,
  options?: { storageKeyPrefix?: string },
) => Promise<{ storageKey: string } | null>;

function harness() {
  const state = { authenticated: true, authCalls: 0, policyCalls: 0, keys: [] as string[] };
  const actor = {
    id: "synthetic-ordinary-user",
    role: "USER",
    canViewYouthDetails: false,
    canViewYouthContacts: false,
    canDownloadYouthDocuments: false,
    canManageYouth: false,
  };
  const processPort = {
    cwd: () => root,
    env: {
      ATTACHMENT_STORAGE_DRIVER: "supabase-storage",
      SUPABASE_URL: "https://synthetic.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "SYNTHETIC_NOT_A_CREDENTIAL",
      SUPABASE_STORAGE_BUCKET: "synthetic-bucket",
    },
  };
  const fetchPort = async (input: string, init: RequestInit) => {
    const url = new URL(input);
    assert.equal(url.origin, "https://synthetic.invalid");
    assert.equal(init.method, "POST");
    const marker = "/object/upload/sign/synthetic-bucket/";
    assert.ok(url.pathname.includes(marker));
    state.keys.push(decodeURIComponent(url.pathname.split(marker)[1]));
    return {
      ok: true,
      status: 200,
      json: async () => ({ url: "/object/upload/sign/synthetic-bucket/fixture?token=SYNTHETIC" }),
      text: async () => "",
    };
  };
  const unexpectedProvider = () => { throw new Error("Unexpected provider port"); };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/auth": {
      requireUser: async () => { state.authCalls++; return state.authenticated ? actor : null; },
    },
    "@/lib/attachment-policy": {
      getAttachmentPolicy: async () => {
        state.policyCalls++;
        return { maxFileCount: 10, maxFileSizeMb: 30, allowedExtensions: [".pdf"] };
      },
    },
    "@vercel/blob": { get: unexpectedProvider, put: unexpectedProvider, del: unexpectedProvider },
  };
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  function load(relative: string): Record<string, unknown> {
    const absolute = path.join(root, relative);
    const existing = modules.get(absolute);
    if (existing) return existing.exports;
    const source = readFileSync(absolute, "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    const compiledModule = { exports: {} as Record<string, unknown> };
    modules.set(absolute, compiledModule);
    const requirePort = (specifier: string): unknown => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith("@/")) return load("src/" + specifier.slice(2) + ".ts");
      if (specifier.startsWith("node:")) return nodeRequire(specifier);
      throw new Error("Unexpected dependency " + specifier);
    };
    new Function("require", "module", "exports", "process", "fetch", compiled)(
      requirePort, compiledModule, compiledModule.exports, processPort, fetchPort,
    );
    return compiledModule.exports;
  }
  const action = load("src/app/attachments/actions.ts").createSignedUploadUrlAction as Action;
  const trustedGrant = load("src/lib/attachment-storage.ts").getSignedUploadUrlForAttachment as TrustedGrant;
  return { action, trustedGrant, state };
}

const invoke = (action: Action, prefix?: string) => action("fixture.pdf", "application/pdf", 3,
  prefix === undefined ? undefined : { storageKeyPrefix: prefix });

test("actual public grant vetoes normalized Youth roots and descendants before policy or provider access", async () => {
  const { action, state } = harness();
  const prefixes = [
    "youth-decision-documents", "youth-decision-documents/",
    "youth-decision-documents/staging/", "youth-decision-documents/final/",
    "/youth-decision-documents/final/", "\\youth-decision-documents\\staging\\",
    "///youth-decision-documents//final/", "youth-decision-documents/final/nested/",
  ];
  for (const prefix of prefixes) {
    const result = await invoke(action, prefix);
    assert.deepEqual(result, { ok: false, error: "이 파일 저장 경로는 사용할 수 없습니다." });
  }
  assert.equal(state.authCalls, prefixes.length);
  assert.equal(state.policyCalls, 0);
  assert.equal(state.keys.length, 0);
});

test("actual action authenticates before reserved-path rejection", async () => {
  const { action, state } = harness();
  state.authenticated = false;
  await assert.rejects(invoke(action, "youth-decision-documents/final/"), /Unauthorized/);
  assert.equal(state.authCalls, 1);
  assert.equal(state.policyCalls, 0);
  assert.equal(state.keys.length, 0);
});

test("ordinary approval grants retain the default and nonreserved prefix behavior with fresh keys", async () => {
  const { action, state } = harness();
  for (const [prefix, expected] of [
    [undefined, "attachments/"],
    ["/attachments/approvals/", "attachments/approvals/"],
    ["youth-decision-documents-copy/", "youth-decision-documents-copy/"],
  ] as const) {
    const result = await invoke(action, prefix);
    assert.equal(result.ok, true);
    assert.ok(result.storageKey?.startsWith(expected));
    assert.match(result.storageKey!.slice(expected.length), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i);
  }
  assert.equal(new Set(state.keys).size, 3);
  assert.equal(state.policyCalls, 3);
});

test("percent-encoded and traversal prefixes remain invalid under the actual storage syntax without signing", async () => {
  const { action, state } = harness();
  for (const prefix of [
    "%79outh-decision-documents/final/", "youth-decision-documents%2Ffinal/",
    "%2Fyouth-decision-documents/final/", "../youth-decision-documents/final/",
  ]) {
    await assert.rejects(invoke(action, prefix), /Invalid attachment storage key prefix/);
  }
  assert.equal(state.keys.length, 0);
});

test("existing extension and size policies still reject before provider access", async () => {
  const { action, state } = harness();
  assert.equal((await action("fixture.exe", "application/octet-stream", 3)).ok, false);
  assert.equal((await action("fixture.pdf", "application/pdf", 30 * 1024 * 1024 + 1)).ok, false);
  assert.equal(state.policyCalls, 2);
  assert.equal(state.keys.length, 0);
});

test("trusted storage primitive remains unchanged for purpose-owned callers", async () => {
  const { trustedGrant, state } = harness();
  const result = await trustedGrant("fixture.pdf", "application/pdf", { storageKeyPrefix: "youth-decision-documents/final/" });
  assert.ok(result?.storageKey.startsWith("youth-decision-documents/final/"));
  assert.equal(state.keys.length, 1);
  assert.equal(state.authCalls, 0);
  assert.equal(state.policyCalls, 0);
});
