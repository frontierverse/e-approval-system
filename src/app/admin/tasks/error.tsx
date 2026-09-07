"use client";

import { PageTitle } from "@/components/page-title";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <>
      <PageTitle compact title="직원 할 일" />
      <section role="alert" className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--danger)]">할 일을 불러오지 못했습니다.</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 알려 주세요.</p>
        <button type="button" onClick={reset} className={buttonClass(buttonStyles.base, buttonStyles.primary, "mt-3 min-h-11 px-4 text-sm")}>다시 시도</button>
      </section>
    </>
  );
}
