import { PageTitle } from "@/components/page-title";

export default function WorkLogLoading() {
  return (
    <>
      <PageTitle
        compact
        title="업무일지"
        description="날짜별 업무를 기록하고 최근 1년의 작성 흐름을 확인합니다."
      />

      <div
        aria-label="업무일지 불러오는 중"
        aria-busy="true"
        className="space-y-4"
      >
        <section className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
            <div className="space-y-2">
              <div className="h-5 w-32 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
              <div className="h-4 w-16 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
            </div>
            <div className="h-4 w-32 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
          </div>
          <div className="px-4 py-3 sm:px-5">
            <div className="h-[7rem] animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
          </div>
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(20rem,0.9fr)_minmax(0,1.1fr)]">
          <section className="rounded-md border border-[var(--border)] bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-4 py-3 sm:px-5">
              <div className="h-5 w-28 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
              <div className="mt-2 h-4 w-64 max-w-full animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
                <div className="h-16 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
                <div className="h-16 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
              </div>
              <div className="h-36 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
              <div className="h-11 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-4 py-3 sm:px-5">
              <div className="h-5 w-28 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
              <div className="mt-2 h-4 w-36 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
            </div>
            <div className="divide-y divide-[var(--border)]">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="min-h-[4.5rem] px-4 py-3 sm:px-5">
                  <div className="h-4 w-24 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
                  <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-[var(--surface-muted)] motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
