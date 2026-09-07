import { PageTitle } from "@/components/page-title";

export default function StaffTaskHistoryLoading() {
  return <>
    <PageTitle compact title="할 일 이력" />
    <section aria-label="할 일 이력 불러오는 중" aria-busy="true" className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] p-4"><div className="h-5 w-2/3 rounded bg-[var(--surface-muted)]" /><div className="mt-2 h-3 w-1/3 rounded bg-[var(--surface-muted)]" /></div>
      {[0, 1, 2].map(row => <div key={row} className="border-b border-[var(--border)] p-4 last:border-b-0"><div className="h-4 w-2/3 rounded bg-[var(--surface-muted)]" /><div className="mt-2 h-3 w-1/3 rounded bg-[var(--surface-muted)]" /></div>)}
    </section>
  </>;
}
