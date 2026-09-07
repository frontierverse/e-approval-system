import { PageTitle } from "@/components/page-title";

export default function Loading() {
  return (
    <div role="status" aria-label="직원 할 일 불러오는 중">
      <PageTitle compact title="직원 할 일" action={<div className="h-11 w-24 rounded-md bg-[var(--surface-muted)]" />} />
      <div aria-hidden="true" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {["전체", "미완료", "기한 초과", "완료"].map((label) => <div key={label} className="flex min-h-16 items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3"><span className="text-sm font-semibold text-[var(--foreground)]">{label}</span><span className="h-6 w-8 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" /></div>)}
      </div>
      <div aria-hidden="true" className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
        { ["할 일 목록", "직원별 전체 현황"].map((title) => (
          <div key={title} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <p className="flex min-h-12 items-center border-b border-[var(--border)] px-3 text-sm font-semibold text-[var(--foreground)]">{title}</p>
            {title === "할 일 목록" ? <div className="hidden grid-cols-4 gap-2 border-b border-[var(--border)] p-3 lg:grid">{[0, 1, 2, 3].map((index) => <div key={index} className="h-11 rounded-md bg-[var(--surface-muted)]" />)}</div> : null}
            {[0, 1, 2].map((index) => <div key={index} className="grid min-h-[4.5rem] content-center gap-2 border-b border-[var(--border)] px-3 last:border-b-0"><span className="h-4 w-2/3 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" /><span className="h-3 w-1/2 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" /></div>)}
          </div>
        ))}
      </div>
    </div>
  );
}
