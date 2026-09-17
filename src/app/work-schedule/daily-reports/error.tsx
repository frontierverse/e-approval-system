"use client";

export default function DailyReportsError({ reset }: { reset: () => void }) {
  return <section role="alert" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
    <h1 className="text-lg font-semibold">업무보고를 불러오지 못했습니다.</h1>
    <p className="mt-2 text-sm text-[var(--text-muted)]">잠시 후 다시 시도해 주세요.</p>
    <button type="button" onClick={reset} className="mt-3 min-h-11 rounded-md bg-[var(--brand)] px-4 text-sm font-semibold text-white">다시 불러오기</button>
  </section>;
}
