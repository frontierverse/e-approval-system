"use client";

import { useEffect, useRef, useState } from "react";
import { AppModal } from "@/components/app-modal";
import { StaffChatPdfPreview } from "@/components/staff-chat-pdf-preview";
import { readChatResponse } from "@/hooks/use-staff-chat-data";
import { getAttachmentPreviewKind } from "@/lib/attachment-preview";
import type { ChatAttachment } from "@/lib/staff-chat-types";

type Props = {
  attachment: ChatAttachment;
  downloadDisabled: boolean;
  onDownload: () => void;
  onFailure: (cause: unknown) => void;
};
const actionClass = "min-h-11 min-w-11 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-muted)]";

export function StaffChatPreview({ attachment, downloadDisabled, onDownload, onFailure }: Props) {
  const kind = getAttachmentPreviewKind(attachment.originalName);
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [image, setImage] = useState<{ key: string; url?: string; error?: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const key = `${attachment.id}:${attempt}`;
  const previewUrl = `/api/chat/files/${encodeURIComponent(attachment.id)}/preview`;
  const currentImage = image?.key === key ? image : null;

  useEffect(() => {
    const container = containerRef.current;
    if (kind !== "image" || !container) return;
    const controller = new AbortController();
    let active = true;
    let started = false;
    let objectUrl: string | undefined;
    async function load() {
      try {
        const response = await fetch(previewUrl, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
        if (!response.ok) await readChatResponse(response);
        const blob = await response.blob();
        if (!/^image\/(png|jpeg|gif|webp)$/.test(blob.type) || blob.size !== attachment.size) throw new Error("Invalid image preview");
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setImage({ key, url: objectUrl });
      } catch (cause) {
        if (!active) return;
        onFailure(cause);
        setImage({ key, error: "이미지를 불러오지 못했습니다." });
      }
    }
    // Only fetch images near the visible conversation, not every retained page.
    const observer = new IntersectionObserver((entries) => {
      if (!started && entries.some((entry) => entry.isIntersecting)) {
        started = true;
        observer.disconnect();
        void load();
      }
    }, { rootMargin: "160px" });
    observer.observe(container);
    return () => {
      active = false;
      controller.abort();
      observer.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [kind, previewUrl, attachment.size, key, onFailure]);

  if (!kind) return null;
  const fileName = attachment.originalName;
  return (
    <div ref={containerRef} className="mb-3">
      {kind === "image" ? currentImage?.error ? (
        <div className="rounded-md border border-[var(--border)] p-3">
          <p role="alert" className="text-xs leading-5 text-[var(--danger)]">{currentImage.error}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className={`${actionClass} mt-2`}>이미지 다시 불러오기</button>
        </div>
      ) : currentImage?.url ? (
        <button type="button" aria-label={`${fileName} 크게 보기`} onClick={(event) => setOpener(event.currentTarget)} className="flex min-h-24 w-full items-center justify-center overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]">
          {/* Private blob URLs must bypass the Next image optimizer and its cache. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={currentImage.url} alt={fileName} className="max-h-48 w-full object-contain" onError={() => setImage({ key, error: "이미지를 표시하지 못했습니다." })} />
        </button>
      ) : <div role="status" className="flex h-36 items-center justify-center rounded-md border border-[var(--border)] text-xs text-[var(--text-muted)]">이미지 불러오는 중…</div> : (
        <button type="button" aria-label={`${fileName} 미리보기`} onClick={(event) => setOpener(event.currentTarget)} className={actionClass}>PDF 미리보기</button>
      )}

      {opener ? (
        <AppModal label={`${fileName} 미리보기`} onClose={() => setOpener(null)} returnFocusTo={opener} mobileFullscreen className="flex h-[min(80dvh,48rem)] max-w-4xl flex-col text-[var(--foreground)]">
          <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
            <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold" title={fileName}>{fileName}</h2><p className="text-xs text-[var(--text-muted)]">{kind === "image" ? "이미지 미리보기" : "PDF 미리보기"}</p></div>
            <button type="button" aria-label="미리보기 닫기" data-modal-initial-focus onClick={() => setOpener(null)} className={actionClass}>닫기</button>
          </header>
          {kind === "pdf" ? <StaffChatPdfPreview url={previewUrl} fileName={fileName} onFailure={onFailure} /> : (
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[var(--surface-muted)] p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentImage?.url} alt={`${fileName} 확대 이미지`} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] px-3 py-2">
            <p className="text-xs leading-5 text-[var(--text-muted)]">미리보기는 원본을 삭제하지 않습니다.</p>
            <button type="button" disabled={downloadDisabled} className={`${actionClass} shrink-0 disabled:opacity-50`} onClick={() => { setOpener(null); onDownload(); }}>다운로드</button>
          </footer>
        </AppModal>
      ) : null}
    </div>
  );
}
