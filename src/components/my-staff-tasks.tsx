import Link from "next/link";
import { StaffTaskChecklist } from "@/components/staff-task-checklist";
import type { StaffTaskCounts, StaffTaskItem } from "@/lib/staff-tasks-core";

export function MyStaffTasks({ tasks, counts, today }: {
  tasks: StaffTaskItem[];
  counts: StaffTaskCounts;
  today: string;
}) {
  const pending = tasks.filter((task) => !task.completedAt);
  return (
    <section aria-labelledby="my-staff-tasks-heading" className="min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <header className="flex min-h-12 items-center justify-between gap-2 border-b border-[var(--border)] px-4">
        <h2 id="my-staff-tasks-heading" className="text-sm font-semibold sm:text-base">내 할 일 <span className="ml-1 text-[var(--brand)] tabular-nums">{counts.pending}건</span></h2>
        <Link href="/tasks" aria-label="내 할 일 전체 보기" className="inline-flex min-h-11 items-center rounded-md px-1 text-xs font-semibold text-[var(--brand)]">전체 보기</Link>
      </header>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-xs tabular-nums">
        <span className={counts.overdue ? "font-semibold text-[var(--danger)]" : "text-[var(--text-muted)]"}>기한 초과 {counts.overdue}건</span>
        <span className="text-[var(--text-muted)]">완료 {counts.completed}건</span>
      </div>
      <StaffTaskChecklist tasks={tasks} today={today} collapseCompleted emptyMessage={counts.completed ? "남은 할 일을 모두 완료했습니다." : "배정된 할 일이 없습니다."} />
      {counts.pending > pending.length ? <Link href="/tasks" className="flex min-h-11 items-center justify-center border-t border-[var(--border)] px-4 text-xs font-semibold text-[var(--brand)]">남은 할 일 {counts.pending - pending.length}건 더 보기</Link> : null}
    </section>
  );
}

export function MyStaffTasksSkeleton() {
  return (
    <section aria-label="내 할 일 불러오는 중" aria-busy="true" className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex min-h-12 items-center border-b border-[var(--border)] px-4 text-sm font-semibold">내 할 일</div>
      <div className="h-8 border-b border-[var(--border)] bg-[var(--surface-muted)]" />
      {[0, 1, 2].map((row) => <div key={row} className="flex min-h-16 items-center gap-3 border-b border-[var(--border)] px-4 last:border-b-0"><span className="size-5 rounded bg-[var(--surface-muted)]" /><span className="h-4 w-2/3 rounded bg-[var(--surface-muted)]" /></div>)}
    </section>
  );
}
