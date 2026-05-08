"use client";

import { useActionState } from "react";
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

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <div>
        <label htmlFor="email" className="text-sm font-semibold text-[#394150]">
          이메일
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue="minjun.kim@company.local"
          autoComplete="email"
          className="mt-2 h-11 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="text-sm font-semibold text-[#394150]"
        >
          비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          defaultValue="password123"
          autoComplete="current-password"
          className="mt-2 h-11 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
        />
      </div>

      {state.error ? (
        <p className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={buttonClass(
          buttonStyles.base,
          buttonStyles.primary,
          "h-11 w-full px-4 text-sm",
        )}
      >
        {pending ? "로그인 중" : "로그인"}
      </button>
    </form>
  );
}
