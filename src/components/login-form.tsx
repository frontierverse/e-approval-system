"use client";

import { useActionState, useState } from "react";
import { loginAction } from "@/app/login/actions";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

type LoginState = {
  error?: string;
};

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );
  const [showPassword, setShowPassword] = useState(false);
  const errorId = state.error ? "login-error" : undefined;

  return (
    <form
      action={formAction}
      aria-busy={pending || undefined}
      className="mt-8 space-y-5"
    >
      <div>
        <label
          htmlFor="name"
          className="text-sm font-semibold text-[var(--foreground)]"
        >
          이름
        </label>
        <input
          id="name"
          name="name"
          type="text"
          aria-describedby={errorId}
          aria-invalid={state.error ? true : undefined}
          autoComplete="name"
          autoFocus
          disabled={pending}
          placeholder="이름을 입력하세요"
          className="mt-2 h-12 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)] disabled:opacity-60"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="text-sm font-semibold text-[var(--foreground)]"
        >
          비밀번호
        </label>
        <div className="relative mt-2">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            aria-describedby={errorId}
            aria-invalid={state.error ? true : undefined}
            autoComplete="current-password"
            disabled={pending}
            placeholder="비밀번호를 입력하세요"
            className="h-12 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 pr-16 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)] disabled:opacity-60"
          />
          <button
            type="button"
            aria-pressed={showPassword}
            disabled={pending}
            onClick={() => setShowPassword((current) => !current)}
            className="absolute inset-y-1 right-1 rounded-md px-3 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            {showPassword ? "숨기기" : "보기"}
          </button>
        </div>
      </div>

      {state.error ? (
        <p
          id="login-error"
          className="rounded-lg border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2.5 text-sm font-medium text-[#8a1f1f]"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={buttonClass(
          buttonStyles.base,
          buttonStyles.primary,
          "h-12 w-full gap-2 rounded-lg px-4 text-sm shadow-sm",
        )}
      >
        {pending ? (
          <>
            <svg
              aria-hidden="true"
              className="size-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-30"
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="opacity-90"
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="3"
              />
            </svg>
            로그인 중
          </>
        ) : (
          "로그인"
        )}
      </button>
    </form>
  );
}
