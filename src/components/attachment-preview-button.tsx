"use client";

import { useState } from "react";
import { AppModal } from "@/components/app-modal";
import { getAttachmentPreviewKind } from "@/lib/attachment-preview";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

type AttachmentPreviewButtonProps = {
  buttonSizeClassName?: string;
  downloadHref?: string;
  fileName: string;
  mimeType?: string | null;
  previewHref: string;
};

export function AttachmentPreviewButton({
  buttonSizeClassName = "h-9 px-3 text-sm",
  downloadHref,
  fileName,
  mimeType,
  previewHref,
}: AttachmentPreviewButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasPreviewError, setHasPreviewError] = useState(false);
  const previewKind = getAttachmentPreviewKind(fileName, mimeType);

  if (!previewKind) {
    return null;
  }

  const previewTitle = `${fileName} 미리보기`;
  const openPreview = () => {
    setHasPreviewError(false);
    setIsOpen(true);
  };

  return (
    <>
      <button
        type="button"
        className={buttonClass(
          buttonStyles.base,
          buttonStyles.neutral,
          buttonSizeClassName,
        )}
        onClick={openPreview}
      >
        미리보기
      </button>

      {isOpen ? (
        <AppModal
          className="flex h-[min(88vh,56rem)] w-[min(94vw,64rem)] max-w-none flex-col"
          label={previewTitle}
          onClose={() => setIsOpen(false)}
        >
          <div
            className="flex min-h-0 flex-1 flex-col"
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e4e9f2] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#16181d]">
                  {fileName}
                </p>
                <p className="text-xs text-[#697386]">첨부파일 미리보기</p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                {downloadHref ? (
                  <a
                    href={downloadHref}
                    className={buttonClass(
                      buttonStyles.base,
                      buttonStyles.neutral,
                      "h-9 px-3 text-sm",
                    )}
                  >
                    다운로드
                  </a>
                ) : null}
                <button
                  type="button"
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.cancel,
                    "h-9 px-3 text-sm",
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  닫기
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 bg-[#f4f6fa]">
              {hasPreviewError ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[#697386]">
                  미리보기를 불러오지 못했습니다.
                </div>
              ) : previewKind === "pdf" ? (
                <iframe
                  className="h-full w-full border-0 bg-white"
                  src={previewHref}
                  title={previewTitle}
                />
              ) : (
                <div className="flex h-full items-center justify-center overflow-auto p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={previewTitle}
                    className="max-h-full max-w-full object-contain"
                    onError={() => setHasPreviewError(true)}
                    src={previewHref}
                  />
                </div>
              )}
            </div>
          </div>
        </AppModal>
      ) : null}
    </>
  );
}
