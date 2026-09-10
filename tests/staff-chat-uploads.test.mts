import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";
import { Prisma } from "../src/generated/prisma/client.ts";
import { isStaffChatEmployeeActive } from "../src/lib/staff-chat-core.ts";
import { staffChatChunkSize, staffChatFileMaxBytes, staffChatZipMaxBytes } from "../src/lib/staff-chat-file-limits.ts";
import { getStaffChatPartSize, parseStaffChatUpload, readStaffChatChunk } from "../src/lib/staff-chat-upload-core.ts";

// Real service, request handlers, public serialization and validation. The DB
// serializes transactions with rollback; storage retains only sizes and hashes.
// This exercises 100 MiB transfers with a reused 4 MiB buffer, without real I/O.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const harness = {
  currentUser: null as Row | null, users: [] as Row[], uploads: [] as Row[], messages: [] as Row[], attachments: [] as Row[],
  writes: [] as Row[], manifests: [] as Row[], deletes: [] as string[], changes: [] as string[][],
  objects: new Map<string, Row>(), activeLocked: false, uploadLocked: null as string | null,
  failWrite: false, failManifest: false, failInsert: false, failDelete: false,
  afterCandidateRead: null as (() => void) | null,
};
const part = Buffer.alloc(staffChatChunkSize, 0x5a);
const tail = Buffer.from("final ZIP bytes");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const partDigest = hash(part);

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((condition: Row) => matches(row, condition));
    if (value === null || typeof value !== "object" || value instanceof Date) return row[key] === value;
    if ("not" in value && row[key] === value.not) return false;
    if ("gt" in value && !(row[key] !== null && row[key] > value.gt)) return false;
    if ("lte" in value && !(row[key] !== null && row[key] <= value.lte)) return false;
    return true;
  });
}
function selected(row: Row | undefined, select?: Row): Row | null {
  if (!row) return null;
  if (!select) return structuredClone(row);
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([name, value]) => {
    if (name === "attachment") return [name, selected(harness.attachments.find((entry) => entry.messageId === row.id), value.select)];
    return [name, row[name]];
  }));
}
let transactionTail: Promise<unknown> = Promise.resolve();
const prisma = {
  staffChatUpload: {
    async findUnique({ where }: Row) { return selected(harness.uploads.find((row) => matches(row, where.senderId_requestId ?? where))); },
    async findMany({ where, take }: Row) {
      const rows = harness.uploads.filter((row) => matches(row, where)).slice(0, take).map((row) => structuredClone(row));
      harness.afterCandidateRead?.();
      return rows;
    },
    async create({ data }: Row) {
      assert.equal(harness.activeLocked, true);
      const row = { messageId: null, deletionRequestedAt: null, createdAt: new Date(), ...structuredClone(data) };
      harness.uploads.push(row);
      return structuredClone(row);
    },
    async update({ where, data }: Row) {
      assert.equal(harness.uploadLocked, where.id, "upload mutations must hold the owner row lock");
      const row = harness.uploads.find((entry) => matches(entry, where));
      assert.ok(row); Object.assign(row, structuredClone(data));
      return structuredClone(row);
    },
    async deleteMany({ where }: Row) {
      const previous = harness.uploads.length;
      harness.uploads = harness.uploads.filter((row) => !matches(row, where));
      return { count: previous - harness.uploads.length };
    },
  },
  staffChatMessage: {
    async findUnique({ where, select }: Row) { return selected(harness.messages.find((row) => matches(row, where.senderId_requestId ?? where)), select); },
    async create({ data, select }: Row) {
      assert.equal(harness.activeLocked, true, "employee eligibility must remain locked through publication");
      assert.ok(harness.uploadLocked, "publication must hold its upload row lock");
      if (harness.failInsert) throw new Error("database insert unavailable");
      if (harness.messages.some((row) => row.senderId === data.senderId && row.requestId === data.requestId)) {
        throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "7.10.0" });
      }
      const { attachment, ...fields } = data;
      const row = { id: `message-${harness.messages.length + 1}`, sequence: BigInt(harness.messages.length + 1), createdAt: new Date(), readAt: null, ...fields };
      harness.messages.push(row);
      harness.attachments.push({ id: `attachment-${row.id}`, messageId: row.id, downloadExpiresAt: null,
        deletionRequestedAt: null, deletedAt: null, ...attachment.create });
      return selected(row, select);
    },
  },
  $transaction(operation: (tx: Row) => Promise<unknown>) {
    const task = transactionTail.then(async () => {
      const snapshot = structuredClone({ uploads: harness.uploads, messages: harness.messages, attachments: harness.attachments });
      try { return await operation(prisma); }
      catch (error) { Object.assign(harness, snapshot); throw error; }
      finally { harness.activeLocked = false; harness.uploadLocked = null; }
    });
    transactionTail = task.catch(() => undefined);
    return task;
  },
  async $queryRaw(query: Row) {
    if (query.sql.includes("pg_advisory_xact_lock")) return [];
    if (query.sql.includes('FROM "User"')) {
      assert.match(query.sql, /FOR SHARE/); harness.activeLocked = true;
      const today = query.values.find((value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
      return harness.users.filter((row) => query.values.includes(row.id) && isStaffChatEmployeeActive(row, today));
    }
    if (query.sql.includes('FROM "StaffChatUpload"')) {
      assert.match(query.sql, /"senderId" = \? FOR UPDATE/);
      const [id, senderId] = query.values;
      const rows = harness.uploads.filter((row) => row.id === id && row.senderId === senderId);
      if (rows.length) harness.uploadLocked = id;
      return rows.map((row) => ({ id: row.id }));
    }
    throw new Error(`Unexpected query: ${query.sql}`);
  },
};
const harnessKey = "__staffChatUploadRegressionHarness";
(globalThis as Row)[harnessKey] = { harness, prisma };
const moduleUrl = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const mocks = moduleUrl(`
  const { harness: state, prisma: db } = globalThis.${harnessKey};
  export const prisma = db;
  export async function getCurrentUser() { return state.currentUser; }
  export async function publishStaffChatChange(ids) { state.changes.push(ids); }
  export function getStaffChatChunkRef(id, index, provider) {
    return { storageKey: "staff-chat-chunks/" + id + "/" + index, storageProvider: provider };
  }
  export async function writeStaffChatChunk(id, index, provider, bytes, digest) {
    const row = { ...getStaffChatChunkRef(id, index, provider), id, index, size: bytes.byteLength, digest };
    state.writes.push(row);
    state.objects.set(row.storageKey, row);
    if (state.failWrite) throw new Error("ambiguous storage write failure");
    return row;
  }
  export async function writeStaffChatManifest(id, provider, parts, size) {
    const row = { storageKey: "staff-chat-manifests/" + id, storageProvider: provider, parts, size };
    state.manifests.push(row);
    state.objects.set(row.storageKey, row);
    if (state.failManifest) throw new Error("manifest write unavailable");
    return row;
  }
  export async function removeStaffChatChunkUpload(id) {
    state.deletes.push(id);
    if (state.failDelete) throw new Error("storage delete unavailable");
    for (const key of state.objects.keys()) if (key.includes(id)) state.objects.delete(key);
  }
`);
function compileModule(path: string, aliases: Record<string, string>) {
  let source = readFileSync(new URL(path, import.meta.url), "utf8");
  for (const [specifier, replacement] of Object.entries(aliases)) source = source.replaceAll(`"${specifier}"`, JSON.stringify(replacement));
  return moduleUrl(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}
const baseModule = compileModule("../src/lib/staff-chat.ts", {
  "@/lib/prisma": mocks, "@/lib/auth": mocks, "@/lib/staff-chat-events": mocks,
});
// Compile just the real participant lock to avoid loading storage providers or
// introducing a second copy of the chat service through circular imports.
const filesSource = readFileSync(new URL("../src/lib/staff-chat-files.ts", import.meta.url), "utf8");
const lockSource = filesSource.slice(filesSource.indexOf("export async function lockActiveParticipants("), filesSource.indexOf("async function lockParticipantAttachment("));
const lockModule = moduleUrl(ts.transpileModule(`
  import { Prisma } from "@/generated/prisma/client";
  import { StaffChatError, getStaffChatToday } from "@/lib/staff-chat-core";
  ${lockSource}
`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
const uploadModule = compileModule("../src/lib/staff-chat-uploads.ts", {
  "@/lib/prisma": mocks, "@/lib/staff-chat-chunk-storage": mocks,
  "@/lib/staff-chat-files": lockModule, "@/lib/staff-chat": baseModule, "@/lib/staff-chat-events": mocks,
});
const service = await import(uploadModule);
const aliases = { "@/lib/staff-chat": baseModule, "@/lib/staff-chat-uploads": uploadModule };
const startRoute = await import(compileModule("../src/app/api/chat/uploads/route.ts", aliases));
const partRoute = await import(compileModule("../src/app/api/chat/uploads/[id]/parts/[index]/route.ts", aliases));
const completeRoute = await import(compileModule("../src/app/api/chat/uploads/[id]/complete/route.ts", aliases));

function user(id: string, overrides: Row = {}): Row { return { id, status: "ACTIVE", resignationDate: null, ...overrides }; }
function input(overrides: Row = {}): Row {
  return { peerId: "peer", requestId: "request-zip-upload", body: " 확인해 주세요. ", originalName: "업무 자료.ZIP",
    mimeType: "application/zip", size: part.length + tail.length, chunkDigests: [partDigest, hash(tail)], ...overrides };
}
function jsonRequest(path: string, value: unknown, origin = "https://work.example") {
  return new Request(`https://work.example/api/chat/uploads${path}`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(value),
  });
}
function chunkRequest(bytes: Uint8Array = part, origin = "https://work.example") {
  return new Request("https://work.example/api/chat/uploads/id/parts/0", {
    method: "PUT", headers: { Origin: origin, "Content-Type": "application/octet-stream" }, body: new Uint8Array(bytes),
  });
}
const context = (id: string, index = "0") => ({ params: Promise.resolve({ id, index }) });
function noPrivateMetadata(value: unknown) { assert.doesNotMatch(JSON.stringify(value), /storageKey|storageProvider|fileDigest|chunkDigests|senderId_requestId/); }
async function uploadAll(value = input()) {
  const started = await service.startStaffChatUpload("actor", value);
  for (let index = 0; index < value.chunkDigests.length; index++) {
    await service.putStaffChatUploadPart("actor", started.uploadId, index, index === value.chunkDigests.length - 1 && value.size % part.length ? tail : part);
  }
  return started.uploadId as string;
}
const originalDriver = process.env.ATTACHMENT_STORAGE_DRIVER;
const originalVercel = process.env.VERCEL;
beforeEach(() => {
  process.env.ATTACHMENT_STORAGE_DRIVER = "local"; delete process.env.VERCEL;
  harness.currentUser = user("actor");
  harness.users = [harness.currentUser, user("peer"), user("admin", { role: "ADMIN" }), user("inactive", { status: "INACTIVE" })];
  harness.uploads = []; harness.messages = []; harness.attachments = []; harness.writes = []; harness.manifests = [];
  harness.deletes = []; harness.changes = []; harness.objects.clear();
  harness.activeLocked = false; harness.uploadLocked = null;
  harness.failWrite = false; harness.failManifest = false; harness.failInsert = false; harness.failDelete = false;
  harness.afterCandidateRead = null;
});
after(() => {
  delete (globalThis as Row)[harnessKey];
  if (originalDriver === undefined) delete process.env.ATTACHMENT_STORAGE_DRIVER; else process.env.ATTACHMENT_STORAGE_DRIVER = originalDriver;
  if (originalVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = originalVercel;
});

describe("large chat ZIP metadata and bounded chunk parsing", () => {
  test("accepts exactly 100 MiB as 25 parts and validates the last partial part", () => {
    const parsed = parseStaffChatUpload(input({ size: staffChatZipMaxBytes, chunkDigests: Array(25).fill(partDigest) }), "actor");
    assert.equal(parsed.size, 100 * 1024 * 1024); assert.equal(parsed.chunkDigests.length, 25);
    assert.equal(parsed.body, "확인해 주세요.");
    assert.equal(getStaffChatPartSize(parsed.size, 24), staffChatChunkSize);
    assert.equal(getStaffChatPartSize(input().size, 1), tail.length);
    assert.equal(parseStaffChatUpload(input({ body: " ", mimeType: "" }), "actor").body, "파일: 업무 자료.ZIP");
    for (const index of [-1, 1.5, 25, NaN]) assert.throws(() => getStaffChatPartSize(parsed.size, index), { status: 400 });
  });

  test("rejects oversized, multipart-sized, non-ZIP and malformed chunk declarations", () => {
    for (const size of [staffChatZipMaxBytes + 1, staffChatFileMaxBytes, 0, -1, 4.5, Infinity, "104857600"]) {
      assert.throws(() => parseStaffChatUpload(input({ size }), "actor"), { status: 413 });
    }
    for (const originalName of ["report.pdf", "a.zip.exe", "../a.zip", "path\\a.zip", "bad\nname.zip", `${"a".repeat(177)}.zip`]) {
      assert.throws(() => parseStaffChatUpload(input({ originalName }), "actor"), { status: 400 });
    }
    for (const chunkDigests of [[], [partDigest], [partDigest, partDigest, partDigest], [partDigest, "a".repeat(63)], [partDigest, "G".repeat(64)], [partDigest, null]]) {
      assert.throws(() => parseStaffChatUpload(input({ chunkDigests }), "actor"), { status: 400 });
    }
    for (const invalid of [null, [], input({ peerId: "actor" }), input({ mimeType: "a\rb" }), input({ body: null }), input({ body: "x".repeat(2001) })]) {
      assert.throws(() => parseStaffChatUpload(invalid, "actor"), { status: 400 });
    }
  });

  test("fingerprints bind the ordered parts and total size", () => {
    const first = parseStaffChatUpload(input(), "actor").fileDigest;
    const reversed = parseStaffChatUpload(input({ chunkDigests: [hash(tail), partDigest] }), "actor").fileDigest;
    const resized = parseStaffChatUpload(input({ size: input().size + 1 }), "actor").fileDigest;
    assert.notEqual(first, reversed); assert.notEqual(first, resized);
    assert.equal(first, parseStaffChatUpload(input(), "actor").fileDigest);
  });

  test("bounds actual streamed bytes when Content-Length is absent or forged", async () => {
    assert.deepEqual(await readStaffChatChunk(chunkRequest()), part);
    for (const declared of [undefined, "1", "garbage"]) {
      let canceled = false; let count = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) { controller.enqueue(count++ === 0 ? part : Uint8Array.of(1)); },
        cancel() { canceled = true; },
      });
      const headers: Record<string, string> = { Origin: "https://work.example", "Content-Type": "application/octet-stream" };
      if (declared) headers["Content-Length"] = declared;
      const request = new Request("https://work.example/api/chat/uploads/id/parts/0", { method: "PUT", headers, body, duplex: "half" } as RequestInit);
      await assert.rejects(readStaffChatChunk(request), { status: 413 }); assert.equal(canceled, true);
      assert.ok(count <= 3, "an over-limit stream must stop being read immediately");
    }
    const announced = chunkRequest(tail); announced.headers.set("Content-Length", String(staffChatChunkSize + 1));
    await assert.rejects(readStaffChatChunk(announced), { status: 413 });
    const wrongType = chunkRequest(tail); wrongType.headers.set("Content-Type", "application/zip");
    await assert.rejects(readStaffChatChunk(wrongType), { status: 415 });
    await assert.rejects(readStaffChatChunk(chunkRequest(Buffer.alloc(0))), { status: 400 });
    await assert.rejects(readStaffChatChunk(chunkRequest(tail, "https://attacker.example")), { status: 403 });
  });
});

describe("large chat ZIP upload publication and retry safety", () => {
  test("publishes exactly 100 MiB from 25 verified parts and exposes only public message fields", async () => {
    const id = await uploadAll(input({ size: staffChatZipMaxBytes, chunkDigests: Array(25).fill(partDigest) }));
    const response = await completeRoute.POST(jsonRequest(`/${id}/complete`, {}), context(id));
    assert.equal(response.status, 200);
    const value = await response.json(); noPrivateMetadata(value);
    assert.equal(value.message.attachment.size, staffChatZipMaxBytes);
    assert.equal(value.message.attachment.status, "available");
    assert.equal(harness.writes.length, 25); assert.equal(harness.manifests.length, 1);
    assert.equal(harness.manifests[0].parts.reduce((sum: number, row: Row) => sum + row.size, 0), staffChatZipMaxBytes);
    assert.deepEqual(harness.manifests[0].parts.map((row: Row) => row.digest), Array(25).fill(partDigest));
    assert.equal(harness.messages.length, 1); assert.equal(harness.attachments.length, 1);
    assert.deepEqual(harness.changes, [["actor", "peer"]]);
  });

  test("authenticates each route before reads and rejects unrelated administrators or recipients", async () => {
    const { uploadId: id } = await service.startStaffChatUpload("actor", input());
    for (const actor of [null, user("actor", { status: "INACTIVE" }), user("actor", { resignationDate: "2000-01-01" })]) {
      harness.currentUser = actor;
      assert.equal((await startRoute.POST(jsonRequest("", input()))).status, 401);
      assert.equal((await partRoute.PUT(chunkRequest(tail), context(id))).status, 401);
      assert.equal((await completeRoute.POST(jsonRequest(`/${id}/complete`, {}), context(id))).status, 401);
    }
    for (const actor of [user("admin", { role: "ADMIN" }), user("peer")]) {
      harness.currentUser = actor;
      assert.equal((await partRoute.PUT(chunkRequest(tail), context(id))).status, 404);
      assert.equal((await completeRoute.POST(jsonRequest(`/${id}/complete`, {}), context(id))).status, 404);
    }
    assert.equal(harness.writes.length, 0); assert.equal(harness.messages.length, 0);
  });

  test("all mutation routes reject cross-origin requests without storing or publishing bytes", async () => {
    const { uploadId: id } = await service.startStaffChatUpload("actor", input());
    const foreign = "https://attacker.example";
    assert.equal((await startRoute.POST(jsonRequest("", input(), foreign))).status, 403);
    assert.equal((await partRoute.PUT(chunkRequest(tail, foreign), context(id))).status, 403);
    assert.equal((await completeRoute.POST(jsonRequest(`/${id}/complete`, {}, foreign), context(id))).status, 403);
    assert.equal(harness.uploads.length, 1); assert.equal(harness.writes.length, 0); assert.equal(harness.messages.length, 0);
  });

  test("part routes validate identifiers, strict indexes, exact size and SHA-256 before writes", async () => {
    const { uploadId: id } = await service.startStaffChatUpload("actor", input());
    for (const index of ["-1", "01", "1.0", "100", "NaN", "25"]) {
      assert.equal((await partRoute.PUT(chunkRequest(tail), context(id, index))).status, 400);
    }
    assert.equal((await partRoute.PUT(chunkRequest(tail), context("../../bad"))).status, 404);
    assert.equal((await partRoute.PUT(chunkRequest(tail), context(id, "0"))).status, 409);
    assert.equal((await partRoute.PUT(chunkRequest(Buffer.alloc(tail.length)), context(id, "1"))).status, 409);
    assert.equal(harness.writes.length, 0);
    assert.equal((await partRoute.PUT(chunkRequest(tail), context(id, "1"))).status, 200);
    assert.deepEqual(harness.uploads[0].uploadedParts, [1]);
    assert.equal(harness.writes.length, 1);
  });

  test("retries reuse upload and verified parts while changed content or destination conflicts", async () => {
    const first = await service.startStaffChatUpload("actor", input());
    await service.putStaffChatUploadPart("actor", first.uploadId, 1, tail);
    const repeated = await service.startStaffChatUpload("actor", input());
    assert.equal(repeated.uploadId, first.uploadId); assert.deepEqual(repeated.uploadedParts, [1]); noPrivateMetadata(repeated);
    await service.putStaffChatUploadPart("actor", first.uploadId, 1, tail);
    assert.equal(harness.writes.length, 1);
    for (const override of [{ peerId: "admin" }, { body: "changed" }, { originalName: "other.zip" }, { mimeType: "application/octet-stream" }, { size: input().size + 1 }, { chunkDigests: [hash(tail), partDigest] }]) {
      await assert.rejects(service.startStaffChatUpload("actor", input(override)), { status: 409 });
    }
    assert.equal(harness.uploads.length, 1); assert.equal(harness.messages.length, 0);
  });

  test("incomplete finalize preserves uploaded parts and concurrent completion publishes one message", async () => {
    const { uploadId: id } = await service.startStaffChatUpload("actor", input());
    await service.putStaffChatUploadPart("actor", id, 1, tail);
    await assert.rejects(service.completeStaffChatUpload("actor", id), { status: 409 });
    assert.equal(harness.manifests.length, 0); assert.equal(harness.messages.length, 0);
    await service.putStaffChatUploadPart("actor", id, 0, part);
    const results = await Promise.all([service.completeStaffChatUpload("actor", id), service.completeStaffChatUpload("actor", id)]);
    assert.equal(results[0].id, results[1].id);
    assert.equal(harness.messages.length, 1); assert.equal(harness.attachments.length, 1); assert.equal(harness.manifests.length, 1);
    const resumed = await service.startStaffChatUpload("actor", input());
    assert.equal(resumed.message.id, results[0].id); noPrivateMetadata(resumed);
  });

  test("published part retries stay immutable even after the recipient has deleted the attachment", async () => {
    const id = await uploadAll();
    await service.completeStaffChatUpload("actor", id);
    const attachment = harness.attachments[0];
    attachment.deletedAt = new Date(); attachment.storageKey = null; attachment.storageProvider = null;
    harness.objects.clear(); harness.uploads[0].expiresAt = new Date(0);
    await service.putStaffChatUploadPart("actor", id, 0, part);
    await assert.rejects(service.putStaffChatUploadPart("actor", id, 1, Buffer.alloc(tail.length)), { status: 409 });
    const retry = await service.startStaffChatUpload("actor", input());
    assert.equal(retry.message.attachment.status, "deleted");
    assert.equal(harness.writes.length, 2); assert.equal(harness.objects.size, 0); assert.equal(harness.deletes.length, 0);
  });

  test("serialized duplicate starts retain one upload while new request IDs stay independent", async () => {
    const starts = await Promise.all([service.startStaffChatUpload("actor", input()), service.startStaffChatUpload("actor", input())]);
    assert.equal(starts[0].uploadId, starts[1].uploadId); assert.equal(harness.uploads.length, 1);
    await service.startStaffChatUpload("actor", input({ requestId: "request-second" }));
    await service.startStaffChatUpload("actor", input({ requestId: "request-third" }));
    await service.startStaffChatUpload("actor", input({ requestId: "request-fourth" }));
    assert.equal(harness.uploads.length, 4);
  });

  test("an existing ordinary message cannot be reused as a ZIP upload", async () => {
    harness.messages.push({ id: "existing", senderId: "actor", requestId: input().requestId });
    await assert.rejects(service.startStaffChatUpload("actor", input()), { status: 409 });
    assert.equal(harness.uploads.length, 0);
  });

  test("a request ID consumed by another message during upload cannot publish a second message", async () => {
    const id = await uploadAll();
    harness.messages.push({ id: "concurrent-text", senderId: "actor", requestId: input().requestId });
    const response = await completeRoute.POST(jsonRequest(`/${id}/complete`, {}), context(id));
    assert.equal(response.status, 409); noPrivateMetadata(await response.json());
    assert.equal(harness.messages.length, 1); assert.equal(harness.attachments.length, 0);
    assert.equal(harness.uploads[0].messageId, null); assert.equal(harness.changes.length, 0);
  });

  test("participant deactivation blocks start, parts and publication before storage changes", async () => {
    await assert.rejects(service.startStaffChatUpload("actor", input({ peerId: "inactive" })), { status: 404 });
    const id = await uploadAll();
    harness.users.find((row) => row.id === "peer")!.status = "INACTIVE";
    await assert.rejects(service.putStaffChatUploadPart("actor", id, 0, part), { status: 404 });
    await assert.rejects(service.completeStaffChatUpload("actor", id), { status: 404 });
    assert.equal(harness.manifests.length, 0); assert.equal(harness.writes.length, 2); assert.equal(harness.messages.length, 0);
  });

  test("ambiguous part failures leave discoverable bytes and retries repair unrecorded progress", async () => {
    const { uploadId: id } = await service.startStaffChatUpload("actor", input());
    harness.failWrite = true;
    await assert.rejects(service.putStaffChatUploadPart("actor", id, 0, part), /ambiguous storage write failure/);
    assert.deepEqual(harness.uploads[0].uploadedParts, []); assert.equal(harness.objects.size, 1);
    harness.failWrite = false;
    await service.putStaffChatUploadPart("actor", id, 0, part);
    assert.deepEqual(harness.uploads[0].uploadedParts, [0]); assert.equal(harness.objects.size, 1);
  });

  test("manifest and DB publication failures preserve upload for safe completion retry", async () => {
    const id = await uploadAll();
    harness.failManifest = true;
    await assert.rejects(service.completeStaffChatUpload("actor", id), /manifest write unavailable/);
    assert.equal(harness.messages.length, 0); assert.equal(harness.uploads[0].messageId, null);
    harness.failManifest = false; harness.failInsert = true;
    await assert.rejects(service.completeStaffChatUpload("actor", id), /database insert unavailable/);
    assert.equal(harness.messages.length, 0); assert.equal(harness.attachments.length, 0); assert.equal(harness.changes.length, 0);
    harness.failInsert = false;
    await service.completeStaffChatUpload("actor", id);
    assert.equal(harness.messages.length, 1); assert.equal(harness.objects.size, 3); assert.equal(harness.deletes.length, 0);
  });

  test("expiry cleanup retries failed deletion while blocking upload mutation and publication", async () => {
    const id = await uploadAll();
    harness.uploads[0].expiresAt = new Date(0); harness.failDelete = true;
    await service.cleanupExpiredStaffChatUploads("admin"); assert.equal(harness.deletes.length, 0);
    await service.cleanupExpiredStaffChatUploads("actor");
    assert.ok(harness.uploads[0].deletionRequestedAt); assert.equal(harness.objects.size, 2);
    await assert.rejects(service.putStaffChatUploadPart("actor", id, 0, part), { status: 410 });
    await assert.rejects(service.completeStaffChatUpload("actor", id), { status: 410 });
    harness.failDelete = false;
    await service.cleanupExpiredStaffChatUploads("actor");
    assert.deepEqual(harness.deletes, [id, id]); assert.equal(harness.uploads.length, 0); assert.equal(harness.objects.size, 0);
  });

  test("cleanup rechecks publication under the upload lock and never deletes published references", async () => {
    const id = await uploadAll();
    await service.completeStaffChatUpload("actor", id);
    harness.uploads[0].expiresAt = new Date(0);
    await service.cleanupExpiredStaffChatUploads("actor");
    assert.equal(harness.deletes.length, 0); assert.equal(harness.objects.size, 3);
    // Candidate read preceded a concurrent committed finalize; the claim must
    // reload under FOR UPDATE and see the published message before any deletion.
    harness.uploads[0].messageId = null;
    harness.afterCandidateRead = () => { harness.uploads[0].messageId = harness.messages[0].id; };
    await service.cleanupExpiredStaffChatUploads("actor");
    assert.equal(harness.deletes.length, 0); assert.equal(harness.objects.size, 3); assert.equal(harness.uploads[0].deletionRequestedAt, null);
  });
});
