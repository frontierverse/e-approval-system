"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { deleteResourceAction, type ResourceDeleteState } from "@/app/resources/actions";
import { getResourceEditorAction, getResourceMutationStatusAction } from "@/app/resources/upload-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

type DeleteIdentity = { resourceId: string; actorId: string; category: string; expectedUpdatedAt: string; requestId: string };
type DeleteAttempt = { identity: DeleteIdentity; payload: FormData; sent: boolean };
type FreshResource = { title: string; category: string; updatedAt: string };
const unknownResult = "삭제 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.";

export function ResourceDeleteForm({ resourceId, actorId, category, expectedUpdatedAt, initialRequestId }: {
  resourceId: string; actorId: string; category: string; expectedUpdatedAt: string; initialRequestId: string;
}) {
  const router = useRouter();
  const [identity, setIdentity] = useState<DeleteIdentity | null>(() => ({ resourceId, actorId, category, expectedUpdatedAt, requestId: initialRequestId }));
  const [serverState, formAction, serverPending] = useActionState<ResourceDeleteState, FormData>(deleteResourceAction, {});
  const [clientState, setClientState] = useState<ResourceDeleteState | null>(null);
  const [clientPending, setClientPending] = useState(false);
  const [fresh, setFresh] = useState<FreshResource | null>(null);
  const busy = useRef(false), error = useRef<HTMLParagraphElement>(null);
  const attempt = useRef<DeleteAttempt | null>(null), controller = useRef<AbortController | null>(null);
  const state = clientState ?? serverState, pending = clientPending || serverPending;
  const actorChanged = identity !== null && (identity.actorId !== actorId || identity.resourceId !== resourceId);

  function clearPrivate(message: string) {
    controller.current?.abort(); controller.current = null;
    if (attempt.current) for (const name of Array.from(attempt.current.payload.keys())) attempt.current.payload.delete(name);
    attempt.current = null; busy.current = false;
    setIdentity(null); setFresh(null); setClientPending(false);
    setClientState({ error: message, code: "FORBIDDEN", status: 403 });
  }
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, []);
  // Auth changes require immediate erasure of the old account's local request state.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (actorChanged) clearPrivate("로그인 계정이나 자료가 변경되었습니다. 자료실을 다시 열어 주세요.");
    else if (serverState.status === 401 || serverState.status === 403) clearPrivate(serverState.error ?? "자료 삭제 권한을 다시 확인해 주세요.");
  }, [actorChanged, serverState]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => { if (state.error) error.current?.focus(); }, [state]);

  function navigate(selected: DeleteIdentity) {
    router.replace(`/resources?category=${encodeURIComponent(selected.category)}`); router.refresh();
  }
  async function recover(active: DeleteAttempt, signal: AbortSignal) {
    const result = await getResourceMutationStatusAction(active.identity.requestId, active.identity.actorId);
    if (signal.aborted) return true;
    if (result.ok) {
      const receipt = result.data;
      if (!receipt || receipt.ok !== true || receipt.operation !== "delete" || receipt.resourceId !== active.identity.resourceId || receipt.outcome !== "deleted" || receipt.resource !== null) throw new Error("INVALID_RECEIPT");
      navigate(active.identity); return true;
    }
    if (result.status === 401 || result.status === 403) { clearPrivate(result.error); return true; }
    if (result.status === 404 && result.code === "NOT_FOUND") return false;
    setClientState({ error: result.error || unknownResult, code: result.code, status: result.status });
    return true;
  }
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || pending || state.conflict || !identity || actorChanged) return;
    if (!attempt.current) {
      const payload = new FormData();
      for (const [name, value] of Object.entries({ resourceId: identity.resourceId, expectedActorId: identity.actorId, category: identity.category, expectedUpdatedAt: identity.expectedUpdatedAt, requestId: identity.requestId })) payload.set(name, value);
      attempt.current = { identity: { ...identity }, payload, sent: false };
    }
    const active = attempt.current, task = new AbortController();
    controller.current = task; busy.current = true; setClientPending(true);
    startTransition(async () => {
      try {
        if (active.sent && await recover(active, task.signal)) return;
        if (task.signal.aborted) return;
        active.sent = true;
        const result = await deleteResourceAction(state, active.payload);
        if (task.signal.aborted) return;
        if (result.status === 401 || result.status === 403) { clearPrivate(result.error ?? "자료 삭제 권한을 다시 확인해 주세요."); return; }
        setClientState(result.error ? result : { error: unknownResult });
      } catch (cause) {
        if (cause && typeof cause === "object" && "digest" in cause && String(cause.digest).startsWith("NEXT_REDIRECT")) throw cause;
        if (!task.signal.aborted) setClientState({ error: unknownResult });
      } finally {
        if (controller.current === task) { busy.current = false; setClientPending(false); }
      }
    });
  }
  function loadFresh() {
    if (busy.current || !identity || actorChanged) return;
    const selected = identity, task = new AbortController();
    controller.current = task; busy.current = true; setClientPending(true);
    startTransition(async () => {
      try {
        const result = await getResourceEditorAction(selected.resourceId, selected.actorId);
        if (task.signal.aborted) return;
        if (!result.ok) {
          if ([401, 403, 404].includes(result.status)) { clearPrivate(result.error); return; }
          setClientState({ error: result.error, conflict: true }); return;
        }
        const resource = result.data.resource;
        if (!resource || resource.id !== selected.resourceId || !resource.canManage || new Date(resource.updatedAt).toISOString() !== resource.updatedAt) throw new Error("INVALID_EDITOR");
        setFresh({ title: resource.title, category: resource.category, updatedAt: resource.updatedAt });
      } catch { if (!task.signal.aborted) setClientState({ error: "최신 자료를 확인하지 못했습니다. 다시 확인하세요.", conflict: true }); }
      finally { if (controller.current === task) { busy.current = false; setClientPending(false); } }
    });
  }
  function adoptFresh() {
    if (busy.current || !identity || !fresh || actorChanged) return;
    attempt.current = null;
    setIdentity({ ...identity, category: fresh.category, expectedUpdatedAt: fresh.updatedAt, requestId: crypto.randomUUID() });
    setFresh(null); setClientState({});
  }
  if (!identity || actorChanged) return <div className="min-w-0 max-w-sm">
    <p ref={error} tabIndex={-1} role="alert" className="break-words text-sm text-[var(--danger)] [overflow-wrap:anywhere]">{state.error ?? "로그인 계정이 변경되었습니다. 자료실을 다시 열어 주세요."}</p>
    <button type="button" onClick={() => { router.replace("/resources"); router.refresh(); }} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "mt-2 min-h-11 px-3 text-sm")}>자료실로 이동</button>
  </div>;
  return <form action={formAction} className="min-w-0" onSubmit={handleSubmit}>
    <input type="hidden" name="resourceId" value={identity.resourceId} />
    <input type="hidden" name="expectedActorId" value={identity.actorId} />
    <input type="hidden" name="category" value={identity.category} />
    <input type="hidden" name="expectedUpdatedAt" value={identity.expectedUpdatedAt} />
    <input type="hidden" name="requestId" value={identity.requestId} />
    <ConfirmSubmitButton type="submit" disabled={pending || state.conflict} message="이 자료와 첨부파일을 삭제할까요? 삭제한 자료는 복구할 수 없습니다."
      className={buttonClass(buttonStyles.base, buttonStyles.danger, "min-h-11 px-4 text-sm")}>{pending ? "확인 중" : "삭제"}</ConfirmSubmitButton>
    {state.error ? <div className="mt-2 max-w-sm">
      <p ref={error} tabIndex={-1} role="alert" className="break-words text-sm text-[var(--danger)] [overflow-wrap:anywhere]">{state.error}</p>
      {state.conflict ? <>
        <button type="button" disabled={pending} onClick={loadFresh} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "mt-2 min-h-11 px-3 text-sm")}>최신 자료 확인</button>
        {fresh ? <div className="mt-2"><p className="break-words text-sm [overflow-wrap:anywhere]">최신 자료: {fresh.title}</p><button type="button" disabled={pending} onClick={adoptFresh} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "mt-2 min-h-11 px-3 text-sm")}>최신 기준 사용</button></div> : null}
      </> : null}
    </div> : null}
  </form>;
}
