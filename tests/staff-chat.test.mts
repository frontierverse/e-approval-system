import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";
import { Prisma } from "../src/generated/prisma/client.ts";
import {
  isStaffChatEmployeeActive,
  parseStaffChatSend,
  readStaffChatJson,
  StaffChatError,
} from "../src/lib/staff-chat-core.ts";

// Prisma test records intentionally cover heterogeneous result/query shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const harness = {
  currentUser: null as Row | null,
  users: [] as Row[],
  messages: [] as Row[],
  changes: [] as string[][],
  queries: [] as Row[],
  race: false,
  locked: false,
};

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (Array.isArray(value) ? value : [value]).every((part) => matches(row, part));
    if (key === "OR") return value.some((part: Row) => matches(row, part));
    if (value === null || typeof value !== "object") return row[key] === value;
    if ("not" in value && row[key] === value.not) return false;
    if ("gt" in value && !(row[key] !== null && row[key] > value.gt)) return false;
    if ("lt" in value && !(row[key] !== null && row[key] < value.lt)) return false;
    if ("lte" in value && !(row[key] !== null && row[key] <= value.lte)) return false;
    if ("some" in value && !row[key]?.some((child: Row) => matches(child, value.some))) return false;
    return true;
  });
}

const fakePrisma = {
  staffChatMessage: {
    async findUnique({ where }: Row) {
      return harness.messages.find((row) => matches(row, where.senderId_requestId)) ?? null;
    },
    async findFirst({ where }: Row) { return harness.messages.find((row) => matches(row, where)) ?? null; },
    async findMany(options: Row) {
      harness.queries.push(options);
      return harness.messages.filter((row) => matches(row, options.where))
        .sort((left, right) => left.sequence > right.sequence ? -1 : 1).slice(0, options.take);
    },
    async create({ data }: Row) {
      assert.equal(harness.locked, true, "eligibility locks must be held during insert");
      const record = message(harness.messages.length + 1, data.senderId, data.recipientId, data);
      harness.messages.push(record);
      if (harness.race) {
        throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "7.10.0" });
      }
      return record;
    },
    async updateMany({ where, data }: Row) {
      let count = 0;
      for (const row of harness.messages) if (matches(row, where)) { Object.assign(row, data); count++; }
      return { count };
    },
  },
  user: {
    async findMany(options: Row) {
      return harness.users.map((user) => ({
        ...user,
        sentChatMessages: harness.messages.filter((row) => row.senderId === user.id),
        receivedChatMessages: harness.messages.filter((row) => row.recipientId === user.id),
      })).filter((row) => matches(row, options.where)).map((user) => {
        const relation = (name: string) => user[name].filter((row: Row) => matches(row, options.select[name].where))
          .sort((left: Row, right: Row) => left.sequence > right.sequence ? -1 : 1).slice(0, options.select[name].take);
        return {
          ...user,
          sentChatMessages: relation("sentChatMessages"),
          receivedChatMessages: relation("receivedChatMessages"),
          _count: { sentChatMessages: user.sentChatMessages.filter((row: Row) => matches(row, options.select._count.select.sentChatMessages.where)).length },
        };
      });
    },
  },
  async $transaction(operation: (tx: Row) => Promise<unknown>) {
    try { return await operation(fakePrisma); }
    finally { harness.locked = false; }
  },
  async $queryRaw(query: Row) {
    assert.match(query.sql, /FOR SHARE/);
    const [actor, peer, today] = query.values;
    harness.locked = true;
    return harness.users.filter((user) => [actor, peer].includes(user.id) && isStaffChatEmployeeActive(user, today));
  },
};

const harnessKey = "__staffChatRegressionHarness";
(globalThis as Row)[harnessKey] = { harness, prisma: fakePrisma };
function moduleUrl(source: string) { return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`; }
const mocks = moduleUrl(`
  const state = globalThis.${harnessKey};
  export const prisma = state.prisma;
  export async function getCurrentUser() { return state.harness.currentUser; }
  export async function publishStaffChatChange(ids) { state.harness.changes.push(ids); }
  export async function retryPendingStaffChatFileDeletes() {}
`);
function compileModule(path: string, aliases: Record<string, string>) {
  let source = readFileSync(new URL(path, import.meta.url), "utf8");
  for (const [specifier, replacement] of Object.entries(aliases)) source = source.replaceAll(`"${specifier}"`, JSON.stringify(replacement));
  return moduleUrl(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}
const serviceModule = compileModule("../src/lib/staff-chat.ts", {
  "@/lib/prisma": mocks, "@/lib/auth": mocks, "@/lib/staff-chat-events": mocks, "@/lib/staff-chat-files": mocks,
});
const service = await import(serviceModule);
const messageRoutes = await import(compileModule("../src/app/api/chat/messages/route.ts", { "@/lib/staff-chat": serviceModule }));
const readRoutes = await import(compileModule("../src/app/api/chat/read/route.ts", { "@/lib/staff-chat": serviceModule }));

function user(id: string, overrides: Row = {}): Row {
  return { id, name: id, status: "ACTIVE", role: "USER", resignationDate: null,
    department: { name: "업무팀" }, position: { name: "직원" }, passwordHash: "secret", ...overrides };
}
function message(sequence: number, senderId = "peer", recipientId = "actor", overrides: Row = {}): Row {
  return { id: `message-${sequence}`, sequence: BigInt(sequence), senderId, recipientId,
    body: `내용 ${sequence}`, requestId: `request-${sequence}`, createdAt: new Date("2026-09-08T00:00:00.000Z"), readAt: null, ...overrides };
}
function post(path: string, body: unknown, origin = "https://work.example") {
  return new Request(`https://work.example/api/chat/${path}`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  harness.currentUser = user("actor");
  harness.users = [harness.currentUser, user("peer"), user("other"), user("former", { status: "INACTIVE" }), user("resigned", { resignationDate: "2000-01-01" })];
  harness.messages = []; harness.changes = []; harness.queries = []; harness.race = false; harness.locked = false;
});
after(() => { delete (globalThis as Row)[harnessKey]; });

describe("staff chat API privacy and delivery", () => {
  test("rejects unauthenticated, inactive, and resigned sessions without writes", async () => {
    for (const current of [null, user("actor", { status: "INACTIVE" }), user("actor", { resignationDate: "2000-01-01" })]) {
      harness.currentUser = current;
      const response = await messageRoutes.POST(post("messages", { peerId: "peer", body: "hello", requestId: "request-test" }));
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
    assert.equal(harness.messages.length, 0);
  });

  test("uses session sender, persists before broadcasting, and reuses retried sends", async () => {
    const payload = { peerId: "peer", senderId: "other", body: "  회의\n확인 부탁드립니다.  ", requestId: "request-repeat" };
    const response = await messageRoutes.POST(post("messages", payload));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.message.senderId, "actor");
    assert.equal(result.message.body, "회의\n확인 부탁드립니다.");
    assert.equal(result.message.sequence, "1");
    assert.equal("requestId" in result.message, false);
    assert.deepEqual(harness.changes, [["actor", "peer"]]);
    await messageRoutes.POST(post("messages", payload));
    assert.equal(harness.messages.length, 1);
    const conflict = await messageRoutes.POST(post("messages", { ...payload, body: "changed" }));
    assert.equal(conflict.status, 409);
    assert.equal(harness.messages.length, 1);
  });

  test("concurrent duplicate requests recover their committed original", async () => {
    harness.race = true;
    const result = await service.sendStaffChatMessage("actor", { peerId: "peer", body: "hello", requestId: "request-race" });
    assert.equal(result.id, "message-1");
    assert.equal(harness.messages.length, 1);
  });

  test("rejects inactive recipients and a sender deactivated after request authentication", async () => {
    for (const peerId of ["former", "resigned", "missing"]) {
      await assert.rejects(service.sendStaffChatMessage("actor", { peerId, body: "hello", requestId: "request-missing" }), { status: 404 });
    }
    harness.users[0].status = "INACTIVE";
    await assert.rejects(service.sendStaffChatMessage("actor", { peerId: "peer", body: "hello", requestId: "request-inactive" }), { status: 401 });
    assert.equal(harness.messages.length, 0);
  });

  test("history stays participant scoped for admins with bounded stable pagination", async () => {
    harness.currentUser!.role = "ADMIN";
    harness.messages = Array.from({ length: 53 }, (_, index) => message(index + 1));
    harness.messages.push(message(99, "peer", "other", { body: "private third-party message" }));
    const first = await service.getStaffChatMessages("actor", "peer");
    assert.equal(first.messages.length, 50);
    assert.equal(first.hasMore, true);
    assert.equal(first.messages[0].sequence, "4");
    assert.equal(first.messages.at(-1).sequence, "53");
    const older = await service.getStaffChatMessages("actor", "peer", first.messages[0].id);
    assert.deepEqual(older.messages.map((row: Row) => row.sequence), ["1", "2", "3"]);
    assert.equal(older.hasMore, false);
    await assert.rejects(service.getStaffChatMessages("actor", "peer", "message-99"), { status: 404 });
    assert.equal(JSON.stringify(first).includes("private third-party"), false);
    assert.equal(harness.queries.every((query) => query.take === 51), true);
  });

  test("read receipts mark only viewed inbound messages despite equal-time arrivals", async () => {
    harness.messages = [message(1), message(2, "actor", "peer"), message(3), message(4, "other", "peer"), message(5)];
    const response = await readRoutes.POST(post("read", { peerId: "peer", messageId: "message-3" }));
    assert.equal(response.status, 200);
    assert.deepEqual(harness.messages.filter((row) => row.readAt).map((row) => row.id), ["message-1", "message-3"]);
    assert.deepEqual(harness.changes, [["actor", "peer"]]);
    await service.markStaffChatRead("actor", { peerId: "peer", messageId: "message-3" });
    assert.equal(harness.changes.length, 1);
    for (const messageId of ["message-2", "message-4"]) {
      await assert.rejects(service.markStaffChatRead("actor", { peerId: "peer", messageId }), { status: 404 });
    }
  });

  test("summary counts only personal inbound messages and retains former conversations", async () => {
    harness.messages = [message(1), message(2, "actor", "peer"), message(3, "former", "actor"), message(4, "other", "peer", { body: "secret unrelated" })];
    const summary = await service.getStaffChatSummary("actor");
    assert.deepEqual(summary.employees.map((peer: Row) => peer.id), ["peer", "other"]);
    assert.equal(summary.unreadCount, 2);
    assert.deepEqual(summary.conversations.map((row: Row) => row.peer.id), ["former", "peer"]);
    assert.equal(summary.conversations[0].peer.active, false);
    assert.equal(summary.conversations[1].lastMessage.id, "message-2");
    assert.equal(JSON.stringify(summary).includes("passwordHash"), false);
    assert.equal(JSON.stringify(summary).includes("secret unrelated"), false);
  });
});

describe("staff chat request validation", () => {
  test("migration denies direct client table access while preserving Prisma owner access", () => {
    const migration = readFileSync(new URL("../prisma/migrations-postgresql/20260908000000_add_staff_chat/migration.sql", import.meta.url), "utf8")
      .replaceAll(/--[^\r\n]*/g, "");
    assert.match(migration, /ALTER TABLE "StaffChatMessage" ENABLE ROW LEVEL SECURITY\s*;/);
    assert.doesNotMatch(migration, /CREATE\s+POLICY/i);
    assert.doesNotMatch(migration, /DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    assert.doesNotMatch(migration, /FORCE\s+ROW\s+LEVEL\s+SECURITY/i);
    assert.doesNotMatch(migration, /GRANT\s+[\s\S]*?\bTO\s+(?:anon|authenticated)\b/i);
  });

  test("rejects empty, overlong, control-character, self, and malformed messages", () => {
    const valid = { peerId: "peer", body: "hello", requestId: "request-test" };
    for (const change of [{ body: " \n " }, { body: "가".repeat(2001) }, { body: "bad\0text" }, { peerId: "actor" }, { requestId: "../invalid" }]) {
      assert.throws(() => parseStaffChatSend({ ...valid, ...change }, "actor"), StaffChatError);
    }
    assert.equal(parseStaffChatSend({ ...valid, body: "가".repeat(2000) }, "actor").body.length, 2000);
  });

  test("rejects cross-origin writes, missing origins, invalid JSON and oversized streaming bodies", async () => {
    await assert.rejects(readStaffChatJson(post("messages", {}, "https://attacker.example")), { status: 403 });
    const missingOrigin = post("messages", {}); missingOrigin.headers.delete("origin");
    await assert.rejects(readStaffChatJson(missingOrigin), { status: 403 });
    const oversized = post("messages", { body: "가".repeat(6000) });
    await assert.rejects(readStaffChatJson(oversized), { status: 413 });
    const invalid = new Request("https://work.example/api/chat/messages", {
      method: "POST", headers: { Origin: "https://work.example", "Content-Type": "application/json" }, body: "{",
    });
    await assert.rejects(readStaffChatJson(invalid), { status: 400 });
    const wrongType = post("messages", {}); wrongType.headers.set("Content-Type", "text/plain");
    await assert.rejects(readStaffChatJson(wrongType), { status: 415 });
  });
});
