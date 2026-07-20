"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AppModal } from "@/components/app-modal";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

type MeetingMinutesPdfPreviewButtonProps = {
  approverIds: string[];
  content: string;
  disabled?: boolean;
  templateId: string;
  title: string;
};

export function MeetingMinutesPdfPreviewButton({
  approverIds,
  content,
  disabled = false,
  templateId,
  title,
}: MeetingMinutesPdfPreviewButtonProps) {
  const modalTitleId = useId();
  const modalDescriptionId = useId();
  const requestRef = useRef<AbortController | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(
    () => () => {
      requestRef.current?.abort();
      revokePreviewUrl(previewUrlRef.current);
    },
    [],
  );

  async function openPreview() {
    requestRef.current?.abort();
    revokePreviewUrl(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setError(null);
    setIsLoading(true);
    setIsOpen(true);

    const controller = new AbortController();
    requestRef.current = controller;

    try {
      const response = await fetch(
        "/api/drafts/meeting-minutes-pdf-preview",
        {
          body: JSON.stringify({
            approverIds,
            content,
            templateId,
            title,
          }),
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          method: "POST",
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new Error(await readPreviewErrorMessage(response));
      }

      const url = URL.createObjectURL(await response.blob());

      if (controller.signal.aborted) {
        revokePreviewUrl(url);
        return;
      }

      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (previewError) {
      if (controller.signal.aborted) {
        return;
      }

      setError(
        previewError instanceof Error
          ? previewError.message
          : "회의록 PDF 미리보기를 생성하지 못했습니다.",
      );
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsLoading(false);
      }
    }
  }

  function closePreview() {
    requestRef.current?.abort();
    requestRef.current = null;
    revokePreviewUrl(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setIsLoading(false);
    setError(null);
    setIsOpen(false);
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || isLoading}
        onClick={openPreview}
        className={buttonClass(
          buttonStyles.base,
          buttonStyles.neutral,
          "h-11 px-4 text-sm",
        )}
      >
        {isLoading ? "PDF 생성 중" : "PDF 미리보기"}
      </button>

      {isOpen ? (
        <AppModal
          className="flex h-[min(90dvh,58rem)] w-[min(96vw,68rem)] max-w-none flex-col"
          describedBy={modalDescriptionId}
          labelledBy={modalTitleId}
          onClose={closePreview}
        >
          <header className="flex shrink-0 flex-col items-stretch gap-3 border-b border-[var(--border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2
                id={modalTitleId}
                className="truncate text-base font-semibold text-[var(--foreground)]"
              >
                회의록 PDF 미리보기
              </h2>
              <p
                id={modalDescriptionId}
                className="mt-0.5 text-xs text-[var(--text-muted)]"
              >
                현재 입력 내용으로 생성되는 제출 전 문서입니다.
              </p>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              {previewUrl ? (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.neutral,
                    "h-11 px-3 text-sm",
                  )}
                >
                  새 창에서 보기
                </a>
              ) : null}
              <button
                type="button"
                data-modal-initial-focus
                onClick={closePreview}
                className={buttonClass(
                  buttonStyles.base,
                  buttonStyles.cancel,
                  "h-11 px-3 text-sm",
                )}
              >
                닫기
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 bg-[var(--surface-muted)]">
            {isLoading ? (
              <div
                aria-live="polite"
                className="grid h-full place-items-center p-6 text-sm text-[var(--text-muted)]"
              >
                현재 입력 내용으로 PDF를 생성하는 중입니다.
              </div>
            ) : error ? (
              <div
                role="alert"
                className="grid h-full place-items-center p-6 text-center"
              >
                <div className="max-w-md">
                  <p className="text-sm font-semibold text-[var(--danger)]">
                    {error}
                  </p>
                  <button
                    type="button"
                    onClick={openPreview}
                    className={buttonClass(
                      buttonStyles.base,
                      buttonStyles.neutral,
                      "mt-3 h-11 px-4 text-sm",
                    )}
                  >
                    다시 시도
                  </button>
                </div>
              </div>
            ) : previewUrl ? (
              <iframe
                className="h-full w-full border-0 bg-white"
                src={previewUrl}
                title="현재 작성 중인 회의록 PDF 미리보기"
              />
            ) : null}
          </div>
        </AppModal>
      ) : null}
    </>
  );
}

async function readPreviewErrorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;

  return typeof body?.error === "string" && body.error.trim()
    ? body.error
    : "회의록 PDF 미리보기를 생성하지 못했습니다.";
}

function revokePreviewUrl(url: string | null) {
  if (url) {
    URL.revokeObjectURL(url);
  }
}
