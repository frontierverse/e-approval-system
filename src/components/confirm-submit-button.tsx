"use client";

import type { ComponentProps } from "react";

type ConfirmSubmitButtonProps = ComponentProps<"button"> & {
  message: string;
};

export function ConfirmSubmitButton({
  message,
  onClick,
  ...props
}: ConfirmSubmitButtonProps) {
  return (
    <button
      {...props}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
          return;
        }

        onClick?.(event);
      }}
    />
  );
}
