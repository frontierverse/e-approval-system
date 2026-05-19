"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { FormPendingOverlay } from "@/components/form-pending-overlay";

type ConfirmSubmitButtonProps = ComponentProps<"button"> & {
  message: string;
  pendingLabel?: ReactNode;
};

export function ConfirmSubmitButton({
  children,
  disabled,
  message,
  onClick,
  pendingLabel = "처리 중",
  ...props
}: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <>
      <button
        {...props}
        disabled={disabled || pending}
        onClick={(event) => {
          if (!window.confirm(message)) {
            event.preventDefault();
            return;
          }

          onClick?.(event);
        }}
      >
        {children}
      </button>
      <FormPendingOverlay label={pendingLabel} />
    </>
  );
}
