"use client";

import { useEffect, useRef, useState } from "react";
import { chatRequest, readChatResponse } from "@/hooks/use-staff-chat-data";
import { formatChatFileSize } from "@/hooks/use-staff-chat-file-policy";
import type { ChatMessage } from "@/lib/staff-chat-types";
import { StaffChatPreview } from "@/components/staff-chat-preview";

type Attachment = NonNullable<ChatMessage["attachment"]>;
type Props = {
  attachment: Attachment;
  mine: boolean;
  onUpdated: (message: ChatMessage) => void;
  onFailure: (cause: unknown) => void;
};
const actionClass = "min-h-11 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-muted)] disabled:opacity-50";

export function StaffChatFile({ attachment, mine, onUpdated, onFailure }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [cleanupPending, setCleanupPending] = useState(false);
  const busy = useRef(false);
  const requestId = useRef<string | null>(null);
  const received = useRef<{ blob: Blob; token: string } | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const downloadRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const target = error ? errorRef.current : confirming ? confirmRef.current : null;
    if (!target) return;
    target.focus({ preventScroll: true });
    const log = target.closest<HTMLElement>('[role="log"]');
    if (!log) return;
    // The expanded confirmation and the recent-message control can resize the
    // log. Keep the focused action visible without scrolling the whole page.
    const reveal = () => {
      const bounds = log.getBoundingClientRect();
      const action = target.getBoundingClientRect();
      if (action.bottom > bounds.bottom - 8) log.scrollTop += action.bottom - bounds.bottom + 8;
      else if (action.top < bounds.top + 8) log.scrollTop -= bounds.top - action.top + 8;
    };
    const frame = requestAnimationFrame(reveal);
    const observer = new ResizeObserver(reveal);
    observer.observe(log);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [confirming, error]);

  async function completeDownload(token: string) {
    const result = await chatRequest<{ message: ChatMessage }>(`/api/chat/files/${encodeURIComponent(attachment.id)}/complete`, { token });
    onUpdated(result.message);
    received.current = null;
    setCleanupPending(false);
  }

  async function download() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setConfirming(false);
    setError("");
    try {
      requestId.current ??= crypto.randomUUID();
      const response = await fetch(`/api/chat/files/${encodeURIComponent(attachment.id)}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: requestId.current }),
        cache: "no-store",
        signal: AbortSignal.timeout(300_000),
      });
      if (!response.ok) await readChatResponse(response);
      const token = response.headers.get("X-Chat-Download-Token");
      const blob = await response.blob();
      // Never consume an interrupted/truncated transfer, even if HTTP returned 200.
      if (blob.size !== attachment.size || (!mine && !token)) throw new Error("Incomplete file response");
      saveReceivedFile(blob, attachment.originalName);
      if (!mine && token) {
        received.current = { blob, token };
        setCleanupPending(true);
        await completeDownload(token);
      }
    } catch (cause) {
      onFailure(cause);
      setError(received.current
        ? "파일은 받았습니다. 원본 삭제를 다시 시도해 주세요."
        : "다운로드하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function retryCleanup() {
    if (busy.current || !received.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await completeDownload(received.current.token);
    } catch (cause) {
      onFailure(cause);
      setError("파일은 받았습니다. 원본 삭제를 다시 시도해 주세요.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const deleted = attachment.status === "deleted";
  const deleting = attachment.status === "deleting";
  const requestDownload = () => { if (busy.current) return; if (mine) void download(); else setConfirming(true); };
  return (
    <div className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-muted)] p-3 text-[var(--foreground)]" aria-label={`첨부파일 ${attachment.originalName}`} aria-busy={pending}>
      {!deleted && !deleting && !cleanupPending ? <StaffChatPreview attachment={attachment} downloadDisabled={pending} onFailure={onFailure} onDownload={requestDownload} /> : null}
      <div className="flex items-start gap-2">
        <svg aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></svg>
        <div className="min-w-0"><p className="text-sm font-medium leading-5 [overflow-wrap:anywhere]">{attachment.originalName}</p><p className="mt-1 text-xs tabular-nums text-[var(--text-muted)]">{formatChatFileSize(attachment.size)}</p></div>
      </div>
      {deleted ? <p className="mt-2 text-xs text-[var(--text-muted)]">파일 삭제됨 · 수신자가 다운로드한 파일입니다.</p> : (
        <>
          <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{deleting || cleanupPending ? "다운로드 완료 · 원본 삭제 처리 중" : mine ? "상대방이 다운로드하면 원본이 자동 삭제됩니다." : "한 번 다운로드하면 원본이 자동 삭제됩니다."}</p>
          {error ? <p ref={errorRef} role="alert" tabIndex={-1} className="mt-2 text-xs leading-5 text-[var(--danger)]">{error}</p> : null}
          {cleanupPending ? <button type="button" disabled={pending} onClick={() => { void retryCleanup(); }} className={`${actionClass} mt-2`}>{pending ? "원본 삭제 중…" : "원본 삭제 재시도"}</button> : !deleting ? (
            confirming ? <div className="mt-2" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setConfirming(false); downloadRef.current?.focus(); } }}>
              <p className="text-xs leading-5">파일을 받으면 원본이 삭제됩니다. 저장 창에서 취소하면 다시 받을 수 없습니다.</p>
              <div className="mt-2 flex flex-wrap gap-2"><button ref={confirmRef} type="button" onClick={() => { void download(); }} className={actionClass}>다운로드하고 원본 삭제</button><button type="button" onClick={() => { setConfirming(false); downloadRef.current?.focus(); }} className={actionClass}>취소</button></div>
            </div> : <button ref={downloadRef} type="button" aria-label={`${attachment.originalName} 다운로드`} disabled={pending} onClick={requestDownload} className={`${actionClass} mt-2`}>{pending ? "다운로드 중…" : "다운로드"}</button>
          ) : null}
        </>
      )}
    </div>
  );
}

function saveReceivedFile(blob: Blob, originalName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = originalName;
  document.body.appendChild(anchor);
  try { anchor.click(); } finally {
    anchor.remove();
    // Leave enough time for browser download dispatch; no remote file URL is exposed.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
