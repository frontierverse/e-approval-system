import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";
import { Prisma } from "../src/generated/prisma/client.ts";
import { prepareAttachmentFiles } from "../src/lib/attachment-storage.ts";
import { isStaffChatEmployeeActive } from "../src/lib/staff-chat-core.ts";
import { readStaffChatFileForm, staffChatFileMaxBytes, staffChatFileRequestMaxBytes } from "../src/lib/staff-chat-file-core.ts";

// Exercise the real service and request parsers with a serialized in-memory DB
// and storage provider. No production credentials, database or file writes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const harness = {
  currentUser: null as Row | null,
  users: [] as Row[], messages: [] as Row[], attachments: [] as Row[],
  objects: new Map<string, Buffer>(),
  changes: [] as string[][], queries: [] as Row[],
  writes: [] as Row[], deletes: [] as string[], reads: [] as string[],
  policy: { maxFileCount: 10, maxFileSizeMb: 30, allowedExtensions: [".txt", ".pdf", ".png"] },
  failWrite: false, failRead: false, failDelete: false, failInsert: false,
  race: false, locked: false, fileService: null as Row | null,
};

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (Array.isArray(value) ? value : [value]).every((part) => matches(row, part));
    if (key === "OR") return value.some((part: Row) => matches(row, part));
    if (key === "message") return matches(harness.messages.find((entry) => entry.id === row.messageId) ?? {}, value);
    if (value === null || typeof value !== "object" || value instanceof Date) return row[key] === value;
    if ("not" in value && row[key] === value.not) return false;
    if ("in" in value && !value.in.includes(row[key])) return false;
    if ("gt" in value && !(row[key] !== null && row[key] > value.gt)) return false;
    if ("lt" in value && !(row[key] !== null && row[key] < value.lt)) return false;
    if ("lte" in value && !(row[key] !== null && row[key] <= value.lte)) return false;
    return true;
  });
}

function selectRow(row: Row | undefined, select?: Row): Row | null {
  if (!row) return null;
  if (!select) return { ...row };
  return Object.fromEntries(Object.entries(select).filter(([, selected]) => !!selected).map(([name, selected]) => {
    if (name === "attachment") return [name, selectRow(harness.attachments.find((entry) => entry.messageId === row.id), selected.select)];
    if (name === "message") return [name, selectRow(harness.messages.find((entry) => entry.id === row.messageId), selected.select)];
    return [name, row[name]];
  }));
}

let transactionTail: Promise<unknown> = Promise.resolve();
const fakePrisma = {
  staffChatMessage: {
    async findUnique({ where, select }: Row) {
      return selectRow(harness.messages.find((row) => matches(row, where.senderId_requestId ?? where)), select);
    },
    async findFirst({ where, select }: Row) { return selectRow(harness.messages.find((row) => matches(row, where)), select); },
    async findMany(options: Row) {
      harness.queries.push(options);
      return harness.messages.filter((row) => matches(row, options.where)).slice(0, options.take)
        .map((row) => selectRow(row, options.select));
    },
    async create({ data, select }: Row) {
      assert.equal(harness.locked, true, "recipient eligibility must remain locked through creation");
      if (harness.failInsert) throw new Error("database insert unavailable");
      const existing = harness.messages.find((row) => row.senderId === data.senderId && row.requestId === data.requestId);
      if (existing) throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "7.10.0" });
      const row = record(harness.messages.length + 1, data);
      harness.messages.push(row);
      if (data.attachment?.create) {
        harness.attachments.push({ id: `attachment-${row.id}`, messageId: row.id,
          downloadRequestId: null, downloadToken: null, downloadExpiresAt: null,
          downloadedAt: null, deletionRequestedAt: null, deletedAt: null,
          createdAt: new Date(), ...data.attachment.create });
        delete row.attachment;
      }
      return selectRow(row, select);
    },
    async update({ where, data, select }: Row) {
      const row = harness.messages.find((entry) => matches(entry, where));
      assert.ok(row, "updated message must exist");
      Object.assign(row, data);
      return selectRow(row, select);
    },
    async updateMany({ where, data }: Row) {
      let count = 0;
      for (const row of harness.messages) if (matches(row, where)) { Object.assign(row, data); count++; }
      return { count };
    },
  },
  staffChatAttachment: {
    async findUnique({ where, select }: Row) { return selectRow(harness.attachments.find((row) => matches(row, where)), select); },
    async findFirst({ where, select }: Row) { return selectRow(harness.attachments.find((row) => matches(row, where)), select); },
    async findMany(options: Row) {
      harness.queries.push(options);
      return harness.attachments.filter((row) => matches(row, options.where)).slice(0, options.take)
        .map((row) => selectRow(row, options.select));
    },
    async update({ where, data, select }: Row) {
      const row = harness.attachments.find((entry) => matches(entry, where));
      assert.ok(row, "updated attachment must exist"); Object.assign(row, data);
      return selectRow(row, select);
    },
    async updateMany({ where, data }: Row) {
      let count = 0;
      for (const row of harness.attachments) if (matches(row, where)) { Object.assign(row, data); count++; }
      return { count };
    },
  },
  user: {
    async findFirst({ where }: Row) { return harness.users.find((entry) => matches(entry, where)) ?? null; },
    async findUnique({ where }: Row) { return harness.users.find((entry) => matches(entry, where)) ?? null; },
    async findMany() { return []; },
  },
  $transaction(operation: (tx: Row) => Promise<unknown>) {
    const task = transactionTail.then(async () => {
      const snapshot = harness.messages.map((row) => ({ ...row }));
      const attachmentSnapshot = harness.attachments.map((row) => ({ ...row }));
      try { return await operation(fakePrisma); }
      catch (error) { harness.messages = snapshot; harness.attachments = attachmentSnapshot; throw error; }
      finally { harness.locked = false; }
    });
    transactionTail = task.catch(() => undefined);
    return task;
  },
  async $queryRaw(query: Row) {
    harness.queries.push(query);
    if (query.sql.includes('FROM "User"')) {
      assert.match(query.sql, /FOR SHARE/);
      harness.locked = true;
      const today = query.values.find((value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
      return harness.users.filter((entry) => query.values.includes(entry.id) && isStaffChatEmployeeActive(entry, today));
    }
    if (query.sql.includes('FROM "StaffChatMessage"')) {
      assert.match(query.sql, /FOR UPDATE/);
      return harness.messages.filter((entry) => query.values.includes(entry.id)).map((entry) => ({ ...entry }));
    }
    if (query.sql.includes('FROM "StaffChatAttachment"')) {
      assert.match(query.sql, /FOR UPDATE/);
      assert.match(query.sql, /m\."senderId" = \? OR m\."recipientId" = \?/);
      const [id, actor] = query.values;
      return harness.attachments.filter((entry) => entry.id === id && harness.messages.some((message) =>
        message.id === entry.messageId && [message.senderId, message.recipientId].includes(actor))).map((entry) => ({ ...entry }));
    }
    throw new Error(`Unexpected query: ${query.sql}`);
  },
};

const harnessKey = "__staffChatFileRegressionHarness";
(globalThis as Row)[harnessKey] = { harness, prisma: fakePrisma, prepareAttachmentFiles };
function moduleUrl(source: string) { return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`; }
const mocks = moduleUrl(`
  const state = globalThis.${harnessKey};
  export const prisma = state.prisma;
  export async function getCurrentUser() { return state.harness.currentUser; }
  export async function publishStaffChatChange(ids) { state.harness.changes.push(ids); }
  export async function getAttachmentPolicy() { return state.harness.policy; }
  export async function retryPendingStaffChatFileDeletes(userId) { return state.harness.fileService?.retryPendingStaffChatFileDeletes(userId); }
  export const prepareAttachmentFiles = state.prepareAttachmentFiles;
  export async function persistAttachmentFiles(files) {
    if (state.harness.failWrite) throw new Error("storage write unavailable");
    for (const file of files) {
      state.harness.writes.push(file);
      state.harness.objects.set(file.storageKey, Buffer.from(file.buffer));
    }
  }
  export async function removeStoredAttachmentFiles(files) {
    if (state.harness.failDelete) throw new Error("storage delete unavailable");
    for (const file of files) {
      const key = typeof file === "string" ? file : file.storageKey;
      state.harness.deletes.push(key);
      state.harness.objects.delete(key);
    }
  }
  export async function readStoredAttachmentFile(file) {
    state.harness.reads.push(file.storageKey);
    if (state.harness.failRead) throw new Error("storage read unavailable");
    const buffer = state.harness.objects.get(file.storageKey);
    if (!buffer) throw new Error("object missing");
    return { body: new Response(new Uint8Array(buffer)).body, size: buffer.byteLength, mimeType: "text/plain" };
  }
`);
function compileModule(path: string, aliases: Record<string, string>) {
  let source = readFileSync(new URL(path, import.meta.url), "utf8");
  for (const [specifier, replacement] of Object.entries(aliases)) source = source.replaceAll(`"${specifier}"`, JSON.stringify(replacement));
  return moduleUrl(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}

const baseModule = compileModule("../src/lib/staff-chat.ts", {
  "@/lib/prisma": mocks, "@/lib/auth": mocks, "@/lib/staff-chat-events": mocks, "@/lib/staff-chat-files": mocks,
});
const fileModule = compileModule("../src/lib/staff-chat-files.ts", {
  "@/lib/prisma": mocks, "@/lib/attachment-policy": mocks, "@/lib/attachment-storage": mocks,
  "@/lib/staff-chat-events": mocks, "@/lib/staff-chat": baseModule,
});
const service = await import(fileModule);
const baseService = await import(baseModule);
harness.fileService = service;
const routeAliases = { "@/lib/staff-chat": baseModule, "@/lib/staff-chat-files": fileModule };
const uploadRoutes = await import(compileModule("../src/app/api/chat/files/route.ts", routeAliases));
const downloadRoutes = await import(compileModule("../src/app/api/chat/files/[id]/download/route.ts", routeAliases));
const completeRoutes = await import(compileModule("../src/app/api/chat/files/[id]/complete/route.ts", routeAliases));

function user(id: string, overrides: Row = {}): Row {
  return { id, name: id, status: "ACTIVE", role: "USER", resignationDate: null,
    department: { name: "업무팀" }, position: { name: "직원" }, ...overrides };
}
function record(sequence: number, overrides: Row = {}): Row {
  return { id: `message-${sequence}`, sequence: BigInt(sequence), senderId: "actor", recipientId: "peer",
    body: "", requestId: `request-${sequence}`, createdAt: new Date("2026-09-08T00:00:00.000Z"), readAt: null,
    ...overrides };
}
function form(options: { contents?: string | Uint8Array; filename?: string; body?: string; requestId?: string; peerId?: string } = {}) {
  const data = new FormData();
  data.set("peerId", options.peerId ?? "peer");
  data.set("requestId", options.requestId ?? "request-file-send");
  data.set("body", options.body ?? "");
  data.set("file", new File([options.contents ?? "회의 자료"], options.filename ?? "업무 자료.txt", { type: "text/plain" }));
  return data;
}
function post(path: string, value: unknown, origin = "https://work.example") {
  const isForm = value instanceof FormData;
  return new Request(`https://work.example/api/chat/${path}`, {
    method: "POST", headers: { Origin: origin, ...(isForm ? {} : { "Content-Type": "application/json" }) },
    body: isForm ? value : JSON.stringify(value),
  });
}

const originalDriver = process.env.ATTACHMENT_STORAGE_DRIVER;
const originalVercel = process.env.VERCEL;
beforeEach(() => {
  process.env.ATTACHMENT_STORAGE_DRIVER = "local";
  delete process.env.VERCEL;
  harness.currentUser = user("actor");
  harness.users = [harness.currentUser, user("peer"), user("admin", { role: "ADMIN" }), user("inactive", { status: "INACTIVE" })];
  harness.messages = []; harness.attachments = []; harness.objects.clear(); harness.changes = []; harness.queries = [];
  harness.writes = []; harness.deletes = []; harness.reads = [];
  harness.failWrite = false; harness.failRead = false; harness.failDelete = false; harness.failInsert = false;
  harness.race = false; harness.locked = false;
  harness.policy = { maxFileCount: 10, maxFileSizeMb: 30, allowedExtensions: [".txt", ".pdf", ".png"] };
});
after(() => {
  delete (globalThis as Row)[harnessKey];
  if (originalDriver === undefined) delete process.env.ATTACHMENT_STORAGE_DRIVER;
  else process.env.ATTACHMENT_STORAGE_DRIVER = originalDriver;
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
});

async function send(options: Parameters<typeof form>[0] = {}) {
  const message = await service.sendStaffChatFile("actor", form(options));
  return { message, attachment: harness.attachments[0], id: message.attachment.id };
}
async function receive(id: string, requestId = "request-download") {
  const response = await service.downloadStaffChatFile("peer", id, { requestId });
  const contents = Buffer.from(await response.arrayBuffer());
  const token = response.headers.get("X-Chat-Download-Token");
  assert.ok(token);
  return { response, contents, token };
}
function noPrivateMetadata(value: unknown) {
  assert.doesNotMatch(JSON.stringify(value), /storageKey|storageProvider|fileDigest|downloadToken|downloadRequestId/);
}

describe("staff chat file API privacy and one-time delivery", () => {
  test("persists a file and message together and returns only public attachment fields", async () => {
    const { message, attachment } = await send({ contents: "테스트 자료", body: " 확인 바랍니다. " });
    assert.equal(message.body, "확인 바랍니다.");
    assert.equal(message.attachment.status, "available");
    assert.equal(message.attachment.originalName, "업무 자료.txt");
    assert.match(attachment.storageKey, /^staff-chat\//);
    assert.equal(attachment.fileDigest, createHash("sha256").update("테스트 자료").digest("hex"));
    assert.deepEqual(harness.changes, [["actor", "peer"]]);
    assert.equal(harness.objects.size, 1);
    noPrivateMetadata(message);
  });

  test("rejects inactive, signed-out and unrelated administrator file access", async () => {
    const { id } = await send();
    for (const actor of [null, user("actor", { status: "INACTIVE" }), user("actor", { resignationDate: "2000-01-01" })]) {
      harness.currentUser = actor;
      const response = await downloadRoutes.POST(post(`files/${id}/download`, { requestId: "request-denied" }), { params: Promise.resolve({ id }) });
      assert.equal(response.status, 401);
    }
    harness.currentUser = user("admin", { role: "ADMIN" });
    const unrelated = await downloadRoutes.POST(post(`files/${id}/download`, { requestId: "request-denied" }), { params: Promise.resolve({ id }) });
    assert.equal(unrelated.status, 404);
    assert.equal(harness.reads.length, 0);
    assert.equal(harness.deletes.length, 0);
  });

  test("enforces same-origin upload, download and completion", async () => {
    const { id } = await send();
    const upload = await uploadRoutes.POST(post("files", form(), "https://attacker.example"));
    const download = await downloadRoutes.POST(post(`files/${id}/download`, { requestId: "request-cross" }, "https://attacker.example"), { params: Promise.resolve({ id }) });
    const complete = await completeRoutes.POST(post(`files/${id}/complete`, { token: "token-cross" }, "https://attacker.example"), { params: Promise.resolve({ id }) });
    assert.equal(upload.status, 403); assert.equal(download.status, 403); assert.equal(complete.status, 403);
    assert.equal(harness.messages.length, 1); assert.equal(harness.reads.length, 0);
    assert.equal(harness.deletes.length, 0);
  });

  test("deduplicates same-content retries, including after deletion, and rejects changed bytes with the same name and size", async () => {
    const { id, message } = await send({ contents: "AAA" });
    const repeated = await service.sendStaffChatFile("actor", form({ contents: "AAA" }));
    assert.equal(repeated.id, message.id);
    await assert.rejects(service.sendStaffChatFile("actor", form({ contents: "BBB" })), { status: 409 });
    await assert.rejects(service.sendStaffChatFile("actor", form({ contents: "AAA", body: "different" })), { status: 409 });
    await assert.rejects(service.sendStaffChatFile("actor", form({ contents: "AAA", filename: "other.txt" })), { status: 409 });
    const { token } = await receive(id);
    await service.completeStaffChatFileDownload("peer", id, { token });
    const deletedRetry = await service.sendStaffChatFile("actor", form({ contents: "AAA" }));
    assert.equal(deletedRetry.attachment.status, "deleted");
    assert.equal(harness.messages.length, 1); assert.equal(harness.writes.length, 1);
  });

  test("concurrent duplicate upload requests retain exactly one message and stored object", async () => {
    const results = await Promise.all([
      service.sendStaffChatFile("actor", form({ contents: "shared" })),
      service.sendStaffChatFile("actor", form({ contents: "shared" })),
    ]);
    assert.equal(results[0].id, results[1].id);
    assert.equal(harness.messages.length, 1); assert.equal(harness.attachments.length, 1);
    assert.equal(harness.objects.size, 1);
  });

  test("validates one nonempty file, control-free names, effective administrator policy and 4 MiB ceiling", async () => {
    const duplicate = form(); duplicate.append("file", new File(["x"], "extra.txt"));
    const duplicateField = form(); duplicateField.append("peerId", "admin");
    for (const invalid of [duplicate, duplicateField, form({ contents: "" }), form({ filename: "bad\nname.txt" }), form({ filename: "program.exe" })]) {
      await assert.rejects(service.sendStaffChatFile("actor", invalid), { status: 400 });
    }
    await assert.rejects(service.sendStaffChatFile("actor", form({ contents: new Uint8Array(staffChatFileMaxBytes + 1) })), { status: 413 });
    harness.policy.maxFileSizeMb = 1;
    await assert.rejects(service.sendStaffChatFile("actor", form({ contents: new Uint8Array(1024 * 1024 + 1) })), { status: 400 });
    const policy = await service.getStaffChatFilePolicy();
    assert.equal(policy.maxFileSize, 1024 * 1024); assert.equal(policy.maxFileCount, 1);
    assert.equal(harness.writes.length, 0);
  });

  test("checks employee eligibility before storage writes and removes bytes after failed message insert", async () => {
    await assert.rejects(service.sendStaffChatFile("actor", form({ peerId: "inactive" })), { status: 404 });
    assert.equal(harness.writes.length, 0);
    harness.failInsert = true;
    await assert.rejects(service.sendStaffChatFile("actor", form()), /database insert unavailable/);
    assert.equal(harness.messages.length, 0); assert.equal(harness.attachments.length, 0);
    assert.equal(harness.objects.size, 0); assert.equal(harness.deletes.length, 2);
  });

  test("sender download is nonconsuming and cannot complete a recipient lease", async () => {
    const { id, attachment } = await send();
    const sender = await service.downloadStaffChatFile("actor", id, { requestId: "request-sender" });
    assert.equal(await sender.text(), "회의 자료");
    assert.equal(sender.headers.get("X-Chat-Download-Token"), null);
    assert.equal(attachment.downloadToken, null); assert.equal(attachment.deletedAt, null);
    const { token } = await receive(id);
    await assert.rejects(service.completeStaffChatFileDownload("actor", id, { token }), { status: 404 });
    assert.equal(harness.deletes.length, 0);
  });

  test("recipient completion deletes once, preserves tombstone and supports repeated completion", async () => {
    const { id } = await send();
    const { response, contents, token } = await receive(id);
    assert.equal(contents.toString(), "회의 자료");
    assert.equal(response.headers.get("Content-Type"), "application/octet-stream");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    assert.match(response.headers.get("Content-Disposition")!, /^attachment;/);
    assert.equal(harness.deletes.length, 0, "full response receipt alone must not delete without completion");
    const completed = await service.completeStaffChatFileDownload("peer", id, { token });
    const duplicate = await service.completeStaffChatFileDownload("peer", id, { token });
    assert.equal(completed.attachment.status, "deleted"); assert.deepEqual(duplicate, completed);
    assert.equal(harness.objects.size, 0); assert.equal(harness.deletes.length, 1);
    assert.equal(harness.attachments[0].storageKey, null); assert.equal(harness.attachments[0].storageProvider, null);
    assert.ok(harness.attachments[0].fileDigest); noPrivateMetadata(completed);
    for (const actor of ["peer", "actor"]) await assert.rejects(service.downloadStaffChatFile(actor, id, { requestId: "request-after" }), { status: 410 });
  });

  test("lease retries reuse token, concurrent recipients conflict, and replacement invalidates stale completion", async () => {
    const { id } = await send();
    const first = await receive(id);
    const repeated = await receive(id);
    assert.equal(repeated.token, first.token);
    await assert.rejects(service.downloadStaffChatFile("peer", id, { requestId: "request-another-tab" }), { status: 409 });
    harness.attachments[0].downloadExpiresAt = new Date(0);
    const replacement = await receive(id, "request-another-tab");
    assert.notEqual(replacement.token, first.token);
    await assert.rejects(service.completeStaffChatFileDownload("peer", id, { token: first.token }), { status: 409 });
    assert.equal(harness.objects.size, 1);
    harness.attachments[0].downloadExpiresAt = new Date(0);
    const completed = await service.completeStaffChatFileDownload("peer", id, { token: replacement.token });
    assert.equal(completed.attachment.status, "deleted", "expiry alone does not invalidate a receipt before replacement");
  });

  test("simultaneous recipient downloads acquire only one active lease", async () => {
    const { id } = await send();
    const results = await Promise.allSettled([
      service.downloadStaffChatFile("peer", id, { requestId: "request-first-window" }),
      service.downloadStaffChatFile("peer", id, { requestId: "request-second-window" }),
    ]);
    const successful = results.filter((result) => result.status === "fulfilled");
    const failed = results.filter((result) => result.status === "rejected");
    assert.equal(successful.length, 1); assert.equal(failed.length, 1);
    assert.equal(failed[0].reason.status, 409);
    await successful[0].value.arrayBuffer();
    assert.equal(harness.reads.length, 1); assert.equal(harness.deletes.length, 0);
  });

  test("failed file reads release the lease and preserve the stored file for retry", async () => {
    const { id } = await send();
    harness.failRead = true;
    await assert.rejects(service.downloadStaffChatFile("peer", id, { requestId: "request-failed-read" }), /storage read unavailable/);
    assert.equal(harness.attachments[0].deletedAt, null); assert.equal(harness.deletes.length, 0);
    assert.ok(harness.attachments[0].downloadExpiresAt <= new Date());
    harness.failRead = false;
    assert.equal((await receive(id, "request-recovered")).contents.toString(), "회의 자료");
  });

  test("size mismatch preserves bytes and does not acknowledge a truncated file", async () => {
    const { id, attachment } = await send();
    harness.objects.set(attachment.storageKey, Buffer.from("x"));
    await assert.rejects(service.downloadStaffChatFile("peer", id, { requestId: "request-truncated" }), { status: 503 });
    assert.equal(harness.attachments[0].deletionRequestedAt, null); assert.equal(harness.deletes.length, 0);
  });

  test("failed deletion blocks downloads, retains storage references, and participant summary retries cleanup", async () => {
    const { id } = await send();
    const { token } = await receive(id);
    harness.failDelete = true;
    await assert.rejects(service.completeStaffChatFileDownload("peer", id, { token }), { status: 503 });
    const pending = harness.attachments[0];
    assert.ok(pending.deletionRequestedAt); assert.ok(pending.storageKey); assert.equal(pending.deletedAt, null);
    assert.equal(harness.objects.size, 1);
    for (const actor of ["peer", "actor"]) await assert.rejects(service.downloadStaffChatFile(actor, id, { requestId: "request-pending" }), { status: 410 });
    harness.failDelete = false;
    await baseService.getStaffChatSummary("admin");
    assert.equal(harness.objects.size, 1, "unrelated staff must not drive private cleanup");
    await baseService.getStaffChatSummary("peer");
    assert.equal(harness.objects.size, 0); assert.ok(harness.attachments[0].deletedAt);
    assert.equal(harness.attachments[0].storageKey, null);
    assert.equal((await service.completeStaffChatFileDownload("peer", id, { token })).attachment.status, "deleted");
  });
});

describe("chat multipart request limits and migration boundary", () => {
  test("reads legitimate multipart data and enforces a Vercel-safe complete body cap", async () => {
    assert.ok(staffChatFileRequestMaxBytes < 4_500_000);
    const parsed = await readStaffChatFileForm(post("files", form()));
    assert.equal(parsed.get("peerId"), "peer");
    assert.equal((parsed.get("file") as File).name, "업무 자료.txt");
    const tooLarge = post("files", form()); tooLarge.headers.set("Content-Length", String(staffChatFileRequestMaxBytes + 1));
    await assert.rejects(readStaffChatFileForm(tooLarge), { status: 413 });
  });

  test("accepts the advertised maximum file size including multipart overhead", async () => {
    const upload = await uploadRoutes.POST(post("files", form({ contents: new Uint8Array(staffChatFileMaxBytes) })));
    assert.equal(upload.status, 200);
    const { message } = await upload.json();
    assert.equal(message.attachment.size, staffChatFileMaxBytes);
    assert.equal(harness.objects.size, 1);
    noPrivateMetadata(message);
  });

  test("rejects oversized streamed multipart even when Content-Length lies or is absent", async () => {
    for (const declared of [undefined, "1"]) {
      const headers: Record<string, string> = { Origin: "https://work.example", "Content-Type": "multipart/form-data; boundary=test" };
      if (declared) headers["Content-Length"] = declared;
      const request = new Request("https://work.example/api/chat/files", {
        method: "POST", headers, body: new Uint8Array(staffChatFileRequestMaxBytes + 1),
      });
      await assert.rejects(readStaffChatFileForm(request), { status: 413 });
    }
    await assert.rejects(readStaffChatFileForm(post("files", {})), { status: 415 });
    const malformed = new Request("https://work.example/api/chat/files", {
      method: "POST", headers: { Origin: "https://work.example", "Content-Type": "multipart/form-data" }, body: "invalid",
    });
    await assert.rejects(readStaffChatFileForm(malformed), { status: 400 });
  });

  test("migration protects attachment table with RLS and constrains storage tombstones", () => {
    const migration = readFileSync(new URL("../prisma/migrations-postgresql/20260908010000_add_staff_chat_attachments/migration.sql", import.meta.url), "utf8");
    assert.match(migration, /ALTER TABLE "StaffChatAttachment" ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(migration, /CREATE POLICY/i);
    assert.match(migration, /"deletedAt" IS NOT NULL AND "storageKey" IS NULL AND "storageProvider" IS NULL/);
    assert.match(migration, /"size" > 0 AND "size" <= 4194304/);
  });
});
