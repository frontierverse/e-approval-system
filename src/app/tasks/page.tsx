import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageTitle } from "@/components/page-title";
import { StaffTaskChecklist } from "@/components/staff-task-checklist";
import { MyStaffTasksSkeleton } from "@/components/my-staff-tasks";
import { getMyStaffTasks } from "@/lib/staff-tasks";
import { getKoreanDateValue } from "@/lib/document-archive-policy";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { normalizeStaffTaskStatus, staffTaskStatusOptions } from "@/lib/staff-tasks-core";

export const metadata: Metadata = { title: "내 할 일" };
type Params = { page?: string; status?: string };

export default function TasksPage({ searchParams }: { searchParams: Promise<Params> }) {
  return (
    <>
      <PageTitle title="내 할 일" description="완료한 업무에 체크해 주세요." compact action={<Link href="/" className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 px-3 text-sm")}>오늘의 업무</Link>} />
      <Suspense fallback={<MyStaffTasksSkeleton />}><TasksContent searchParams={searchParams} /></Suspense>
    </>
  );
}

async function TasksContent({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const status = normalizeStaffTaskStatus(params.status);
  const data = await getMyStaffTasks({ page: Number(params.page) || 1, status });
  return (
    <section aria-label="내 할 일 목록" className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-[var(--border)] px-4 py-3 text-sm tabular-nums">
        <span className="font-semibold">미완료 {data.counts.pending}건</span>
        <span className={data.counts.overdue ? "font-semibold text-[var(--danger)]" : "text-[var(--text-muted)]"}>기한 초과 {data.counts.overdue}건</span>
        <span className="text-[var(--text-muted)]">완료 {data.counts.completed}건</span>
      </div>
      <nav aria-label="할 일 상태 필터" className="flex flex-wrap gap-1 border-b border-[var(--border)] p-2">
        {staffTaskStatusOptions.map((item) => <Link key={item.value} href={`/tasks?status=${item.value}`} aria-current={item.value === status ? "page" : undefined} className={buttonClass(buttonStyles.base, item.value === status ? buttonStyles.primary : buttonStyles.neutral, "min-h-11 px-3 text-sm")}>{item.label}</Link>)}
      </nav>
      <StaffTaskChecklist tasks={data.tasks} today={getKoreanDateValue()} emptyMessage="선택한 상태의 할 일이 없습니다." />
      <nav aria-label="할 일 페이지" className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-2 text-xs">
        <span className="tabular-nums">{data.total}건 · {data.page} / {data.totalPages}페이지</span>
        <div className="flex gap-2">
          {data.page > 1 ? <Link href={`/tasks?status=${status}&page=${data.page - 1}`} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 px-3")}>이전</Link> : null}
          {data.page < data.totalPages ? <Link href={`/tasks?status=${status}&page=${data.page + 1}`} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 px-3")}>다음</Link> : null}
        </div>
      </nav>
    </section>
  );
}
