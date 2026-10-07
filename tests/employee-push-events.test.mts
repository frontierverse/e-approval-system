import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import type { MobilePushEvent, Prisma } from "../src/generated/prisma/client.ts";
import { pushEventBodies, pushEventPayload, koreanPushClock, isScheduleReminderDue } from "../src/lib/mobile-push-events-core.ts";
import { workPushEventId, workPushHref } from "../mobile/src/lib/work-push-routing.ts";

// Only the DB/HTTP/Next scheduling effects are replaced; execute the real queue,
// target resolver, sender and timer code without a production database or device.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const harness = { db: {} as Row, fetch: (async (): Promise<Response> => { throw Error("Unexpected outbound push"); }) as (url: string, options: Row) => Promise<Response> };
const key = "__employeePushHarness";
(globalThis as unknown as Row)[key] = harness;
const moduleUrl = (code: string) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const effects = moduleUrl(`export const prisma=globalThis.${key}.db; export async function dispatchMobilePushDeliveries(){} export function after(){}`);
function compile(file: string, replacements: Record<string,string>) {
  let source = readFileSync(new URL(`../src/lib/${file}`, import.meta.url), "utf8");
  for (const [from,to] of Object.entries(replacements)) source = source.replaceAll(JSON.stringify(from), JSON.stringify(to));
  source = source.replace("await fetch(url,", `await globalThis.${key}.fetch(url,`);
  return moduleUrl(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const eventsUrl = compile("mobile-push-events.ts", {"@/lib/prisma":effects,"@/lib/mobile-push":effects,"next/server":effects});
const { queueStaffPushEvent, resolveStaffPushTarget, openStaffPushEvent } = await import(eventsUrl) as typeof import("../src/lib/mobile-push-events.ts");
const { dispatchMobilePushDeliveries } = await import(compile("mobile-push.ts", {"@/lib/prisma":effects,"@/lib/mobile-push-events":eventsUrl})) as typeof import("../src/lib/mobile-push.ts");
const { createDueStaffPushEvents } = await import(compile("mobile-push-reminders.ts", {"@/lib/prisma":effects,"@/lib/mobile-push-events":eventsUrl})) as typeof import("../src/lib/mobile-push-reminders.ts");
after(() => { delete (globalThis as unknown as Row)[key]; });

// Synthetic recipients and tokens only. No outbound Expo request is made.
test("every work push has a generic body, opaque event ID, work channel and default sound", () => {
  for (const kind of Object.keys(pushEventBodies)) {
    const payload = pushEventPayload({ id: "synthetic-event", kind });
    assert(payload); assert.equal(payload.sound, "default"); assert.equal(payload.channelId, "work");
    assert.deepEqual(payload.data, { pushEventId: "synthetic-event" });
    assert.equal(JSON.stringify(payload).includes("documentId"), false);
    assert.equal(workPushEventId(payload.data), "synthetic-event");
  }
  assert.equal(pushEventPayload({ id: "../private", kind: "CHAT_MESSAGE" }), null);
  assert.equal(pushEventPayload({ id: "valid", kind: "UNKNOWN" }), null);
});
test("Korean daily and 30-minute schedule boundaries do not replay after the start", () => {
  assert.deepEqual(koreanPushClock(new Date("2026-10-06T15:00:00Z")), { date: "2026-10-07", minute: 0, endOfWork: new Date("2026-10-07T09:00:00Z") });
  assert.equal(isScheduleReminderDue(new Date("2026-10-07T00:29:59Z"), "2026-10-07", 600), false);
  assert.equal(isScheduleReminderDue(new Date("2026-10-07T00:30:00Z"), "2026-10-07", 600), true);
  assert.equal(isScheduleReminderDue(new Date("2026-10-07T01:00:00Z"), "2026-10-07", 600), false);
});
test("notification URLs cannot select admin screens, external sites, traversal or injected queries", () => {
  for (const href of ["/chat/peer", "/tasks/task", "/tasks?status=overdue", "/resources/post", "/work-schedules/schedule", "/app-updates", "/documents/document"]) assert.equal(workPushHref(href), true);
  for (const href of ["https://example.test", "//example.test", "/admin/tasks", "/chat/../admin", "/tasks?userId=other", "/resources/a%2Fb", "/work-schedules/x?admin=true", null, {}]) assert.equal(workPushHref(href), false);
});
test("atomic queue selects active recipients, excludes actor, and deduplicates replay per event/device", async () => {
  const now = new Date("2026-10-07T00:00:00Z");
  const users = [{ id: "actor", status: "ACTIVE", resignationDate: null }, { id: "recipient", status: "ACTIVE", resignationDate: "" }, { id: "inactive", status: "INACTIVE", resignationDate: null }, { id: "resigned", status: "ACTIVE", resignationDate: "2026-10-07" }];
  const events: { id: string; eventKey: string; userId: string }[] = [], deliveries: { eventId: string; subscriptionId: string }[] = [];
  const db = {
    user: { async findMany({ where }: { where: { status: string; OR: { resignationDate: unknown }[]; id: { in?: string[]; not?: string } } }) {
      assert.equal(where.status, "ACTIVE"); assert.deepEqual(where.OR.at(-1), { resignationDate: { gt: "2026-10-07" } });
      return users.filter(user => user.status === where.status && (!user.resignationDate || user.resignationDate > "2026-10-07") && user.id !== where.id.not && (!where.id.in || where.id.in.includes(user.id))).map(user => ({ id: user.id }));
    } },
    mobilePushEvent: { async createMany({ data, skipDuplicates }: { data: typeof events; skipDuplicates: boolean }) { assert.equal(skipDuplicates, true); for (const row of data) if (!events.some(item => item.eventKey === row.eventKey && item.userId === row.userId)) events.push({ ...row, id: `event-${events.length}` }); }, async findMany() { return events; } },
    mobilePushSubscription: { async findMany() { return [{ id: "subscription", session: { userId: "recipient" } }]; } },
    mobilePushDelivery: { async createMany({ data, skipDuplicates }: { data: typeof deliveries; skipDuplicates: boolean }) { assert.equal(skipDuplicates, true); for (const row of data) if (!deliveries.some(item => item.eventId === row.eventId && item.subscriptionId === row.subscriptionId)) deliveries.push(row); } },
  } as unknown as Prisma.TransactionClient;
  const input = { kind: "CHAT_MESSAGE" as const, eventKey: "chat:message", targetId: "message", actorId: "actor", userIds: users.map(user => user.id), now, deferDispatch: true };
  await queueStaffPushEvent(db, input); await queueStaffPushEvent(db, input);
  assert.equal(events.length, 1); assert.equal(events[0]!.userId, "recipient"); assert.equal(deliveries.length, 1);
});
test("delivery rechecks ownership, unread state, task version and current schedule before sending", async () => {
  const now = new Date("2026-10-07T00:00:00Z");
  const event = (kind: string, overrides = {}) => ({ id: "event", eventKey: "key", userId: "recipient", kind, targetId: "target", targetVersion: "3", createdAt: now, expiresAt: new Date("2026-10-08T00:00:00Z"), ...overrides }) as MobilePushEvent;
  let readAt: Date | null = null, version = 3, completedAt: Date | null = null;
  const db = {
    staffChatMessage: { async findFirst({ where }: { where: { recipientId: string } }) { return where.recipientId === "recipient" ? { senderId: "peer", readAt } : null; } },
    staffTask: { async findUnique() { return { assigneeId: "recipient", createdById: "admin", version, completedAt, deletedAt: null }; } },
    workSchedule: { async findUnique() { return { id: "target", scheduleDate: "2026-10-07", startMinute: 600, updatedAt: now }; } },
  } as unknown as Prisma.TransactionClient;
  const user = { id: "recipient", role: "USER" };
  assert.equal(await resolveStaffPushTarget(db, event("CHAT_MESSAGE"), user, true, now), "/chat/peer");
  readAt = now; assert.equal(await resolveStaffPushTarget(db, event("CHAT_MESSAGE"), user, true, now), null);
  assert.equal(await resolveStaffPushTarget(db, event("CHAT_MESSAGE"), user, false, now), "/chat/peer");
  assert.equal(await resolveStaffPushTarget(db, event("CHAT_MESSAGE"), { ...user, id: "stranger" }, false, now), null);
  assert.equal(await resolveStaffPushTarget(db, event("TASK_UPDATED"), user, true, now), "/tasks/target");
  version = 4; assert.equal(await resolveStaffPushTarget(db, event("TASK_UPDATED"), user, true, now), null);
  completedAt = now; assert.equal(await resolveStaffPushTarget(db, event("TASK_COMPLETED", { targetVersion: "4", userId: "admin" }), { id: "admin", role: "ADMIN" }, true, now), "/tasks/target?assigned=1");
  assert.equal(await resolveStaffPushTarget(db, event("TASK_COMPLETED", { targetVersion: "4", userId: "admin" }), { id: "admin", role: "USER" }, true, now), null);
  assert.equal(await resolveStaffPushTarget(db, event("WORK_SCHEDULE_REMINDER", { targetVersion: now.toISOString() }), user, true, new Date("2026-10-07T00:45:00Z")), "/work-schedules/target");
  assert.equal(await resolveStaffPushTarget(db, event("WORK_SCHEDULE_REMINDER", { targetVersion: now.toISOString() }), user, true, new Date("2026-10-07T01:00:00Z")), null);
  assert.equal(await resolveStaffPushTarget(db, event("TASK_UPDATED", { expiresAt: now }), user, true, now), null);
});

function match(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if(key === "OR") return value.some((part: Row) => match(row,part));
    if(key === "AND") return value.every((part: Row) => match(row,part));
    const got = row[key];
    if(value === null || typeof value !== "object" || value instanceof Date) return got instanceof Date && value instanceof Date ? +got === +value : got === value;
    if("in" in value && !value.in.includes(got)) return false;
    if("not" in value && got === value.not) return false;
    for(const [op, test] of Object.entries(value)) {
      if(op === "gt" && !(got > test!)) return false;
      if(op === "lt" && !(got < test!)) return false;
      if(op === "lte" && !(got <= test!)) return false;
    }
    return true;
  });
}
function senderFixture() {
  const now = new Date(), sent: Row[][] = [], rows: Row[] = [];
  let mode = "ok", readAt: Date | null = null;
  Object.assign(harness.db, {
    mobilePushDelivery: {
      async findMany({where}:Row) { return rows.filter(row => match(row,where)).map(row => structuredClone(row)); },
      async updateMany({where,data}:Row) { const found=rows.filter(row=>match(row,where));for(const row of found)for(const[key,value]of Object.entries(data))row[key]=value&&typeof value==="object"&&"increment"in value?row[key]+value.increment:value;return{count:found.length}; },
    },
    mobilePushSubscription: { async deleteMany({where}:Row) { for(const row of rows.filter(row=>where.id.in.includes(row.subscriptionId)))row.failedAt=now;return{count:1}; } },
    staffChatMessage: { async findFirst() { return {senderId:"peer",readAt}; } },
  });
  harness.fetch=async(_url,options)=>{const data=JSON.parse(options.body);sent.push(data);if(mode==="http-error")return new Response("",{status:503});return Response.json({data:data.map((_:unknown,i:number)=>mode==="device-gone"?{status:"error",details:{error:"DeviceNotRegistered"}}:{status:"ok",id:`ticket-${i}`})});};
  function add(id: string, approval=false, userId="recipient") {
    const row={id,subscriptionId:`sub-${id}`,attempts:0,nextAttemptAt:new Date(0),sentAt:null,failedAt:null,createdAt:now,
      event:approval?null:{id:`event-${id}`,userId,kind:"CHAT_MESSAGE",targetId:"message",expiresAt:new Date(+now+60000)},
      notification:approval?{documentId:"document",userId,type:"APPROVAL_REQUESTED",readAt:null,document:{status:"IN_PROGRESS",approvalSteps:[{approverId:userId,status:"PENDING"}]}}:null,
      subscription:{id:`sub-${id}`,expoToken:"ExpoPushToken[synthetic]",session:{expiresAt:new Date(+now+60000),user:{id:userId,status:"ACTIVE",role:"USER",resignationDate:null}}}};
    rows.push(row);return row;
  }
  return{rows,sent,add,setMode:(value:string)=>{mode=value;},setRead:()=>{readAt=now;}};
}
test("real sender atomically claims mixed approval/work batches and repeated concurrent dispatch sends once",async()=>{
  const f=senderFixture();f.add("work");f.add("approval",true);
  await Promise.all([dispatchMobilePushDeliveries({checkReceipts:false}),dispatchMobilePushDeliveries({checkReceipts:false})]);
  assert.equal(f.sent.flat().length,2);
  assert.deepEqual(f.sent.flat().map(row=>row.channelId).sort(),["approvals","work"]);
  assert(f.rows.every(row=>row.sentAt && row.attempts===1));
  await dispatchMobilePushDeliveries({checkReceipts:false});assert.equal(f.sent.flat().length,2);
});
test("read chats, recalled approvals, mismatched owners and inactive sessions never reach Expo",async()=>{
  const f=senderFixture();f.add("read-chat");f.setRead();
  const recalled=f.add("recalled",true);recalled.notification!.document.status="RECALLED";
  const wrong=f.add("wrong",true);wrong.notification!.userId="other";
  f.add("inactive").subscription.session.user.status="INACTIVE";
  await dispatchMobilePushDeliveries({checkReceipts:false});assert.equal(f.sent.length,0);assert(f.rows.every(row=>row.failedAt));
});
test("transient Expo errors retry durably and invalid tokens are removed without replay",async()=>{
  const f=senderFixture();const row=f.add("retry");f.setMode("http-error");
  await dispatchMobilePushDeliveries({checkReceipts:false});assert.equal(row.sentAt,null);assert.equal(row.failedAt,null);assert(row.nextAttemptAt>new Date());
  row.nextAttemptAt=new Date(0);f.setMode("ok");await dispatchMobilePushDeliveries({checkReceipts:false});assert(row.sentAt);assert.equal(row.attempts,2);
  const gone=f.add("gone");f.setMode("device-gone");await dispatchMobilePushDeliveries({checkReceipts:false});assert(gone.failedAt);
});
test("daily timers use Korea time, deduplicate runs and expire summaries after working hours",async()=>{
  const events:Row[]=[],deliveries:Row[]=[],users=[{id:"recipient"}];let taskReads=0;
  Object.assign(harness.db,{
    async $transaction(fn:(tx:Row)=>Promise<unknown>){return fn(harness.db);},
    user:{async findMany(){return users;}},
    staffTask:{async findMany(){taskReads++;return[{assigneeId:"recipient",dueDate:"2026-10-07"},{assigneeId:"recipient",dueDate:"2026-10-06"}];}},
    approvalStep:{async findMany(){return[{approverId:"recipient"}];}},
    workSchedule:{async findMany(){return[];}},
    mobilePushEvent:{async createMany({data}:Row){for(const row of data)if(!events.some(e=>e.eventKey===row.eventKey&&e.userId===row.userId))events.push({...row,id:`event-${events.length}`});},async findMany({where}:Row){return events.filter(row=>match(row,where));}},
    mobilePushSubscription:{async findMany(){return[{id:"subscription",session:{userId:"recipient"}}];}},
    mobilePushDelivery:{async createMany({data}:Row){for(const row of data)if(!deliveries.some(e=>e.eventId===row.eventId))deliveries.push(row);}},
  });
  const now=new Date("2026-10-07T00:00:00Z");
  await createDueStaffPushEvents(new Date(+now-1));assert.equal(taskReads,0);
  await createDueStaffPushEvents(now);await createDueStaffPushEvents(now);
  assert.equal(events.length,3);assert.equal(deliveries.length,3);assert(events.every(row=>row.expiresAt.toISOString()==="2026-10-07T09:00:00.000Z"));
  await createDueStaffPushEvents(new Date("2026-10-07T09:00:00Z"));assert.equal(taskReads,2);
  await createDueStaffPushEvents(new Date("2026-10-08T00:00:00Z"));assert.equal(events.length,5); // Next day the old due task is overdue, so only two summaries remain.
});
test("opening an owned work event still rejects a resigned account before target lookup",async()=>{
  Object.assign(harness.db,{user:{async findFirst(){return null;}},async $transaction(fn:(tx:Row)=>Promise<unknown>){return fn(harness.db);},mobilePushEvent:{async findFirst(){throw Error("must not inspect a resigned account event");}}});
  assert.equal(await openStaffPushEvent({id:"recipient",role:"USER"},"event"),null);
});
