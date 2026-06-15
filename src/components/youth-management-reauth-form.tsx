"use client";

import { useActionState } from "react";
import {
  verifyYouthManagementAccessAction,
  type YouthManagementAccessState,
} from "@/app/youth/actions";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

const initialState: YouthManagementAccessState = {};

export function YouthManagementReauthForm({ userName }: { userName: string }) {
  const [state, formAction, pending] = useActionState(
    verifyYouthManagementAccessAction,
    initialState,
  );

  return (
    <section className="max-w-xl rounded-md border border-[#d9dee7] bg-white p-5">
      <div>
        <p className="text-xs font-semibold uppercase text-[#697386]">
          재인증 필요
        </p>
        <h2 className="mt-2 text-lg font-semibold text-[#16181d]">
          비밀번호 확인
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#697386]">
          {userName} 계정의 비밀번호를 입력하면 청소년 관리 화면에 접근할 수
          있습니다.
        </p>
      </div>

      <form action={formAction} className="mt-5 space-y-4">
        <div>
          <label
            htmlFor="youth-management-password"
            className="text-sm font-semibold text-[#394150]"
          >
            계정 비밀번호
          </label>
          <input
            id="youth-management-password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
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
            "h-11 px-4 text-sm",
          )}
        >
          {pending ? "확인 중" : "확인"}
        </button>
      </form>
    </section>
  );
}
