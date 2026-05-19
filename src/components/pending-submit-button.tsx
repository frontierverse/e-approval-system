"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { FormPendingOverlay } from "@/components/form-pending-overlay";

type PendingSubmitButtonProps = ComponentProps<"button"> & {
  pendingLabel?: ReactNode;
};

export function PendingSubmitButton({
  children,
  disabled,
  pendingLabel = "처리 중",
  ...props
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <>
      <button {...props} disabled={disabled || pending}>
        {children}
      </button>
      <FormPendingOverlay label={pendingLabel} />
    </>
  );
}
