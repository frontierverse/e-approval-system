"use client";

import { buttonClass, buttonStyles } from "@/lib/button-styles";

export default function TasksError({ reset }: { reset: () => void }) {
  return <section role="alert" className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><h2 className="text-base font-semibold">할 일을 불러오지 못했습니다.</h2><p className="mt-1 text-sm text-[var(--text-muted)]">잠시 후 다시 시도해 주세요.</p><button type="button" onClick={reset} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "mt-3 min-h-11 px-4 text-sm")}>다시 시도</button></section>;
}
