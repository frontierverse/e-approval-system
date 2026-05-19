"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

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
    <button {...props} disabled={disabled || pending}>
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-3.5 animate-spin rounded-full border-2 border-current/35 border-t-current"
          />
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
