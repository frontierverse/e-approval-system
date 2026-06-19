"use client";

import type { MouseEvent, InputHTMLAttributes } from "react";

type DatePickerInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function DatePickerInput({
  className = "",
  onClick,
  ...props
}: DatePickerInputProps) {
  function handleClick(event: MouseEvent<HTMLInputElement>) {
    openDatePicker(event.currentTarget);
    onClick?.(event);
  }

  return (
    <input
      {...props}
      type="date"
      onClick={handleClick}
      className={`${className} cursor-pointer`.trim()}
    />
  );
}

function openDatePicker(input: HTMLInputElement) {
  if (input.disabled || input.readOnly) {
    return;
  }

  input.focus();

  try {
    input.showPicker?.();
  } catch {
    // Some browsers only allow showPicker during specific trusted gestures.
  }
}
