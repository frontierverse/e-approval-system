"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type PendingOverlayProps = {
  description?: ReactNode;
  label?: ReactNode;
  show: boolean;
};

export function PendingOverlay({
  description = "문서와 결재 기록을 저장하는 중입니다. 잠시만 기다려주세요.",
  label = "처리 중",
  show,
}: PendingOverlayProps) {
  if (!show) {
    return null;
  }

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-[100] grid place-items-center bg-[#111827]/55 px-5 backdrop-blur-[2px]"
      role="status"
    >
      <div className="w-full max-w-sm rounded-md border border-[#d9dee7] bg-white p-5 text-center shadow-2xl">
        <div
          aria-hidden="true"
          className="mx-auto size-9 animate-spin rounded-full border-4 border-[#d7eceb] border-t-[#196b69]"
        />
        <p className="mt-4 text-base font-semibold text-[#16181d]">{label}</p>
        <p className="mt-2 text-sm leading-6 text-[#697386]">{description}</p>
      </div>
    </div>
  );
}

export function FormPendingOverlay({
  description,
  label,
}: Omit<PendingOverlayProps, "show">) {
  const { pending } = useFormStatus();

  return (
    <PendingOverlay
      description={description}
      label={label}
      show={pending}
    />
  );
}
