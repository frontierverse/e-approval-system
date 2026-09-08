"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppModal } from "@/components/app-modal";
import { StaffChatPdfPreview as PdfFilePreview } from "@/components/staff-chat-pdf-preview";
import { getAttachmentPreviewKind } from "@/lib/attachment-preview";
import { formatFileSize, getAttachmentFileDisplay } from "@/lib/file-display";
import { formatWorkLogDateLabel, type WorkLogEntry, type WorkLogMeetingAttachment } from "@/lib/work-log-core";

const actionClass = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-muted)] disabled:opacity-50";
const ignorePreviewFailure = () => {};

export function WorkLogMeetingFilesPanel({
  entry,
  headingLevel = "h2",
  canNavigateToDocument,
}: {
  entry: WorkLogEntry | null;
  headingLevel?: "h2" | "h3";
  canNavigateToDocument?: () => boolean;
}) {
  const Heading = headingLevel;
  const documents = entry?.meetingDocuments ?? [];
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<WorkLogMeetingAttachment | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const downloadRef = useRef<AbortController | null>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => () => downloadRef.current?.abort(), []);
  useEffect(() => { if (feedback?.error) feedbackRef.current?.focus(); }, [feedback]);

  async function download(attachment: WorkLogMeetingAttachment) {
    if (downloadRef.current) return;
    const controller = new AbortController();
    downloadRef.current = controller;
    setDownloadingId(attachment.id);
    setFeedback(null);
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(`/attachments/${encodeURIComponent(attachment.id)}`, {
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
      });
      assertFileResponse(response);
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.originalName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setFeedback({ error: false, text: `${attachment.originalName} 다운로드를 시작했습니다.` });
    } catch (error) {
      setFeedback({ error: true, text: controller.signal.aborted
        ? "파일을 불러오는 데 시간이 오래 걸립니다. 다시 시도해 주세요."
        : error instanceof Error ? error.message : "파일을 다운로드하지 못했습니다. 다시 시도해 주세요." });
    } finally {
      window.clearTimeout(timeout);
      downloadRef.current = null;
      setDownloadingId(null);
    }
  }

  if (!entry || !documents.length) return null;
  const fileCount = documents.reduce((count, document) => count + document.attachments.length, 0);
  const visible = expanded ? documents : documents.slice(0, 5);

  return (
    <section aria-label="회의록 파일 자동 기록" className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <Heading className="text-sm font-semibold text-[var(--foreground)]">회의록 파일 <span className="tabular-nums">{fileCount}개</span></Heading>
          <p className="mt-1 text-xs tabular-nums text-[var(--text-muted)]">{formatWorkLogDateLabel(entry.workDate)}</p>
        </div>
        <span className="rounded-md bg-[var(--brand-soft)] px-2 py-1 text-xs font-semibold text-[var(--brand)] dark:text-[var(--foreground)]">자동 첨부</span>
      </header>
      <ul className="divide-y divide-[var(--border)]">
        {visible.map((document) => (
          <li key={document.id} className="min-w-0 px-4 py-2">
            <Link
              href={`/documents/${encodeURIComponent(document.id)}`}
              onNavigate={(event) => { if (canNavigateToDocument?.() === false) event.preventDefault(); }}
              className="flex min-h-11 min-w-0 items-center gap-2 rounded-sm text-sm font-semibold text-[var(--foreground)] hover:underline"
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">{document.title}</span>
              <span className="shrink-0 text-xs font-normal text-[var(--text-muted)]">원문 보기</span>
            </Link>
            <ul className="divide-y divide-[var(--border)]">
              {document.attachments.map((attachment) => (
                <li key={attachment.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="text-sm font-medium leading-5 text-[var(--foreground)] [overflow-wrap:anywhere]">{attachment.originalName}</p>
                    <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-[var(--text-muted)]">
                      <span>{getAttachmentFileDisplay(attachment.originalName).kindLabel}</span>
                      <span>{formatFileSize(attachment.size)}</span>
                      {attachment.isSigned ? <span>서명본</span> : null}
                    </p>
                  </div>
                  <div className="ml-auto flex shrink-0 gap-2">
                    {getAttachmentPreviewKind(attachment.originalName, attachment.mimeType) ? (
                      <button type="button" className={actionClass} aria-label={`${attachment.originalName} 미리보기`} onClick={() => setPreview(attachment)}>미리보기</button>
                    ) : null}
                    <button type="button" className={actionClass} aria-label={`${attachment.originalName} 다운로드`} disabled={Boolean(downloadingId)} onClick={() => void download(attachment)}>
                      {downloadingId === attachment.id ? "다운로드 중" : "다운로드"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <footer className="border-t border-[var(--border)] px-4 py-2">
        {documents.length > 5 ? <button type="button" aria-expanded={expanded} className={`${actionClass} mb-1`} onClick={() => setExpanded((value) => !value)}>{expanded ? "접기" : `회의록 ${documents.length}건 모두 보기`}</button> : null}
        <p className="text-xs leading-5 text-[var(--text-muted)]">결재 완료된 회의록을 회의 날짜에 자동으로 연결합니다.</p>
        {feedback ? <p ref={feedbackRef} role={feedback.error ? "alert" : "status"} tabIndex={feedback.error ? -1 : undefined} className={`mt-1 text-sm leading-5 [overflow-wrap:anywhere] ${feedback.error ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>{feedback.text}</p> : null}
      </footer>
      {preview ? (
        <AppModal label={`${preview.originalName} 미리보기`} mobileFullscreen className="flex h-dvh max-w-4xl flex-col sm:h-[min(88dvh,56rem)]" onClose={() => setPreview(null)}>
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <p className="min-w-0 flex-1 text-sm font-semibold [overflow-wrap:anywhere]">{preview.originalName}</p>
            <button type="button" aria-label="미리보기 닫기" className={actionClass} onClick={() => setPreview(null)}>닫기</button>
          </header>
          {getAttachmentPreviewKind(preview.originalName, preview.mimeType) === "pdf" ? (
            <PdfFilePreview url={`/attachments/${encodeURIComponent(preview.id)}/preview`} fileName={preview.originalName} onFailure={ignorePreviewFailure} />
          ) : <MeetingImagePreview key={preview.id} attachment={preview} />}
        </AppModal>
      ) : null}
    </section>
  );
}

function MeetingImagePreview({ attachment }: { attachment: WorkLogMeetingAttachment }) {
  const [attempt, setAttempt] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    void (async () => {
      try {
        const response = await fetch(`/attachments/${encodeURIComponent(attachment.id)}/preview`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        assertFileResponse(response);
        const blob = await response.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (cause) {
        if (active) setError(cause instanceof Error && !controller.signal.aborted ? cause.message : "이미지를 불러오지 못했습니다. 다시 시도해 주세요.");
      } finally { window.clearTimeout(timeout); }
    })();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment.id, attempt]);
  return <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface-muted)] p-3">
    {error ? <div className="space-y-2"><p role="alert" className="text-sm text-[var(--danger)]">{error}</p><button type="button" className={actionClass} onClick={() => { setError(""); setUrl(null); setAttempt((value) => value + 1); }}>다시 시도</button></div>
      // The preview uses a private, short-lived object URL from an authorized file request.
      // eslint-disable-next-line @next/next/no-img-element
      : url ? <img src={url} alt={`${attachment.originalName} 미리보기`} className="mx-auto max-h-full max-w-full object-contain" onError={() => setError("이미지를 표시하지 못했습니다. 다시 시도해 주세요.")} />
      : <p role="status" className="text-sm text-[var(--text-muted)]">이미지 불러오는 중…</p>}
  </div>;
}

function assertFileResponse(response: Response) {
  if (response.redirected || response.status === 401) throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
  if (response.status === 403 || response.status === 404) throw new Error("파일이 삭제되었거나 열람 권한이 없습니다. 업무일지를 새로고침해 주세요.");
  if (!response.ok) throw new Error("파일을 불러오지 못했습니다. 다시 시도해 주세요.");
}
