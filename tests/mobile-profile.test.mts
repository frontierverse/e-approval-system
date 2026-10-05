import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { profileChatState, profilePushState, type ProfilePushState } from "../mobile/src/lib/profile-state.ts";

const base: ProfilePushState = { native: true, pushStatus: null, pushLoading: false, pushPending: false, pushError: null, pushNeedsSettings: false, pushFailedMode: null };
test("unknown registration never offers an enable action or asserts OFF, including after a failed lookup", () => {
  for (const patch of [{}, { pushLoading: true, pushPending: true }, { pushError: "조회 실패", pushFailedMode: "auto" as const }]) {
    const view = profilePushState({ ...base, ...patch });
    assert.ok(!view.title.includes("꺼짐"));
    assert.ok(!view.actions.some(a => a.kind === "enable"));
  }
  assert.deepEqual(profilePushState({ ...base, pushError: "조회 실패", pushFailedMode: "auto" }).actions.map(a => a.kind), ["retry"]);
});
test("registered ON with OS denial warns about delivery and preserves settings, retry and disable choices", () => {
  const view = profilePushState({ ...base, pushStatus: { enabled: true }, pushNeedsSettings: true, pushError: "권한 꺼짐" });
  assert.match(view.title, /등록 켜짐.*권한 꺼짐/);
  assert.match(view.description, /오지 않을 수/);
  assert.deepEqual(view.actions.map(a => a.kind), ["settings", "retry", "disable"]);
});
test("failed OFF keeps confirmed ON and expresses the retained disable retry intent while pending", () => {
  const failure = { ...base, pushStatus: { enabled: true }, pushFailedMode: "disable" as const, pushError: "연결 실패" };
  assert.equal(profilePushState(failure).title, "켜짐");
  assert.deepEqual(profilePushState(failure).actions, [{ kind: "retry", label: "알림 끄기 다시 시도" }]);
  assert.equal(profilePushState({ ...failure, pushPending: true }).actions[0].label, "해제 중…");
  assert.equal(profilePushState({ ...base, pushStatus: { enabled: false } }).actions[0].kind, "enable");
});
test("web never shows native settings actions even with a stale native error or status", () => {
  const view = profilePushState({ ...base, native: false, pushStatus: { enabled: true }, pushNeedsSettings: true, pushError: "오류" });
  assert.equal(view.actions.length, 0);
  assert.match(view.title, /설치한 모바일 앱/);
});
test("chat unknown/error/zero remain distinct and the overflow badge has the actual accessible count", () => {
  assert.equal(profileChatState(null, null).text, "확인 중");
  assert.equal(profileChatState(null, "조회 실패").text, "확인 필요");
  assert.equal(profileChatState(0, null).text, "");
  assert.equal(profileChatState(128, null).text, "안 읽음 99+개");
  assert.equal(profileChatState(128, null).label, "직원 채팅, 안 읽음 128개");
});

// Run the real hook with lexical React boundaries. Never call real authentication.
type Cell = { value?: unknown; current?: unknown; cleanup?: () => void };
let slots: Cell[], index: number, writes: number;
const hooks = {
  useState(initial: unknown) { const slot = slots[index] ?? (slots[index] = { value: initial }); index++; return [slot.value, (value: unknown) => { writes++; slot.value = value; }]; },
  useRef(initial: unknown) { const slot = slots[index] ?? (slots[index] = { current: initial }); index++; return slot; },
  useEffect(effect: () => () => void) { const slot = slots[index] ?? (slots[index] = { cleanup: effect() }); index++; return slot; },
};
const source = readFileSync(new URL("../mobile/src/lib/use-profile-logout.ts", import.meta.url), "utf8").replace(/^import[^\n]+\n/, "const { useEffect, useRef, useState } = hooks;\n");
const js = ts.transpileModule(source.replace("export function", "function"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const runLogoutHook = new Function("hooks", `${js}; return useProfileLogout;`)(hooks) as (fn: () => Promise<void>) => { request: () => void; cancel: () => void; confirm: () => Promise<void>; confirming: boolean; busy: boolean; error: string | null };
function mount(fn: () => Promise<void>) {
  slots = []; writes = 0;
  const render = () => { index = 0; return runLogoutHook(fn); };
  const unmount = () => slots.forEach(slot => slot.cleanup?.());
  return { render, unmount };
}
test("logout requires an open confirmation, cancel preserves session, and rapid confirmations call signOut once", async () => {
  let calls = 0, resolve!: () => void;
  const hook = mount(() => { calls++; return new Promise<void>(r => { resolve = r; }); });
  let value = hook.render(); await value.confirm(); assert.equal(calls, 0);
  value.request(); value.cancel(); await value.confirm(); assert.equal(calls, 0);
  value.request(); value = hook.render(); assert.equal(value.confirming, true);
  const pending = value.confirm(); value.confirm(); value.cancel(); value.request();
  assert.equal(calls, 1); assert.equal(hook.render().busy, true); assert.equal(hook.render().confirming, true);
  resolve(); await pending; assert.equal(hook.render().busy, false); hook.unmount();
});
test("a departing account cannot show late logout errors or accept an old confirmation", async () => {
  let reject!: (error: Error) => void, calls = 0;
  const hook = mount(() => { calls++; return new Promise<void>((_r, j) => { reject = j; }); });
  const value = hook.render(); value.request(); const pending = value.confirm();
  hook.unmount(); const before = writes; reject(new Error("old account")); await pending;
  assert.equal(writes, before); await value.confirm(); value.request(); assert.equal(calls, 1);
});
test("a pre-cleanup logout failure is retryable and does not leave the screen locked", async () => {
  let calls = 0;
  const hook = mount(async () => { calls++; if (calls === 1) throw new Error("storage unavailable"); });
  let value = hook.render(); value.request(); await value.confirm(); value = hook.render();
  assert.equal(value.busy, false); assert.match(value.error!, /다시 시도/);
  value.request(); assert.equal(hook.render().error, null); await value.confirm(); assert.equal(calls, 2); hook.unmount();
});
