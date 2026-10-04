/* Synchronous guards reject captured actions immediately after account, focus, or baseline changes. */
/* eslint-disable react-hooks/refs */
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { cafeUnknown, isCafeMutation, newCafeRequestId } from '@/lib/lunch-cafe';
import { useLunchCafe } from '@/providers/LunchCafeProvider';
import type { CafeMutationResult, CafeOperation } from '@/types/lunch-cafe';
import type { LunchCafeRequestOptions } from '@/lib/lunch-cafe-request';
export type CafeAttempt = { requestId: string; operation: CafeOperation; targetId?: string; path: string; method: NonNullable<LunchCafeRequestOptions['method']>; body: Record<string, unknown> | null; uncertain: boolean };
export function useCafeMutation({ current, onSuccess, onLoss }: { current(): boolean; onSuccess(value: CafeMutationResult): void; onLoss(): void }) {
  const { request, isCurrentAccount, foregroundGeneration } = useLunchCafe();
  const attempt = useRef<CafeAttempt | null>(null), busyRef = useRef(false), alive = useRef(false), epoch = useRef(0), revision = useRef(0), callbacks = useRef({ current, onSuccess, onLoss });
  callbacks.current = { current, onSuccess, onLoss };
  const [busy, setBusy] = useState(false), [state, setState] = useState<'idle' | 'uncertain' | 'conflict'>('idle'), [error, setError] = useState<string | null>(null), [fields, setFields] = useState<Record<string, string>>({});
  // StrictMode teardown invalidates earlier requests while retaining their immutable recovery key.
  useEffect(() => {
    alive.current = true; epoch.current++; busyRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(false);
    if (attempt.current) { attempt.current.uncertain = true; setState('uncertain'); }
    return () => {
      alive.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      epoch.current++; busyRef.current = false; if (attempt.current) attempt.current.uncertain = true;
    };
  }, []);
  const valid = () => alive.current && isCurrentAccount() && callbacks.current.current();
  const renderRevision = revision.current;
  const fail = (cause: unknown, pending: CafeAttempt, checking: boolean) => {
    if (!alive.current || !isCurrentAccount()) return;
    if (checking && cause instanceof ApiError && cause.status === 404) { pending.uncertain = true; setState('uncertain'); }
    else if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) { pending.body = null; pending.uncertain = true; callbacks.current.onLoss(); setState('uncertain'); }
    else if (pending.uncertain || cafeUnknown(cause) || cause instanceof ApiError && cause.code === 'REQUEST_CONFLICT') { pending.uncertain = true; setState('uncertain'); }
    else if (cause instanceof ApiError && cause.status === 409) setState('conflict');
    else { attempt.current = null; revision.current++; setState('idle'); }
    setError(cause instanceof Error ? cause.message : '저장 결과를 확인하지 못했습니다.');
    setFields(cause instanceof ApiError && ![401, 403, 404].includes(cause.status) ? cause.fields ?? {} : {});
  };
  const run = async (pending: CafeAttempt, mode: 'send' | 'check' | 'retry') => {
    if (busyRef.current || !valid() || mode !== 'check' && !pending.body) return;
    const generation = epoch.current, foregroundAtStart = foregroundGeneration();
    busyRef.current = true; setBusy(true); setError(null);
    try {
      let result: unknown;
      if (mode === 'check' || mode === 'retry' && pending.uncertain) {
        try { result = await request(`/cafe/mutations/${pending.requestId}`); }
        catch (cause) {
          if (mode !== 'retry' || !(cause instanceof ApiError) || cause.status !== 404 || !pending.body || generation !== epoch.current || foregroundAtStart !== foregroundGeneration() || !valid()) throw cause;
          result = await request(pending.path, { method: pending.method, body: pending.body });
        }
      } else result = await request(pending.path, { method: pending.method, body: pending.body });
      if (generation !== epoch.current || foregroundAtStart !== foregroundGeneration() || !valid()) throw new ApiError('원래 저장 요청의 결과를 다시 확인하세요.', 0);
      if (!isCafeMutation(result, pending)) throw new ApiError('저장 응답을 확인하지 못했습니다. 원래 요청의 결과를 확인하세요.', 200);
      attempt.current = null; revision.current++; setState('idle'); setError(null); setFields({}); callbacks.current.onSuccess(result);
    } catch (cause) { if (generation === epoch.current) fail(cause, pending, mode !== 'send'); }
    finally { if (generation === epoch.current) { busyRef.current = false; setBusy(false); } }
  };
  const submit = async (input: Omit<CafeAttempt, 'requestId' | 'uncertain' | 'body'> & { body: Record<string, unknown> }) => {
    if (renderRevision !== revision.current || busyRef.current || attempt.current || !valid()) return;
    const requestId = newCafeRequestId(), body = JSON.parse(JSON.stringify({ ...input.body, requestId })) as Record<string, unknown>;
    const pending: CafeAttempt = { ...input, requestId, body, uncertain: false };
    attempt.current = pending;
    await run(pending, 'send');
  };
  const loseScope = () => {
    if (!alive.current || !isCurrentAccount()) return;
    if (attempt.current) { attempt.current.body = null; attempt.current.uncertain = true; setState('uncertain'); }
    setFields({}); callbacks.current.onLoss();
  };
  const resetConflict = () => {
    if (!valid() || busyRef.current || state !== 'conflict' || attempt.current?.uncertain) return false;
    attempt.current = null; revision.current++; setState('idle'); setError(null); setFields({}); return true;
  };
  return { submit, loseScope, retry: () => attempt.current ? run(attempt.current, 'retry') : Promise.resolve(), check: () => attempt.current ? run(attempt.current, 'check') : Promise.resolve(), resetConflict, busy, busyRef, state, error, fields, attempt, locked: busy || state !== 'idle', clearValidation: () => { if (!busyRef.current && state === 'idle') { setError(null); setFields({}); } } };
}
