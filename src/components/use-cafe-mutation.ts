"use client";
import { useActionState, useEffect, useLayoutEffect, useCallback, useRef, useState, startTransition, type FormEvent, type MutableRefObject } from "react";
import { useRouter, unstable_rethrow } from "next/navigation";
import { getCafeMutationStatusAction } from "@/app/work-schedule/cafe/actions";
import { isGregorianDate } from "@/lib/gregorian-date";
import type { CafeWebState, CafeOperation, CafeMutationResult } from "@/lib/cafe-mutations-core";
export type CafeAction = (state: CafeWebState, body: FormData) => Promise<CafeWebState>;
export type CafeGate = MutableRefObject<boolean> & { owner?: string };
type Attempt = { payload: FormData; sent: boolean; requestId: string; actorId: string; operation: CafeOperation; targetId?: string };
const unknownMessage = "처리 결과를 확인하지 못했습니다. 입력을 보관했습니다. 같은 요청으로 다시 확인하세요.";

function validTime(value: unknown): value is string { return typeof value === "string" && Number.isFinite(new Date(value).getTime()) && new Date(value).toISOString() === value; }
function validProof(receipt: CafeMutationResult, active: Attempt) {
  if (!receipt || receipt.ok !== true || typeof receipt.message !== "string" || !receipt.message || typeof receipt.replayed !== "boolean" || receipt.requestId !== active.requestId || receipt.operation !== active.operation || receipt.targetType !== (active.operation.startsWith("item.") ? "CafeItem" : "CafeComplianceNote") || !/^[A-Za-z0-9_-]{1,128}$/.test(receipt.targetId) || active.targetId !== undefined && receipt.targetId !== active.targetId || !validTime(receipt.committedAt) || !["present", "deleted"].includes(receipt.outcome)) return false;
  if (active.operation.endsWith(".delete")) return receipt.committedUpdatedAt === null && receipt.outcome === "deleted" && receipt.result === null;
  if (!validTime(receipt.committedUpdatedAt)) return false;
  if (receipt.outcome === "deleted") return receipt.result === null;
  if (!receipt.result || typeof receipt.result !== "object") return false;
  if (receipt.targetType === "CafeItem") {
    if (!("item" in receipt.result)) return false;
    const { item, today } = receipt.result;
    return isGregorianDate(today) && item.id === receipt.targetId && typeof item.name === "string" && typeof item.isHeld === "boolean" && isGregorianDate(item.purchasedAt) && (item.expirationDate === null || isGregorianDate(item.expirationDate)) && validTime(item.createdAt) && validTime(item.updatedAt);
  }
  return "content" in receipt.result && receipt.result.id === receipt.targetId && typeof receipt.result.content === "string" && validTime(receipt.result.createdAt) && validTime(receipt.result.updatedAt);
}

export function useCafeMutation(action: CafeAction, identity: { actorId: string; operation: CafeOperation; targetId?: string; expectedUpdatedAt?: string }, sharedGate?: CafeGate) {
  const router = useRouter();
  const [serverState, fallback, serverPending] = useActionState(action, {});
  const [local, setLocal] = useState<CafeWebState | null>(null), [working, setWorking] = useState(false), [requestId, setRequestId] = useState(() => crypto.randomUUID()), [token, setToken] = useState(identity.expectedUpdatedAt ?? ""), [revision, setRevision] = useState(0);
  const [initial] = useState(() => ({ actorId: identity.actorId, targetId: identity.targetId }));
  const gate = useRef<CafeGate>(sharedGate ?? { current: false }), attempt = useRef<Attempt | null>(null), life = useRef({ active: true, generation: 0 }), form = useRef<HTMLFormElement | null>(null), currentIdentity = useRef(identity), liveRevision = useRef(0), phase = useRef<"idle" | "pending" | "unknown" | "conflict" | "terminal">("idle"), claimed = useRef<{ generation: number; revision: number } | null>(null);
  const state = local ?? serverState, identityChanged = initial.actorId !== identity.actorId || initial.targetId !== identity.targetId;
  const erased = identityChanged || state.status === 401 || state.status === 403 || state.status === 404 && identity.targetId !== undefined;
  const conflict = state.code === "ITEM_CONFLICT" || state.code === "NOTE_CONFLICT";
  const unknown = state.code === "UNKNOWN_RESULT" || state.code === "REQUEST_CONFLICT" || state.status === 0 || state.status === 408 || (state.status ?? 0) >= 500;
  useLayoutEffect(() => { currentIdentity.current = identity; });
  useEffect(() => { const value = life.current; value.active = true; return () => { value.active = false; value.generation++; if (attempt.current) for (const key of Array.from(attempt.current.payload.keys())) attempt.current.payload.delete(key); attempt.current = null; }; }, []);
  function invalidate() { liveRevision.current++; setRevision(liveRevision.current); }
  function record(next: CafeWebState) {
    const indeterminate = next.code === "UNKNOWN_RESULT" || next.code === "REQUEST_CONFLICT" || next.status === 0 || next.status === 408 || (next.status ?? 0) >= 500;
    phase.current = indeterminate ? "unknown" : next.code === "ITEM_CONFLICT" || next.code === "NOTE_CONFLICT" ? "conflict" : next.receipt || [401,403,404].includes(next.status ?? 0) ? "terminal" : "idle";
    if (indeterminate && attempt.current) gate.current.owner = attempt.current.requestId;
    else if (gate.current.owner === attempt.current?.requestId) delete gate.current.owner;
    invalidate(); setLocal(next);
  }
  const clearPrivate = useCallback((message: string, missing = false) => {
    if (attempt.current) { for (const key of Array.from(attempt.current.payload.keys())) attempt.current.payload.delete(key); if (gate.current.owner === attempt.current.requestId) delete gate.current.owner; }
    life.current.generation++; gate.current.current = false; phase.current = "terminal"; liveRevision.current++; setRevision(liveRevision.current); setWorking(false);
    attempt.current = null; form.current?.reset(); setLocal({ error: message, status: missing ? 404 : 403, code: missing ? "NOT_FOUND" : "FORBIDDEN" });
  }, []);
  // Erase old-account state, including a no-JavaScript action's returned auth failure.
  useEffect(() => { if (identityChanged || serverState.status === 401 || serverState.status === 403) clearPrivate(serverState.error ?? "로그인 계정이 변경되었습니다. 카페 관리를 다시 열어 주세요."); }, [identityChanged, serverState, clearPrivate]);
  function accept(receipt: CafeMutationResult, active: Attempt) {
    if (!validProof(receipt, active)) throw new Error("INVALID_RECEIPT");
    record({ success: receipt.outcome === "deleted" && !receipt.operation.endsWith(".delete") ? "이 요청은 처리되었고 현재 대상은 삭제되었습니다." : receipt.message, receipt, resetKey: active.requestId });
    for (const key of Array.from(active.payload.keys())) active.payload.delete(key);
    attempt.current = null; setRequestId(crypto.randomUUID()); router.refresh();
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!life.current.active || liveRevision.current !== revision || currentIdentity.current.actorId !== identity.actorId || currentIdentity.current.targetId !== identity.targetId || gate.current.current || gate.current.owner && gate.current.owner !== requestId || serverPending || erased || conflict || !identity.actorId || identity.targetId && !token || phase.current === "terminal" && identity.targetId) return;
    form.current = event.currentTarget;
    if (!attempt.current) {
      const payload = new FormData(event.currentTarget); payload.set("cafeRequestId", requestId); payload.set("expectedActorId", identity.actorId); if (identity.targetId) payload.set("expectedUpdatedAt", token);
      attempt.current = { payload, sent: false, requestId, actorId: identity.actorId, operation: identity.operation, targetId: identity.targetId };
    }
    const active = attempt.current, generation = life.current.generation, current = () => life.current.active && life.current.generation === generation && active.actorId === currentIdentity.current.actorId && active.targetId === currentIdentity.current.targetId;
    phase.current = "pending"; invalidate(); gate.current.current = true; setWorking(true);
    startTransition(async () => {
      try {
        if (active.sent) {
          const proof = await getCafeMutationStatusAction(active.requestId, active.actorId);
          if (!current()) return;
          if (proof.ok) { accept(proof.data, active); return; }
          if ([401,403].includes(proof.status)) { clearPrivate(proof.error); return; }
          if (!(proof.status === 404 && proof.code === "NOT_FOUND")) { record({ error: proof.error || unknownMessage, code: "UNKNOWN_RESULT" }); return; }
        }
        if (!current()) return;
        active.sent = true;
        const result = await action(state, active.payload);
        if (!current()) return;
        if ([401,403].includes(result.status ?? 0)) { clearPrivate(result.error ?? "로그인 상태를 다시 확인해 주세요."); return; }
        if (result.receipt) { accept(result.receipt, active); return; }
        if (result.status === 404 && identity.targetId) { clearPrivate(result.error ?? "대상을 찾을 수 없습니다. 목록을 다시 확인해 주세요.", true); return; }
        if (result.error && (result.status ?? 0) >= 400 && (result.status ?? 0) < 500 && result.status !== 408) {
          record(result);
          if ([400,413,415].includes(result.status!)) attempt.current = null;
        } else record({ error: result.error || unknownMessage, code: "UNKNOWN_RESULT", ...(result.status === 408 ? { status: 408 } : {}) });
      } catch (error) { unstable_rethrow(error); if (current()) record({ error: unknownMessage, code: "UNKNOWN_RESULT" }); }
      finally { if (current()) { gate.current.current = false; setWorking(false); } }
    });
  }
  function canAdopt() { return life.current.active && !gate.current.current && !gate.current.owner && !erased && liveRevision.current === revision && ["idle", "conflict"].includes(phase.current) && currentIdentity.current.actorId === initial.actorId && currentIdentity.current.targetId === initial.targetId; }
  function adoptBaseline(next: string) {
    if (!canAdopt() || !validTime(next)) return false;
    if (attempt.current) for (const key of Array.from(attempt.current.payload.keys())) attempt.current.payload.delete(key);
    attempt.current = null; phase.current = "idle"; invalidate(); setToken(next); setRequestId(crypto.randomUUID()); setLocal({}); return true;
  }
  return { state, pending: working || serverPending, formAction: fallback, onSubmit, requestId, token, actorId: identity.actorId, erased, conflict, unknown, adoptBaseline, canAdopt, clearPrivate, isBusy: () => gate.current.current, claim: () => { if (!canAdopt()) return false; claimed.current = { generation: life.current.generation, revision: liveRevision.current }; gate.current.current = true; return true; }, release: () => { const value = claimed.current; claimed.current = null; if (value && life.current.active && life.current.generation === value.generation && liveRevision.current === value.revision && !gate.current.owner) gate.current.current = false; } };
}
