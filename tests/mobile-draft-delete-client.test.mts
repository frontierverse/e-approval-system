import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { createDraftRecoveryHarness, createProtectedPort, deferred, nodes, tick } from "./helpers/mobile-draft-recovery-client.mjs";

async function fixture(status = "draft") {
  const port = createProtectedPort(), h = createDraftRecoveryHarness({ os: "android", protectedPort: port });
  h.mocks["@/components/account-feedback"] = { AccountFeedback: "AccountFeedback" };
  let account = true;
  await h.load("lib/draft-recovery-privacy.ts").bindDraftRecoverySession({ actorId: "actor-a", token: "synthetic-a", mode: "verified-startup", isCurrent: () => account });
  const scope = { kind: "document", documentId: "draft-a" }, version = "2026-10-05T00:12:00.000Z";
  const options = { templates: [{ id: "template-a", name: "합성 양식", fields: [{ name: "note", label: "본문", type: "textarea", required: false }], initialValues: { note: "" } }],
    approvers: [{ id: "director-a", name: "합성 시설장", positionName: "시설장" }], attachmentPolicy: { maxFileCount: 5, maxFileSizeMb: 20, allowedExtensions: [".pdf"] } };
  const draft = { id: "draft-a", title: "합성 임시저장", status, templateId: "template-a", fieldValues: { note: "저장된 합성 본문" }, approverIds: ["director-a"], updatedAt: version, attachments: [] };
  const calls: { path: string; method: string; body: unknown }[] = [];
  let send: (body: unknown) => Promise<Response> = async () => Response.json({ ok: true, deleted: true, documentId: "draft-a" });
  h.state.onFetch = async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname.replace(/^\/api\/mobile/, ""), method = init.method ?? "GET", body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, method, body });
    if (path === "/drafts/options") return Response.json(options);
    assert.equal(path, "/drafts/draft-a");
    if (method === "DELETE") return send(body);
    assert.equal(method, "GET"); return Response.json({ draft });
  };
  const providerModule = h.load("providers/DraftRecoveryProvider.tsx", "AccountDraftRecovery");
  h.mocks["@/providers/DraftRecoveryProvider"] = providerModule;
  const provider = h.mount(providerModule.QAExposed, { token: "synthetic-a", actorId: "actor-a", isAccount: () => account, expireSession: async () => {}, children: "child" });
  await tick(); provider.update();
  const screen = h.mount(h.load("components/draft-editor.tsx", "ScopedDraftEditor").QAExposed, { scope });
  const settle = async () => { for (let i = 0; i < 6; i++) { await tick(); await setImmediate(); provider.update(); screen.update(); } };
  const controls = (label: string) => nodes(screen.tree).filter(v => v.props?.label === label || v.props?.title === label);
  const control = (label: string) => { const row = controls(label)[0]; assert.ok(row, label); return row.props; };
  const field = (label: string) => h.find(screen, "TextInput", label);
  await settle();
  return { h, screen, provider, scope, draft, version, calls, settle, controls, control, field,
    send: (next: typeof send) => { send = next; }, replaceAccount: () => { account = false; } };
}

test("draft delete cancel preserves unsaved input and a recalled document has no delete action", async () => {
  const f = await fixture();
  try {
    f.field("본문").onChangeText("아직 저장하지 않은 본문"); await f.settle();
    f.h.state.confirm = false; f.control("삭제").onPress(); await f.settle();
    assert.equal(f.calls.filter(v => v.method === "DELETE").length, 0);
    assert.equal(f.field("본문").value, "아직 저장하지 않은 본문"); assert.equal(f.h.state.routes.length, 0);
    assert.match(f.h.state.confirmations[0].message, /합성 임시저장.*\n.*복구할 수 없습니다/);
  } finally { f.h.dispose(); }
  const recalled = await fixture("recalled");
  try { assert.equal(recalled.controls("삭제").length, 0); } finally { recalled.h.dispose(); }
});
test("duplicate delete taps dispatch once, freeze saving and leave for the refreshed draft library after acknowledgement", async () => {
  const f = await fixture(), waiting = deferred();
  try {
    f.send(async () => waiting.promise); const tap = f.control("삭제").onPress;
    tap(); tap(); await f.settle();
    assert.equal(f.calls.filter(v => v.method === "DELETE").length, 1, JSON.stringify({calls:f.calls,confirmations:f.h.state.confirmations,feedback:nodes(f.screen.tree).filter(v=>v.type==="AccountFeedback").map(v=>v.props)}));
    assert.equal(f.control("임시저장").disabled, true); assert.equal(f.control("처리 중…").disabled, true);
    assert.equal(f.field("본문").editable, false); assert.equal(f.h.state.routes.length, 0);
    waiting.resolve(Response.json({ ok: true, deleted: true, documentId: "draft-a" })); await f.settle();
    assert.deepEqual(f.h.state.routes, [{ method: "replace", value: "/drafts?folder=drafts" }]);
    assert.equal(f.calls.filter(v => v.method === "POST").length, 0);
  } finally { f.h.dispose(); }
});
test("an unknown delete response retains input and rechecks the same version without another save or a new version", async () => {
  const f = await fixture();
  try {
    f.field("본문").onChangeText("결과 확인 중에도 보존할 입력"); await f.settle();
    const oldSave = f.control("임시저장").onPress;
    f.send(async () => { throw Error("synthetic connection loss"); }); f.control("삭제").onPress(); await f.settle();
    assert.equal(f.field("본문").value, "결과 확인 중에도 보존할 입력"); assert.equal(f.control("임시저장").disabled, true);
    assert.equal(f.h.state.routes.length, 0);
    oldSave(); await f.settle();
    assert.equal(f.calls.filter(v => v.method === "POST").length, 0);
    f.draft.updatedAt = "2026-10-05T00:13:00.000Z";
    f.send(async () => Response.json({ ok: true, deleted: true, documentId: "draft-a" })); f.control("삭제 결과 확인").onPress(); await f.settle();
    assert.deepEqual(f.calls.filter(v => v.method === "DELETE").map(v => v.body), [{ expectedUpdatedAt: f.version }, { expectedUpdatedAt: f.version }]);
    assert.equal(f.h.state.routes.length, 1); assert.equal(f.calls.filter(v => v.method === "POST").length, 0);
  } finally { f.h.dispose(); }
});
test("a changed draft or an account replaced during confirmation cannot dispatch deletion", async () => {
  const changed = await fixture();
  try {
    changed.draft.updatedAt = "2026-10-05T00:13:00.000Z"; changed.control("삭제").onPress(); await changed.settle();
    assert.equal(changed.calls.filter(v => v.method === "DELETE").length, 0);
    assert.equal(changed.field("본문").value, "저장된 합성 본문"); assert.equal(changed.h.state.routes.length, 0);
  } finally { changed.h.dispose(); }
  const switched = await fixture(), confirmation = deferred();
  try {
    switched.h.state.confirm = () => confirmation.promise; switched.control("삭제").onPress(); await switched.settle();
    switched.replaceAccount(); confirmation.resolve(true); await switched.settle();
    assert.equal(switched.calls.filter(v => v.method === "DELETE").length, 0); assert.equal(switched.h.state.routes.length, 0);
  } finally { switched.h.dispose(); }
});
