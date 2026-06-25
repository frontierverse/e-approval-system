"use client";

import { useId, useState, type ReactNode } from "react";
import { AppModal } from "@/components/app-modal";
import { DatePickerInput } from "@/components/date-picker-input";

export type AdminFormMessageState = {
  success?: string;
  error?: string;
};

export function TextField({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  description,
  min,
  max,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
  placeholder?: string;
  description?: string;
  min?: number;
  max?: number;
}) {
  const descriptionId = useId();

  return (
    <label className="block min-w-0">
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs font-semibold text-[#697386]">{label}</span>
        {description ? (
          <span id={descriptionId} className="text-xs text-[#9aa4b2]">
            {description}
          </span>
        ) : null}
      </span>
      {type === "date" ? (
        <DatePickerInput
          name={name}
          defaultValue={defaultValue ?? ""}
          placeholder={placeholder}
          min={typeof min === "number" ? String(min) : undefined}
          max={typeof max === "number" ? String(max) : undefined}
          aria-describedby={description ? descriptionId : undefined}
          className="mt-2 h-10 w-full min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
        />
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue ?? ""}
          placeholder={placeholder}
          min={min}
          max={max}
          aria-describedby={description ? descriptionId : undefined}
          className="mt-2 h-10 w-full min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
        />
      )}
    </label>
  );
}

export function TextareaField({
  label,
  name,
  defaultValue,
  placeholder,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-semibold text-[#697386]">{label}</span>
      <textarea
        data-modal-plain-body="true"
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        rows={rows}
        className="mt-2 w-full min-w-0 resize-y rounded-md border border-[#cfd6e3] bg-white px-3 py-2 text-sm leading-6 outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
      />
    </label>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: {
    value: string;
    label: string;
    disabled?: boolean;
  }[];
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-semibold text-[#697386]">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? options[0]?.value ?? ""}
        className="mt-2 h-10 w-full min-w-0 cursor-pointer rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition disabled:cursor-not-allowed focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
      >
        {options.map((option) => (
          <option
            key={option.value || "empty"}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FormMessage({ state }: { state: AdminFormMessageState }) {
  if (state.error) {
    return (
      <p className="mt-3 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
        {state.error}
      </p>
    );
  }

  if (state.success) {
    return (
      <p className="mt-3 rounded-md border border-[#bddfc9] bg-[#e8f5ed] px-3 py-2 text-sm text-[#22633a]">
        {state.success}
      </p>
    );
  }

  return null;
}

export function AdminEditModal({
  title,
  description,
  trigger,
  triggerClassName,
  dialogClassName,
  children,
}: {
  title: string;
  description?: string;
  trigger: ReactNode;
  triggerClassName?: string;
  dialogClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "block w-full cursor-pointer px-5 py-4 text-left transition hover:bg-[#fbfcfd] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#196b69]"
        }
      >
        {trigger}
      </button>

      {open ? (
        <AppModal
          className={dialogClassName ?? "max-w-3xl"}
          describedBy={description ? descriptionId : undefined}
          labelledBy={titleId}
          onClose={() => setOpen(false)}
        >
          <div className="max-h-[calc(100vh-3rem)] overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#eef1f5] bg-white px-6 py-5">
              <div>
                <p className="text-xs font-semibold text-[#697386]">편집</p>
                <h2
                  id={titleId}
                  className="mt-2 break-words text-2xl font-semibold leading-tight text-[#16181d]"
                >
                  {title}
                </h2>
                {description ? (
                  <p id={descriptionId} className="mt-1 text-sm text-[#697386]">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
              >
                닫기
              </button>
            </div>
            <div className="px-6 py-5">{children}</div>
          </div>
        </AppModal>
      ) : null}
    </>
  );
}
