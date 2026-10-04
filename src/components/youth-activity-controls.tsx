"use client";
import { useYouthActivityLeaveGuard } from "@/lib/youth-activity-leave";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getYouthActivityReceiptAction } from "@/app/youth/activity-actions";
import { invalidateYouthActivity, newYouthActivityAttempt, runYouthActivity, type ActivityAttempt } from "@/lib/youth-activity-client";
import type { YouthActionResult } from "@/lib/youth-management-core";
export function YouthActivityDeleteForm({ operation, actorId, id, expectedUpdatedAt, targetYouthId, message, dispatch, fallbackAction, onUnavailable }: { operation: "rule.delete" | "concept.delete"; actorId: string; id: string; expectedUpdatedAt?: string; targetYouthId?: string | null; message: string; dispatch: (id: string, baseline: { requestId: string; expectedUpdatedAt: string; expectedActorId: string; targetYouthId: string | null }) => Promise<YouthActionResult<unknown> & { status?: number }>; fallbackAction?: (form: FormData) => void | Promise<void>; onUnavailable?: () => void }) {
  const attemptRef = useRef<ActivityAttempt<{ id: string; expectedUpdatedAt: string; targetYouthId: string | null }> | null>(null), busy = useRef(false), alive = useRef(true), errorRef = useRef<HTMLParagraphElement>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState(""), [unknown, setUnknown] = useState(false), [blocked, setBlocked] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; invalidateYouthActivity(attemptRef.current); }; }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useYouthActivityLeaveGuard({ dirty: unknown, pending, discard: () => invalidateYouthActivity(attemptRef.current) });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current || blocked || !expectedUpdatedAt) return;
    if (!attemptRef.current && !window.confirm(message)) return;
    if (!attemptRef.current) attemptRef.current = newYouthActivityAttempt(operation, { id, expectedUpdatedAt, targetYouthId: targetYouthId ?? null });
    const attempt = attemptRef.current; busy.current = true; setPending(true); setError("");
    try {
      const outcome = await runYouthActivity(attempt, (payload, requestId) => dispatch(payload.id, { ...payload, requestId, expectedActorId: actorId }), requestId => getYouthActivityReceiptAction(requestId, actorId));
      if (!alive.current || attemptRef.current !== attempt || outcome.kind === "blocked") return;
      if (outcome.kind === "committed" || outcome.result.ok) { attemptRef.current = null; window.location.reload(); return; }
      setError(outcome.result.error); setUnknown(attempt.unknown); setBlocked(attempt.conflict || [401,403,404].includes(outcome.result.status ?? 0));
      if ([401,403,404].includes(outcome.result.status ?? 0)) onUnavailable?.();
      if (!attempt.unknown && !attempt.conflict) attemptRef.current = null;
    } finally { busy.current = false; if (alive.current) setPending(false); }
  }
  return <form action={fallbackAction} onSubmit={submit} className="max-w-full">
    <button type="submit" disabled={pending || blocked || !expectedUpdatedAt} className="min-h-11 min-w-11 rounded-md border border-[var(--danger)] px-3 text-sm text-[var(--danger)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] disabled:opacity-50">{pending ? "처리 중" : unknown ? "같은 삭제 요청 확인" : "삭제"}</button>
    {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="mt-2 max-w-full whitespace-normal break-words text-sm text-[var(--danger)]">{error}</p> : null}
    {blocked ? <button type="button" className="min-h-11 rounded-md border border-[var(--border-strong)] px-3 text-sm" onClick={() => window.location.reload()}>최신 목록 확인</button> : null}
  </form>;
}
