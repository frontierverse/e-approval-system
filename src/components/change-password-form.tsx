"use client";

import { useActionState } from "react";
import {
  changePasswordAction,
  type ChangePasswordState,
} from "@/app/account/actions";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

const initialState: ChangePasswordState = {};

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <PasswordField
        label="현재 비밀번호"
        name="currentPassword"
        autoComplete="current-password"
        error={state.errors?.currentPassword}
      />
      <PasswordField
        label="새 비밀번호"
        name="newPassword"
        autoComplete="new-password"
        error={state.errors?.newPassword}
      />
      <PasswordField
        label="새 비밀번호 확인"
        name="confirmPassword"
        autoComplete="new-password"
        error={state.errors?.confirmPassword}
      />

      {state.errors?.form ? (
        <p className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
          {state.errors.form}
        </p>
      ) : null}

      {state.success ? (
        <p className="rounded-md border border-[#bddfc9] bg-[#e8f5ed] px-3 py-2 text-sm text-[#22633a]">
          {state.success}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={buttonClass(
          buttonStyles.base,
          buttonStyles.primary,
          "h-11 px-4 text-sm",
        )}
      >
        {pending ? "변경 중" : "비밀번호 변경"}
      </button>
    </form>
  );
}

function PasswordField({
  label,
  name,
  autoComplete,
  error,
}: {
  label: string;
  name: string;
  autoComplete: string;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-sm font-semibold text-[#394150]">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="password"
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className={[
          "mt-2 h-11 w-full rounded-md border bg-white px-3 text-sm outline-none transition focus:ring-2",
          error
            ? "border-[#d92d20] focus:border-[#b42318] focus:ring-[#ffe4e0]"
            : "border-[#cfd6e3] focus:border-[#196b69] focus:ring-[#d7eceb]",
        ].join(" ")}
      />
      {error ? (
        <p id={`${name}-error`} className="mt-2 text-sm text-[#b42318]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
