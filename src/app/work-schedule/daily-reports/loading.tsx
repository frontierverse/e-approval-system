import { PageTitle } from "@/components/page-title";

export default function DailyReportsLoading() {
  return <div aria-busy="true" aria-label="일일 업무보고 불러오는 중" className="space-y-3">
    <PageTitle compact title="일일 업무보고" />
    <div className="grid h-16 grid-cols-4 gap-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="animate-pulse rounded-md bg-[var(--surface-muted)] motion-reduce:animate-none" />)}</div>
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)]">
      <div className="h-12 border-b border-[var(--border)]" />
      {Array.from({ length: 4 }, (_, i) => <div key={i} className="flex h-16 items-center border-b border-[var(--border)] px-3 last:border-0"><div className="h-5 w-3/4 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" /></div>)}
    </div>
  </div>;
}
