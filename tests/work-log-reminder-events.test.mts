import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";
import { pushEventPayload } from "../src/lib/mobile-push-events-core.ts";

// Exercise the actual scheduler, durable event queue and target resolver with
// synthetic employees/sessions. No real database or outbound push is used.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const morning = new Date("2026-10-12T00:00:00Z");
const state: Row = { users: [], subscriptions: [], events: [], deliveries: [], userQueries: [], subscriptionQueries: [] };
function matches(row: Row, where: Row): boolean {
  if (!row) return false;
  return Object.entries(where).every(([field, value]) => {
    if (field === "OR") return value.some((condition: Row) => matches(row, condition));
    if (field === "AND") return value.every((condition: Row) => matches(row, condition));
    const actual = row[field];
    if (value === null || typeof value !== "object" || value instanceof Date) return actual === value;
    if ("in" in value) return value.in.includes(actual);
    if ("gt" in value) return actual > value.gt;
    if ("not" in value) return actual !== value.not;
    return matches(actual, value);
  });
}
const db = {
  async $transaction(fn: (tx: Row) => Promise<unknown>) { return fn(db); },
  user: { async findMany({ where }: Row) {
    state.userQueries.push(where);
    return state.users.filter((row: Row) => matches(row, where)).map(({ id }: Row) => ({ id }));
  } },
  staffTask: { async findMany() { return []; } },
  approvalStep: { async findMany() { return []; } },
  workSchedule: { async findMany() { return []; } },
  mobilePushEvent: {
    async createMany({ data, skipDuplicates }: Row) {
      assert.equal(skipDuplicates, true);
      for (const row of data) if (!state.events.some((existing: Row) => existing.eventKey === row.eventKey && existing.userId === row.userId)) {
        state.events.push({ ...row, id: `event-${state.events.length}` });
      }
    },
    async findMany({ where }: Row) { return state.events.filter((row: Row) => matches(row, where)); },
  },
  mobilePushSubscription: { async findMany({ where }: Row) {
    state.subscriptionQueries.push(where);
    return state.subscriptions.filter((row: Row) => matches(row, where));
  } },
  mobilePushDelivery: { async createMany({ data, skipDuplicates }: Row) {
    assert.equal(skipDuplicates, true);
    for (const row of data) if (!state.deliveries.some((existing: Row) => existing.eventId === row.eventId && existing.subscriptionId === row.subscriptionId)) state.deliveries.push(row);
  } },
};
const key = "__workLogReminderEventsHarness";
(globalThis as Row)[key] = { db };
const moduleUrl = (code: string) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const effects = moduleUrl(`export const prisma=globalThis.${key}.db; export async function dispatchMobilePushDeliveries(){throw Error("Unexpected push");} export function after(){throw Error("Unexpected deferred push");}`);
function compile(file: string, replacements: Record<string, string>) {
  let source = readFileSync(new URL(`../src/lib/${file}`, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(JSON.stringify(from), JSON.stringify(to));
  return moduleUrl(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const eventsUrl = compile("mobile-push-events.ts", { "@/lib/prisma": effects, "@/lib/mobile-push": effects, "next/server": effects });
const { resolveStaffPushTarget } = await import(eventsUrl);
const { createDueStaffPushEvents } = await import(compile("mobile-push-reminders.ts", { "@/lib/prisma": effects, "@/lib/mobile-push-events": eventsUrl }));
beforeEach(() => Object.assign(state, {
  users: [
    { id: "staff", status: "ACTIVE", resignationDate: null },
    { id: "head", status: "ACTIVE", resignationDate: "" },
    { id: "no-phone", status: "ACTIVE", resignationDate: null },
    { id: "inactive", status: "INACTIVE", resignationDate: null },
    { id: "resigned", status: "ACTIVE", resignationDate: "2026-10-12" },
  ],
  subscriptions: [
    { id: "staff-phone", session: { userId: "staff", expiresAt: new Date("2027-01-01T00:00:00Z") } },
    { id: "staff-tablet", session: { userId: "staff", expiresAt: new Date("2027-01-01T00:00:00Z") } },
    { id: "head-phone", session: { userId: "head", expiresAt: new Date("2027-01-01T00:00:00Z") } },
    { id: "expired-phone", session: { userId: "staff", expiresAt: morning } },
    { id: "inactive-phone", session: { userId: "inactive", expiresAt: new Date("2027-01-01T00:00:00Z") } },
    { id: "resigned-phone", session: { userId: "resigned", expiresAt: new Date("2027-01-01T00:00:00Z") } },
  ],
  events: [], deliveries: [], userQueries: [], subscriptionQueries: [],
}));
after(() => { delete (globalThis as Row)[key]; });

describe("morning work-log reminder events", () => {
  test("queues every active employee regardless of work-log records and only delivers to current sessions", async () => {
    assert.deepEqual(await createDueStaffPushEvents(morning, db), { scheduled: 1 });
    assert.deepEqual(state.events.map((event: Row) => event.userId), ["staff", "head", "no-phone"]);
    assert.deepEqual(state.deliveries.map((row: Row) => row.subscriptionId), ["staff-phone", "staff-tablet", "head-phone"]);
    assert.equal(state.userQueries[0].id, undefined);
    assert.equal(state.userQueries[0].status, "ACTIVE");
    assert.deepEqual(state.userQueries[0].OR.at(-1), { resignationDate: { gt: "2026-10-12" } });
    assert.equal(state.subscriptionQueries[0].session.expiresAt.gt, morning);
    for (const event of state.events) {
      assert.equal(event.kind, "WORK_LOG_REMINDER");
      assert.equal(event.eventKey, "work-log-reminder:2026-10-12");
      assert.equal(event.targetId, "2026-10-12");
      assert.equal(event.expiresAt.toISOString(), "2026-10-12T01:00:00.000Z");
    }
  });

  test("overlapping 15-minute scheduler calls keep one event per employee and one delivery per device", async () => {
    await Promise.all([createDueStaffPushEvents(morning, db), createDueStaffPushEvents(morning, db)]);
    await createDueStaffPushEvents(new Date("2026-10-12T00:45:00Z"), db);
    assert.equal(state.events.length, 3);
    assert.equal(state.deliveries.length, 3);
    await createDueStaffPushEvents(new Date("2026-10-13T00:00:00Z"), db);
    assert.equal(state.events.length, 6);
    assert.equal(state.deliveries.length, 6);
  });

  test("does not create work-log events on holidays, weekends, unreviewed years or outside the morning", async () => {
    for (const time of [
      "2026-10-09T00:00:00Z", "2026-10-11T00:00:00Z",
      "2026-10-12T00:00:00Z", // Compare the last instant before this morning.
      "2026-10-12T01:00:00Z", "2027-05-03T00:00:00Z", "2028-01-03T00:00:00Z",
    ]) {
      const now = new Date(time);
      if (time === "2026-10-12T00:00:00Z") now.setTime(now.getTime() - 1);
      await createDueStaffPushEvents(now, db);
    }
    assert.equal(state.events.length, 0);
    assert.equal(state.deliveries.length, 0);
    assert.equal(state.userQueries.length, 0);
  });

  test("resolves only owned, current working-morning reminders for delivery while allowing later opening", async () => {
    const event = {
      id: "event", eventKey: "work-log-reminder:2026-10-12", userId: "staff", kind: "WORK_LOG_REMINDER",
      targetId: "2026-10-12", targetVersion: null, createdAt: morning, expiresAt: new Date("2026-10-12T01:00:00Z"),
    };
    const user = { id: "staff", role: "USER" };
    assert.equal(await resolveStaffPushTarget(db, event, user, true, morning), "/work-logs");
    assert.equal(await resolveStaffPushTarget(db, event, { id: "other", role: "ADMIN" }, false, morning), null);
    assert.equal(await resolveStaffPushTarget(db, { ...event, targetId: "2026-10-11" }, user, true, morning), null);
    assert.equal(await resolveStaffPushTarget(db, { ...event, targetId: "../../private" }, user, false, morning), null);
    assert.equal(await resolveStaffPushTarget(db, event, user, true, new Date("2026-10-12T01:00:00Z")), null);
    assert.equal(await resolveStaffPushTarget(db, { ...event, expiresAt: new Date("2027-01-01T00:00:00Z") }, user, true, new Date("2026-10-12T01:00:00Z")), null);
    assert.equal(await resolveStaffPushTarget(db, event, user, false, new Date("2026-10-12T09:00:00Z")), "/work-logs");
  });

  test("uses the existing generic work channel and opaque event payload", () => {
    assert.deepEqual(pushEventPayload({ id: "event", kind: "WORK_LOG_REMINDER" }), {
      title: "바자울", body: "오늘 출근부를 작성해 주세요.", data: { pushEventId: "event" },
      channelId: "work", priority: "high", sound: "default",
    });
  });
});
