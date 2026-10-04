"use client";
import { useEffect, useRef } from "react";
import type { CafeWebState } from "@/lib/cafe-mutations-core";
export function CafeMutationFeedback({ state }: { state: CafeWebState }) {
  const error = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state.error) error.current?.focus(); }, [state.error]);
  return state.error ? <p ref={error} role="alert" tabIndex={-1} className="mt-3 break-words rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{state.error}</p> : state.success ? <p role="status" className="mt-3 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm">{state.success}</p> : null;
}
export function CafeMutationHidden({ mutation }: { mutation: { requestId: string; actorId: string; token: string } }) { return <><input type="hidden" name="cafeRequestId" value={mutation.requestId} /><input type="hidden" name="expectedActorId" value={mutation.actorId} /><input type="hidden" name="expectedUpdatedAt" value={mutation.token} /></>; }
