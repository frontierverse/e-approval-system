import assert from "node:assert/strict";
import { test } from "node:test";
import { newYouthActivityAttempt, runYouthActivity, invalidateYouthActivity } from "../src/lib/youth-activity-client.ts";
const failure = (status: number) => ({ ok: false as const, status, error: "합성 오류" });
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { resolve, promise }; };
const receipt = (attempt: { requestId: string; operation: string }, patch = {}) => ({ ok: true as const, data: { ok: true as const, requestId: attempt.requestId, operation: attempt.operation, targetId: "synthetic-target", outcome: "present", ...patch } });
test("activity attempt clones mutable input and blocks overlapping dispatch synchronously", async () => {
  const input = { content: "처음", baselines: [{ id: "old", token: "fixed" }] }, attempt = newYouthActivityAttempt("common.batch", input), hold = deferred<{ ok: true; data: object }>();
  input.content = "바뀜"; input.baselines[0].id = "new"; let calls = 0;
  const work = runYouthActivity(attempt, async (payload, key) => { calls++; assert.equal(key, attempt.requestId); assert.deepEqual(payload, { content: "처음", baselines: [{ id: "old", token: "fixed" }] }); return hold.promise; }, async () => failure(404));
  assert.equal((await runYouthActivity(attempt, async () => { calls++; return { ok: true, data: {} }; }, async () => failure(404))).kind, "blocked"); hold.resolve({ ok: true, data: {} }); assert.equal((await work).kind, "result"); assert.equal(calls, 1);
});
test("ambiguous result retries receipt first and known commit never resends", async () => {
  const attempt = newYouthActivityAttempt("personal.create", { content: "보존" }); let posts = 0, gets = 0;
  await runYouthActivity(attempt, async () => { posts++; throw Error("lost response"); }, async () => failure(404)); assert.equal(attempt.unknown, true);
  const result = await runYouthActivity(attempt, async () => { posts++; return { ok: true, data: {} }; }, async () => { gets++; return receipt(attempt); }); assert.equal(result.kind, "committed"); assert.equal(posts, 1); assert.equal(gets, 1);
});
test("missing receipt retries same immutable key while unavailable status does not dispatch", async () => {
  const attempt = newYouthActivityAttempt("rule.create", { detail: "보존" }); attempt.unknown = true; const calls: string[] = [];
  await runYouthActivity(attempt, async () => { calls.push("POST"); return { ok: true, data: {} }; }, async () => { calls.push("GET"); return failure(500); }); assert.deepEqual(calls, ["GET"]);
  await runYouthActivity(attempt, async (payload, key) => { calls.push("POST:" + key); assert.equal(payload.detail, "보존"); return { ok: true, data: {} }; }, async () => { calls.push("GET"); return failure(404); }); assert.deepEqual(calls, ["GET", "GET", "POST:" + attempt.requestId]);
});
test("definitive validation allows corrected new attempt and conflict blocks automatic overwrite", async () => {
  const first = newYouthActivityAttempt("rule.create", { detail: "빈 입력" }); await runYouthActivity(first, async () => failure(400), async () => failure(404)); assert.equal(first.unknown, false);
  const second = newYouthActivityAttempt("rule.create", { detail: "수정" }); assert.notEqual(first.requestId, second.requestId); let calls = 0; await runYouthActivity(second, async () => { calls++; return failure(409); }, async () => failure(404)); assert.equal(second.conflict, true); assert.equal((await runYouthActivity(second, async () => { calls++; return { ok: true, data: {} }; }, async () => failure(404))).kind, "blocked"); assert.equal(calls, 1);
});
test("timeout of pure status preserves unknown and prevents a late missing receipt from POSTing", async () => {
  const attempt = newYouthActivityAttempt("personal.update", {}), hold = deferred<ReturnType<typeof failure>>(); attempt.unknown = true; let posts = 0;
  const result = await runYouthActivity(attempt, async () => { posts++; return { ok: true, data: {} }; }, () => hold.promise, 5); assert.equal(result.kind, "result"); assert.equal(attempt.unknown, true); assert.equal(attempt.busy, false); hold.resolve(failure(404)); await Promise.resolve(); await Promise.resolve(); assert.equal(posts, 0);
});
test("invalidated account/unmount rejects late result and status callbacks without new mutation", async () => {
  const attempt = newYouthActivityAttempt("concept.check", {}), hold = deferred<ReturnType<typeof receipt>>(); attempt.unknown = true; let posts = 0;
  const work = runYouthActivity(attempt, async () => { posts++; return { ok: true, data: {} }; }, () => hold.promise); invalidateYouthActivity(attempt); hold.resolve(receipt(attempt)); assert.equal((await work).kind, "blocked"); assert.equal(posts, 0);
});
test("malformed 2xx and mismatched receipt retain unknown instead of asserting success", async () => {
  for (const value of [undefined, { ok: "true", data: {} }, { ok: true }, { ok: true, data: null }]) { const attempt = newYouthActivityAttempt("rule.create", {}); await runYouthActivity(attempt, async () => value as never, async () => failure(404)); assert.equal(attempt.unknown, true); }
  for (const patch of [{ operation: "rule.delete" }, { targetId: "" }, { outcome: "invented" }]) { const attempt = newYouthActivityAttempt("rule.create", {}); attempt.unknown = true; let posts = 0; await runYouthActivity(attempt, async () => { posts++; return { ok: true, data: {} }; }, async () => receipt(attempt, patch)); assert.equal(attempt.unknown, true); assert.equal(posts, 0); }
});
