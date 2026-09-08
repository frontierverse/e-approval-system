import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";

// Test doubles intentionally accept the different Supabase/React callback shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Values = Record<string, any>;
const harness: Values = {
  env: { SUPABASE_URL: "https://chat.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-private-key" },
  channels: [],
  removed: [],
  calls: [],
};
const harnessKey = "__staffChatRealtimeTestHarness";
(globalThis as Values)[harnessKey] = harness;
const fakeModule = moduleUrl(`
const h = globalThis.${harnessKey};
export function getSupabaseRealtimeServerClient() { return h.client; }
export const UserStatus = { ACTIVE: "ACTIVE" };
export const prisma = { user: { findFirst: (...args) => h.findUser(...args) } };
export function verifySessionValue(value) { return value === "valid" && h.sessionValid ? { userId: "employee-a", expiresAt: 9999999999999 } : null; }
export const sessionCookieName = "gyeoljaeon_session";
export function isStaffChatEmployeeActive(user) { return user.status === "ACTIVE" && !user.resignationDate; }
export function subscribeStaffChatChanges(userId, listener) { h.subscribedUserId = userId; h.listener = listener; return Promise.resolve(async () => { h.closed++; }); }
export function useEffect(effect) { h.effects.push(effect); }
export function useRef(value) { return { current: value }; }
export function useState(value) { h.status = value; return [value, next => { h.status = next; }]; }
`);

function moduleUrl(source: string) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

function compile(path: string, aliases: Record<string, string>, preamble = "") {
  let source = readFileSync(new URL(path, import.meta.url), "utf8")
    .replace('import "server-only";', "")
    .replaceAll("process.env", "h.env");
  for (const [specifier, replacement] of Object.entries(aliases)) {
    source = source.replaceAll(`"${specifier}"`, JSON.stringify(replacement));
  }
  return moduleUrl(ts.transpileModule(
    `const h = globalThis.${harnessKey};\n${preamble}\n${source}`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText);
}

const events = await import(compile("../src/lib/staff-chat-events.ts", {
  "@/lib/supabase-realtime-server": fakeModule,
}, "const fetch = (...args) => h.fetch(...args); const console = { warn() {} };"));
const route = await import(compile("../src/app/api/chat/stream/route.ts", {
  "@/generated/prisma/client": fakeModule,
  "@/lib/prisma": fakeModule,
  "@/lib/session": fakeModule,
  "@/lib/session-constants": fakeModule,
  "@/lib/staff-chat-core": fakeModule,
  "@/lib/staff-chat-events": fakeModule,
}, "const setInterval = fn => { h.heartbeat = fn; return 1; }; const setTimeout = fn => { h.rotate = fn; return 2; }; const clearInterval = () => {}; const clearTimeout = () => {};"));
const hook = await import(compile("../src/hooks/use-staff-chat-sync.ts", { react: fakeModule }, `
const window = { addEventListener: (key, fn) => h.windowEvents[key] = fn, removeEventListener() {} };
const document = { get visibilityState() { return h.visibility; }, addEventListener: (key, fn) => h.documentEvents[key] = fn, removeEventListener() {} };
const navigator = { get onLine() { return h.online; } };
const Date = { now: () => h.now };
const setTimeout = (fn, delay) => h.addTimer(fn, delay, false);
const clearTimeout = id => h.timers.delete(id);
const setInterval = (fn, delay) => h.addTimer(fn, delay, true);
const clearInterval = clearTimeout;
class EventSource {
  constructor(url) { this.url = url; this.events = {}; h.sources.push(this); }
  addEventListener(key, fn) { this.events[key] = fn; }
  close() { this.closed = true; }
}
`));

beforeEach(() => {
  Object.assign(harness, {
    channels: [], removed: [], calls: [], sessionValid: true, closed: 0,
    subscribedUserId: null, listener: null, effects: [], sources: [],
    windowEvents: {}, documentEvents: {}, timers: new Map(), now: 0,
    visibility: "visible", online: true, timerId: 0,
  });
  harness.findUser = async () => ({ id: "employee-a", status: "ACTIVE", resignationDate: null });
  harness.fetch = async (url: string, options: Values) => {
    harness.calls.push({ url, options });
    return new Response(null, { status: 202 });
  };
  harness.client = {
    realtime: { async setAuth() {} },
    channel(topic: string, options: Values) {
      const channel = {
        topic, options,
        on(_type: string, _filter: Values, callback: () => void) { this.change = callback; return this; },
        subscribe(callback: (status: string) => void) { this.status = callback; return this; },
        change() {}, status() {},
      };
      harness.channels.push(channel);
      return channel;
    },
    async removeChannel(channel: Values) { harness.removed.push(channel.topic); },
  };
  harness.addTimer = (fn: () => void, delay: number, repeat: boolean) => {
    const id = ++harness.timerId;
    harness.timers.set(id, { fn, at: harness.now + delay, repeat, delay });
    return id;
  };
});
after(() => { delete (globalThis as Values)[harnessKey]; });

async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
async function advance(ms: number) {
  const target = harness.now + ms;
  for (;;) {
    const next = [...harness.timers.entries()]
      .filter(([, timer]) => timer.at <= target)
      .sort((a, b) => a[1].at - b[1].at)[0];
    if (!next) break;
    const [id, timer] = next;
    harness.now = timer.at;
    if (timer.repeat) timer.at += timer.delay;
    else harness.timers.delete(id);
    timer.fn();
    await settle();
  }
  harness.now = target;
  await settle();
}

function mountHook(refresh: () => Promise<void>) {
  hook.useStaffChatSync({ userId: "employee-a", refresh });
  const cleanups = harness.effects.map((effect: () => (() => void) | void) => effect());
  return () => cleanups.forEach((cleanup: (() => void) | void) => cleanup?.());
}

function request(value = "valid", signal = new AbortController().signal) {
  return { cookies: { get: () => ({ value }) }, signal };
}

describe("staff chat private realtime transport", () => {
  test("publishes only empty private invalidations without employee IDs in topics", async () => {
    await events.publishStaffChatChange(["employee-a", "employee-b", "employee-a"]);
    assert.equal(harness.calls.length, 1);
    const { url, options } = harness.calls[0];
    assert.equal(url, "https://chat.invalid/realtime/v1/api/broadcast");
    assert.equal(options.cache, "no-store");
    const body = JSON.parse(options.body);
    assert.equal(body.messages.length, 2);
    assert.notEqual(body.messages[0].topic, body.messages[1].topic);
    for (const message of body.messages) {
      assert.equal(message.private, true);
      assert.equal(message.event, "change");
      assert.deepEqual(message.payload, {});
      assert.match(message.topic, /^staff-chat:[a-f0-9]{64}$/);
    }
    assert.doesNotMatch(options.body, /employee-a|employee-b|senderId|recipientId|body/);
  });

  test("broadcast failure never rejects a committed send", async () => {
    harness.fetch = async () => { throw new Error("network failed"); };
    await assert.doesNotReject(() => events.publishStaffChatChange(["employee-a"]));
  });

  test("two tabs share one private channel and closing one preserves the other", async () => {
    let first = 0;
    let second = 0;
    const statuses: string[] = [];
    const offFirst = await events.subscribeStaffChatChanges("employee-a", {
      onChange() { first++; }, onStatus(status: string) { statuses.push(status); },
    });
    const channel = harness.channels[0];
    assert.equal(channel.options.config.private, true);
    channel.status("SUBSCRIBED");
    const offSecond = await events.subscribeStaffChatChanges("employee-a", {
      onChange() { second++; }, onStatus(status: string) { statuses.push(status); },
    });
    assert.equal(harness.channels.length, 1);
    assert.deepEqual(statuses, ["ready", "ready"]);
    channel.change();
    await offFirst();
    channel.change();
    assert.equal(first, 1);
    assert.equal(second, 2);
    assert.equal(harness.removed.length, 0);
    await offSecond();
    await offSecond();
    assert.equal(harness.removed.length, 1);
  });

  test("an unrelated employee receives no invalidation", async () => {
    let unrelated = 0;
    const offFirst = await events.subscribeStaffChatChanges("employee-a", { onChange() {}, onStatus() {} });
    const offOther = await events.subscribeStaffChatChanges("employee-b", { onChange() { unrelated++; }, onStatus() {} });
    harness.channels[0].change();
    assert.equal(unrelated, 0);
    assert.notEqual(harness.channels[0].topic, harness.channels[1].topic);
    await offFirst();
    await offOther();
  });

  test("waits for a closing channel before a new tab subscribes", async () => {
    let release: (() => void) | undefined;
    harness.client.removeChannel = () => new Promise<void>(resolve => { release = resolve; });
    const offFirst = await events.subscribeStaffChatChanges("employee-a", { onChange() {}, onStatus() {} });
    const closing = offFirst();
    const opening = events.subscribeStaffChatChanges("employee-a", { onChange() {}, onStatus() {} });
    await settle();
    assert.equal(harness.channels.length, 1);
    release!();
    await closing;
    const offNext = await opening;
    assert.equal(harness.channels.length, 2);
    harness.client.removeChannel = async () => {};
    await offNext();
  });
});

describe("staff chat authenticated SSE", () => {
  test("rejects unauthenticated and inactive users before subscribing", async () => {
    assert.equal((await route.GET(request("invalid"))).status, 401);
    harness.findUser = async () => null;
    assert.equal((await route.GET(request())).status, 401);
    harness.findUser = async () => ({ id: "employee-a", status: "ACTIVE", resignationDate: "2020-01-01" });
    assert.equal((await route.GET(request())).status, 401);
    assert.equal(harness.subscribedUserId, null);
  });

  test("sends empty participant invalidations and closes on expired sessions", async () => {
    const response = await route.GET(request());
    const reader = response.body.getReader();
    assert.match(response.headers.get("Cache-Control"), /private.*no-store/);
    assert.equal(harness.subscribedUserId, "employee-a");
    assert.match(new TextDecoder().decode((await reader.read()).value), /retry: 3000/);
    harness.listener.onStatus("ready");
    assert.equal(new TextDecoder().decode((await reader.read()).value), "event: ready\ndata: {}\n\n");
    harness.listener.onChange();
    assert.equal(new TextDecoder().decode((await reader.read()).value), "event: change\ndata: {}\n\n");
    harness.sessionValid = false;
    harness.listener.onChange();
    assert.match(new TextDecoder().decode((await reader.read()).value), /auth-expired/);
    assert.equal((await reader.read()).done, true);
    assert.equal(harness.closed, 1);
  });

  test("heartbeat revokes an inactive employee and browser abort removes subscription", async () => {
    const response = await route.GET(request());
    const reader = response.body.getReader();
    await reader.read();
    harness.findUser = async () => null;
    harness.heartbeat();
    await settle();
    assert.match(new TextDecoder().decode((await reader.read()).value), /auth-expired/);
    assert.equal((await reader.read()).done, true);
    assert.equal(harness.closed, 1);

    harness.findUser = async () => ({ id: "employee-a", status: "ACTIVE", resignationDate: null });
    const abort = new AbortController();
    const next = await route.GET(request("valid", abort.signal));
    await settle();
    abort.abort();
    await settle();
    assert.equal(harness.closed, 2);
    await next.body.cancel();
  });

  test("rotates a long-running stream before the hosting timeout", async () => {
    const response = await route.GET(request());
    const reader = response.body.getReader();
    await reader.read();
    harness.rotate();
    assert.match(new TextDecoder().decode((await reader.read()).value), /reconnect/);
    assert.equal((await reader.read()).done, true);
    assert.equal(harness.closed, 1);
  });
});

describe("staff chat client synchronization", () => {
  test("announces connected only after refreshing messages and still polls after missed broadcasts", async () => {
    let calls = 0;
    const unmount = mountHook(async () => { calls++; });
    await advance(0);
    assert.equal(calls, 1);
    assert.equal(harness.status, "connecting");
    harness.sources[0].events.ready();
    assert.equal(harness.status, "connecting");
    await advance(0);
    assert.equal(harness.status, "connected");
    await advance(30_000);
    assert.equal(calls, 3);
    unmount();
    assert.equal(harness.sources[0].closed, true);
    assert.equal(harness.timers.size, 0);
  });

  test("retains changes arriving while a refresh is in flight", async () => {
    let release: (() => void) | undefined;
    let calls = 0;
    const unmount = mountHook(async () => {
      calls++;
      if (calls === 1) await new Promise<void>(resolve => { release = resolve; });
    });
    await advance(0);
    harness.sources[0].events.change();
    await advance(75);
    assert.equal(calls, 1);
    release!();
    await settle();
    assert.equal(calls, 2);
    unmount();
  });

  test("recovers failed HTTP refreshes and pauses requests when offline or hidden", async () => {
    let calls = 0;
    let fail = true;
    const unmount = mountHook(async () => { calls++; if (fail) throw new Error("failed"); });
    harness.sources[0].events.ready();
    await advance(0);
    assert.equal(harness.status, "reconnecting");
    fail = false;
    await advance(5_000);
    assert.equal(harness.status, "connected");
    harness.online = false;
    harness.windowEvents.offline();
    assert.equal(harness.status, "offline");
    const previous = calls;
    await advance(35_000);
    assert.equal(calls, previous);
    harness.online = true;
    harness.visibility = "hidden";
    harness.documentEvents.visibilitychange();
    assert.equal(harness.status, "paused");
    await advance(5_000);
    assert.equal(calls, previous);
    harness.visibility = "visible";
    harness.documentEvents.visibilitychange();
    await advance(0);
    assert.equal(calls, previous + 1);
    unmount();
  });

  test("reconnects a dropped stream and stops polling after authentication expires", async () => {
    let calls = 0;
    const unmount = mountHook(async () => { calls++; });
    await advance(0);
    harness.sources[0].events.ready();
    await advance(0);
    assert.equal(harness.status, "connected");
    harness.sources[0].onerror();
    assert.equal(harness.status, "reconnecting");
    assert.equal(harness.sources[0].closed, true);
    await advance(3_000);
    assert.equal(harness.sources.length, 2);
    harness.sources[1].events.ready();
    await advance(0);
    assert.equal(harness.status, "connected");
    harness.sources[1].events["auth-expired"]();
    assert.equal(harness.status, "expired");
    assert.equal(harness.sources[1].closed, true);
    const previous = calls;
    await advance(35_000);
    assert.equal(calls, previous);
    unmount();
  });
});
