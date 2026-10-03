import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, afterEach, beforeEach, describe, test } from "node:test";
import ts from "typescript";
import { readStoredAttachmentFile } from "../src/lib/attachment-storage.ts";
import { encryptAttachmentBuffer, attachmentEncryptionKeyEnvVar } from "../src/lib/attachment-encryption-core.ts";
import { canReadApprovalDocument, getReadableDocumentWhere } from "../src/lib/approval-permissions-core.ts";

// Exercise the actual handlers, session validation, storage decryption and invalidation
// helper. Only database calls and the already-tested PDF renderer are isolated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const token = "a".repeat(43);
const key = "__mobileAttachmentDownloadHarness";
const encryptionKey = randomBytes(32).toString("base64");
const previousEncryptionKey = process.env[attachmentEncryptionKeyEnvVar];
const testDirectory = `mobile-download-test-${randomUUID()}`;
const storageDirectory = path.join(process.cwd(), "uploads", "attachments", testDirectory);
const state: Row = { session: null, attachment: null, queries: [], storageReads: [], auditReads: [], markers: [] };
const prisma = {
  mobileSession: { async findUnique() { return state.session; } },
  attachment: {
    async findFirst(input: Row) {
      state.queries.push(input);
      assert.deepEqual(input.where.document, getReadableDocumentWhere("staff", "USER"));
      if (!state.attachment || input.where.id !== state.attachment.id) return null;
      return canReadApprovalDocument("staff", "USER", state.attachment.document) ? state.attachment : null;
    },
  },
  auditLog: {
    async findFirst(input: Row) {
      state.auditReads.push(input);
      return state.automaticPdfIds.includes(input.where.targetId) ? {id:"audit"} : null;
    },
  },
};
(globalThis as Row)[key] = { state, prisma, readStoredAttachmentFile };
const moduleUrl = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const effectsUrl = moduleUrl(`
  const harness = globalThis.${key};
  export const prisma = harness.prisma;
  export async function readStoredAttachmentFile(attachment) {
    harness.state.storageReads.push(attachment.storageKey);
    return harness.readStoredAttachmentFile(attachment);
  }
  export async function markInvalidApprovalPdf(source) {
    harness.state.markers.push(source);
    return Buffer.concat([Buffer.from("INVALID-PDF:"), source]);
  }
`);
function compile(file: string, replacements: Record<string, string>) {
  let source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`"${from}"`, JSON.stringify(to));
  return moduleUrl(ts.transpileModule(source, {
    compilerOptions: {module:ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2022},
  }).outputText);
}
const authUrl = compile("lib/mobile-auth.ts", {"@/lib/prisma":effectsUrl});
const invalidationUrl = compile("lib/approval-pdf-invalidation.ts", {});
const fileUrl = compile("lib/approval-attachment-file.ts", {
  "@/lib/attachment-storage":effectsUrl,
  "@/lib/approval-pdf-invalidation":invalidationUrl,
  "@/lib/generated-approval-pdf":effectsUrl,
  "@/lib/prisma":effectsUrl,
});
const replacements = {"@/lib/prisma":effectsUrl, "@/lib/mobile-auth":authUrl, "@/lib/approval-attachment-file":fileUrl};
const download = (await import(compile("app/api/mobile/attachments/[id]/download/route.ts", replacements))).GET;
const preview = (await import(compile("app/api/mobile/attachments/[id]/preview/route.ts", replacements))).GET;
const metadata = (await import(compile("app/api/mobile/attachments/[id]/route.ts", replacements))).GET;
function activeSession(role = "USER") {
  return {id:"session", userId:"staff", expiresAt:new Date(Date.now() + 60_000),
    user:{id:"staff", role, status:"ACTIVE", position:{name:"생활지도원"}}};
}
const request = (authorization: string | undefined = `Bearer ${token}`, query = "") => new Request(`https://example.test/api/mobile/attachments/file/download${query}`, {
  headers: authorization ? {Authorization:authorization} : {},
});
const call = (handler = download, authorization: string | undefined = `Bearer ${token}`, query = "", id = "file") =>
  handler(request(authorization, query), {params:Promise.resolve({id})});
async function storedAttachment(options: Row = {}, data = Buffer.from("한글 원문\0binary", "utf8"), encrypted = false) {
  const storageKey = `${testDirectory}/${randomUUID()}.bin`;
  await mkdir(storageDirectory, {recursive:true});
  await writeFile(path.join(process.cwd(), "uploads", "attachments", storageKey), encrypted
    ? encryptAttachmentBuffer(data, {[attachmentEncryptionKeyEnvVar]:encryptionKey}) : data);
  state.attachment = {
    id:"file", originalName:"기안서.hwp", storageProvider:"local", storageKey,
    mimeType:"application/x-hwp", size:data.length,
    document:{drafterId:"staff", status:"APPROVED", approvalSteps:[]}, ...options,
  };
  return data;
}
function assertPrivate(response: Response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("location"), null);
}
describe("mobile attachment downloads", () => {
  beforeEach(() => {
    Object.assign(state, {session:activeSession(), attachment:null, queries:[], storageReads:[], auditReads:[], markers:[], automaticPdfIds:[]});
    process.env[attachmentEncryptionKeyEnvVar] = encryptionKey;
  });
  afterEach(() => {
    if (previousEncryptionKey === undefined) delete process.env[attachmentEncryptionKeyEnvVar];
    else process.env[attachmentEncryptionKeyEnvVar] = previousEncryptionKey;
  });
  after(async () => {
    delete (globalThis as Row)[key];
    await rm(storageDirectory, {recursive:true, force:true});
  });
  

  test("all attachment endpoints reject missing, invalid, expired and inactive sessions before lookup", async () => {
    for (const kind of ["missing", "malformed", "unknown", "expired", "inactive"]) {
      state.session = ["unknown"].includes(kind) ? null : activeSession();
      if (kind === "expired") state.session.expiresAt = new Date(0);
      if (kind === "inactive") state.session.user.status = "RESIGNED";
      const authorization = kind === "missing" ? "" : kind === "malformed" ? "Bearer short" : `Bearer ${token}`;
      for (const handler of [download, preview, metadata]) {
        const response = await call(handler, authorization);
        assert.equal(response.status, 401, kind);
        assertPrivate(response);
        assert.deepEqual(await response.json(), {error:"로그인이 필요합니다."});
      }
    }
    assert.deepEqual(state.queries, []);
    assert.deepEqual(state.storageReads, []);
  });

  test("administrators keep the employee read boundary and cannot spoof another identity or storage path", async () => {
    state.session = activeSession("ADMIN");
    await storedAttachment({document:{drafterId:"other", status:"APPROVED", approvalSteps:[]}});
    for (const handler of [download, preview, metadata]) {
      const response = await call(handler, undefined, "?userId=other&role=ADMIN&storageKey=private-key");
      assert.equal(response.status, 404);
      assertPrivate(response);
      assert.deepEqual(await response.json(), {error:"파일을 찾을 수 없습니다."});
    }
    assert.deepEqual(state.storageReads, []);
    assert.ok(state.queries.every((row: Row) => JSON.stringify(row.where).includes("staff")));
  });

  test("authors and approvers read only the records allowed by the existing personal policy", async () => {
    const data = await storedAttachment();
    for (const role of ["USER", "ADMIN"]) {
      state.session = activeSession(role);
      for (const [drafterId, status, approverIds, allowed] of [
        ["staff", "DRAFT", [], true], ["staff", "RECALLED", [], true],
        ["other", "SUBMITTED", ["staff"], true], ["other", "APPROVED", ["staff"], true],
        ["other", "DRAFT", ["staff"], false], ["other", "RECALLED", ["staff"], false],
        ["other", "DISCARDED", ["staff"], false], ["other", "SUBMITTED", ["other"], false],
      ] as Array<[string, string, string[], boolean]>) {
        state.attachment.document = {drafterId, status, approvalSteps:approverIds.map(approverId => ({approverId}))};
        const response = await call();
        assert.equal(response.status, allowed ? 200 : 404, `${role}: ${drafterId} ${status}`);
        assertPrivate(response);
        if (allowed) assert.deepEqual(Buffer.from(await response.arrayBuffer()), data);
      }
    }
  });

  test("metadata exposes only the selected attachment's safe display fields and never reads storage", async () => {
    await storedAttachment({id:"signed-file", originalName:"결재본_서명본.pdf", mimeType:"application/pdf",
      signedSourceAttachmentId:"private-original-id", signedAt:new Date("2026-10-03T01:00:00.000Z"),
      signedById:"private-signer", signedBy:{signatureImageStorageKey:"private-signature"}});
    const response = await call(metadata, undefined, "", "signed-file");
    assert.equal(response.status, 200);
    assertPrivate(response);
    const body = await response.json();
    assert.deepEqual(body, {attachment:{id:"signed-file", name:"결재본_서명본.pdf", mimeType:"application/pdf",
      size:state.attachment.size, previewKind:"pdf", isSigned:true, signedAt:"2026-10-03T01:00:00.000Z"}});
    assert.equal(JSON.stringify(body).includes("private-"), false);
    assert.equal(JSON.stringify(body).includes(state.attachment.storageKey), false);
    assert.deepEqual(state.storageReads, []);
    assert.deepEqual(state.markers, []);
    assert.equal((await call(metadata, undefined, "", "missing-id")).status, 404);
    state.attachment.signedSourceAttachmentId = null;
    state.attachment.signedAt = null;
    state.attachment.originalName = "예산.xlsx";
    state.attachment.mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const original = await (await call(metadata, undefined, "", "signed-file")).json();
    assert.equal(original.attachment.previewKind, null);
    assert.equal(original.attachment.isSigned, false);
    assert.equal(original.attachment.signedAt, null);
    assert.deepEqual(state.storageReads, []);
  });

  test("HWP, Word and Excel originals download unchanged while unsupported previews still return 415", async () => {
    for (const [name, mimeType] of [
      ["기안서.hwp", "application/x-hwp"],
      ["회의록.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["예산.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ]) {
      const data = await storedAttachment({originalName:name, mimeType});
      const response = await call();
      assert.equal(response.status, 200);
      assertPrivate(response);
      assert.equal(response.headers.get("pragma"), "no-cache");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("access-control-expose-headers"), "Content-Disposition, Content-Length, Content-Type");
      assert.equal(response.headers.get("access-control-allow-origin"), null);
      assert.equal(response.headers.get("content-type"), mimeType);
      assert.equal(response.headers.get("content-length"), String(data.length));
      assert.ok(response.headers.get("content-disposition")?.startsWith("attachment;"));
      assert.ok(response.headers.get("content-disposition")?.includes(`filename*=UTF-8''${encodeURIComponent(name)}`));
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), data);
      assert.equal((await call(preview)).status, 415);
    }
  });

  test("encrypted storage is decrypted and Content-Length describes the returned bytes", async () => {
    const data = await storedAttachment({}, Buffer.from("암호화한 원본\0\xff", "utf8"), true);
    const response = await call();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-length"), String(data.length));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), data);
    assert.deepEqual(state.storageReads, [state.attachment.storageKey]);
  });

  test("signed and generated files download the selected attachment, never silently replace it", async () => {
    const data = await storedAttachment({id:"signed-file", originalName:"문서_서명본.pdf", mimeType:"application/pdf", signedSourceAttachmentId:"original-file"}, Buffer.from("signed-pdf"));
    assert.equal((await call(download, undefined, "", "original-file")).status, 404);
    assert.deepEqual(state.storageReads, []);
    const response = await call(download, undefined, "", "signed-file");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), data);
    assert.deepEqual(state.auditReads, []);
    assert.deepEqual(state.markers, []);
  });

  test("cancelled automatic approval PDFs keep the existing invalidation mark and its updated size", async () => {
    const data = await storedAttachment({originalName:"[효력 취소] 결재본.pdf", mimeType:"application/pdf", document:{drafterId:"staff", status:"RECALLED", approvalSteps:[]}}, Buffer.from("approval-pdf"), true);
    state.automaticPdfIds = ["file"];
    for (const handler of [download, preview]) {
      const response = await call(handler);
      const expected = Buffer.concat([Buffer.from("INVALID-PDF:"), data]);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "application/pdf");
      assert.equal(response.headers.get("content-length"), String(expected.length));
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
    }
    assert.equal(state.markers.length, 2);
    assert.ok(state.auditReads.every((row: Row) => row.where.targetId === "file"));
    state.automaticPdfIds = [];
    const manual = await call();
    assert.deepEqual(Buffer.from(await manual.arrayBuffer()), data);
    assert.equal(state.markers.length, 2);
  });

  test("missing attachments and unavailable or undecryptable bytes return private generic errors without storage details", async () => {
    const missing = await call();
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), {error:"파일을 찾을 수 없습니다."});
    await storedAttachment({}, Buffer.from("sensitive file"), true);
    process.env[attachmentEncryptionKeyEnvVar] = randomBytes(32).toString("base64");
    for (const kind of ["wrong-key", "missing-file"]) {
      if (kind === "missing-file") await rm(path.join(process.cwd(), "uploads", "attachments", state.attachment.storageKey));
      const response = await call();
      assert.equal(response.status, 404, kind);
      assertPrivate(response);
      assert.deepEqual(await response.json(), {error:"파일을 불러올 수 없습니다."});
      assert.equal(response.headers.get("content-disposition"), null);
    }
  });

  test("download filenames cannot inject headers, expose directories or break RFC5987 quoting", async () => {
    await storedAttachment({originalName:`../../private/보고서'(*)\r\nInjected: yes".hwp`});
    const response = await call();
    assert.equal(response.status, 200);
    const disposition = response.headers.get("content-disposition")!;
    assert.equal(response.headers.get("injected"), null);
    assert.equal(disposition.includes("private/"), false);
    assert.equal(disposition.includes("\r"), false);
    assert.equal(disposition.includes("\n"), false);
    assert.ok(disposition.includes("%27%28%2A%29"));
    assert.equal(disposition.split("filename*=UTF-8''").length, 2);
    const metadata = [...response.headers.values()].join(" ");
    assert.equal(metadata.includes(state.attachment.storageKey), false);
    assert.equal(metadata.includes("local"), false);
  });

  test("invalid MIME headers fall back to a safe binary type", async () => {
    await storedAttachment({mimeType:"application/pdf\r\nX-Injected: secret"});
    const response = await call();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/octet-stream");
    assert.equal(response.headers.get("x-injected"), null);
  });
});
