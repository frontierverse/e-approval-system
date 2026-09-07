"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PageTitle } from "@/components/page-title";
import { StaffTaskEditorModal } from "@/components/staff-task-editor-modal";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { formatDate, formatDateTime } from "@/lib/mock-data";
import type {
  StaffTaskAssignee,
  StaffTaskEmployeeSummary,
  StaffTaskItem,
  StaffTaskPage,
} from "@/lib/staff-tasks-core";

export type StaffTaskAdminFilters = {
  status: "all" | "pending" | "completed" | "overdue" | "deleted";
  assigneeId: string;
  query: string;
};

const fieldClass = "h-11 w-full min-w-0 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus-ring)] focus:ring-2 focus:ring-[var(--focus-ring)]";

export function AdminStaffTaskBoard({
  data,
  assignees,
  employees,
  filters,
  referenceDate,
}: {
  data: StaffTaskPage;
  assignees: StaffTaskAssignee[];
  employees: StaffTaskEmployeeSummary[];
  filters: StaffTaskAdminFilters;
  referenceDate: string;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [editor, setEditor] = useState<{
    task: StaffTaskItem | null;
    requestId: string;
    trigger: HTMLElement;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const hasFilters = Boolean(filters.assigneeId || filters.query || filters.status !== "all");
  const filterAssignees = [...assignees];
  for (const employee of employees) {
    if (!filterAssignees.some((assignee) => assignee.id === employee.assigneeId)) {
      filterAssignees.push({
        id: employee.assigneeId,
        name: employee.assigneeName,
        departmentName: employee.departmentName,
      });
    }
  }

  const metrics = [
    { label: "전체", value: data.counts.pending + data.counts.completed, status: "all" as const },
    { label: "미완료", value: data.counts.pending, status: "pending" as const },
    { label: "기한 초과", value: data.counts.overdue, status: "overdue" as const },
    { label: "완료", value: data.counts.completed, status: "completed" as const },
  ];

  return (
    <>
      <PageTitle
        compact
        title="직원 할 일"
        action={
          <div className="flex gap-2">
          <button
            type="button"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={refreshing}
            aria-label="직원 할 일 최신 상태 새로고침"
            className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 px-2 text-sm")}
          >
            {refreshing ? "확인 중…" : "새로고침"}
          </button>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={(event) => {
              setMessage("");
              setEditor({ task: null, requestId: crypto.randomUUID(), trigger: event.currentTarget });
            }}
            className={buttonClass(buttonStyles.base, buttonStyles.create, "min-h-11 px-3 text-sm")}
          >
            할 일 등록
          </button>
          </div>
        }
      />

      {message ? <p role="status" className="mb-3 text-sm text-[var(--foreground)]">{message}</p> : null}

      <nav aria-label="업무 상태별 현황" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map((metric) => (
          <Link
            key={metric.status}
            href={taskHref({ ...filters, status: metric.status })}
            aria-current={filters.status === metric.status ? "page" : undefined}
            className={`flex min-h-16 items-center justify-between gap-2 rounded-lg border bg-[var(--surface)] px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${filters.status === metric.status ? "border-[var(--focus-ring)]" : "border-[var(--border)] hover:bg-[var(--surface-hover)]"}`}
          >
            <span className="text-sm font-semibold text-[var(--foreground)]">{metric.label}</span>
            <span className={`text-2xl font-semibold tabular-nums ${metric.status === "overdue" && metric.value > 0 ? "text-[var(--danger)]" : "text-[var(--foreground)]"}`}>
              {metric.value.toLocaleString("ko-KR")}
              <span className="sr-only">건</span>
            </span>
          </Link>
        ))}
      </nav>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
        <section aria-labelledby="staff-task-list-title" className="min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex min-h-12 items-center justify-between gap-2 border-b border-[var(--border)] px-3 sm:px-4">
            <h2 id="staff-task-list-title" className="text-sm font-semibold text-[var(--foreground)]">
              할 일 목록 <span className="ml-1 text-[var(--text-muted)] tabular-nums">{data.total.toLocaleString("ko-KR")}건</span>
            </h2>
            <button
              type="button"
              aria-expanded={filtersOpen}
              aria-controls="staff-task-filters"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 px-3 text-xs lg:hidden")}
            >
              {hasFilters ? "필터 적용됨" : "필터"}
            </button>
            <Link href={taskHref({ ...filters, status: "deleted" })} className="inline-flex min-h-11 items-center rounded-md px-2 text-xs text-[var(--brand)] underline underline-offset-4">삭제됨 {data.counts.deleted}건</Link>
          </div>

          <form
            id="staff-task-filters"
            key={`${filters.assigneeId}:${filters.status}:${filters.query}`}
            action="/admin/tasks"
            method="get"
            aria-label="직원 할 일 필터"
            className={`${filtersOpen ? "grid" : "hidden"} grid-cols-2 gap-2 border-b border-[var(--border)] p-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto]`}
          >
            <label className="min-w-0">
              <span className="sr-only">담당 직원</span>
              <select name="assigneeId" defaultValue={filters.assigneeId} className={fieldClass}>
                <option value="">전체 직원</option>
                {filterAssignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>{assignee.name} · {assignee.departmentName}</option>
                ))}
              </select>
            </label>
            <label className="min-w-0">
              <span className="sr-only">완료 상태</span>
              <select name="status" defaultValue={filters.status} className={fieldClass}>
                <option value="all">전체 상태</option>
                <option value="pending">미완료</option>
                <option value="overdue">기한 초과</option>
                <option value="completed">완료</option>
                <option value="deleted">삭제됨</option>
              </select>
            </label>
            <label className="min-w-0">
              <span className="sr-only">할 일·회의 검색</span>
              <input type="search" name="query" maxLength={100} defaultValue={filters.query} placeholder="할 일·회의 검색" className={fieldClass} />
            </label>
            <button type="submit" className={buttonClass(buttonStyles.base, buttonStyles.filter, "min-h-11 px-3 text-sm")}>검색</button>
          </form>

          {hasFilters ? (
            <div className="flex min-h-11 items-center justify-between gap-2 border-b border-[var(--border)] px-3 text-xs sm:px-4">
              <p className="min-w-0 truncate text-[var(--text-muted)]">
                {filterAssignees.find((assignee) => assignee.id === filters.assigneeId)?.name ?? (filters.assigneeId ? "선택 직원" : "전체 직원")}
                {` · ${filters.status === "deleted" ? "삭제됨" : metrics.find((metric) => metric.status === filters.status)?.label}`}
                {filters.query ? ` · “${filters.query}”` : ""}
              </p>
              <Link href="/admin/tasks" className={buttonClass(buttonStyles.base, "min-h-11 shrink-0 px-2 text-[var(--foreground)] underline underline-offset-4")}>초기화</Link>
            </div>
          ) : null}

          {data.tasks.length > 0 ? (
            <ul className="divide-y divide-[var(--border)]">
              {data.tasks.map((task) => {
                const overdue = !task.deletedAt && !task.completedAt && Boolean(task.dueDate && task.dueDate < referenceDate);
                return (
                  <li key={task.id} className="flex items-center">
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      disabled={Boolean(task.deletedAt)}
                      aria-label={`${task.title} · ${task.assigneeName} · ${task.deletedAt ? "삭제됨" : task.completedAt ? "완료" : overdue ? "기한 초과" : "미완료"} 상세 및 수정`}
                      onClick={(event) => {
                        setMessage("");
                        setEditor({ task, requestId: "", trigger: event.currentTarget });
                      }}
                      className="flex min-h-[4.5rem] min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] sm:px-4"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="line-clamp-2 min-w-0 text-sm font-semibold break-words text-[var(--foreground)] [overflow-wrap:anywhere]">{task.title}</span>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${overdue ? "bg-[var(--surface-muted)] text-[var(--danger)]" : "bg-[var(--surface-muted)] text-[var(--foreground)]"}`}>
                            {task.deletedAt ? "삭제됨" : task.completedAt ? "완료" : overdue ? "기한 초과" : "미완료"}
                          </span>
                        </span>
                        <span className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)]">
                          <span className="break-words">{task.assigneeName}<span className="hidden sm:inline"> · {task.departmentName}</span></span>
                          <span className={`tabular-nums ${overdue ? "font-semibold text-[var(--danger)]" : ""}`}>{task.dueDate ? `기한 ${formatDate(task.dueDate)}` : "기한 없음"}</span>
                          {task.completedAt ? <span className="tabular-nums">완료 {formatDateTime(task.completedAt)}</span> : null}
                          {task.meetingTitle ? <span className="max-w-full truncate">회의 · {task.meetingTitle}</span> : null}
                        </span>
                      </span>
                      <span aria-hidden="true" className="shrink-0 text-xs text-[var(--text-muted)]">{task.deletedAt ? "" : "수정"}</span>
                    </button>
                    <Link href={`/tasks/${task.id}/history`} aria-label={`${task.title} 이력`} className="mr-2 inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-xs text-[var(--brand)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">이력</Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-6">
              <p className="text-sm font-semibold text-[var(--foreground)]">{hasFilters ? "조건에 맞는 할 일이 없습니다." : "등록된 할 일이 없습니다."}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{hasFilters ? "직원·상태·검색 조건을 변경해 주세요." : "할 일을 등록하면 담당 직원의 메인페이지에 표시됩니다."}</p>
            </div>
          )}

          {data.totalPages > 1 ? (
            <nav aria-label="할 일 목록 페이지" className="flex min-h-14 items-center justify-between gap-2 border-t border-[var(--border)] px-3">
              {data.page > 1 ? <Link href={taskHref(filters, data.page - 1)} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 px-3 text-sm")}>이전</Link> : <span className="px-3 text-sm text-[var(--text-muted)]">이전</span>}
              <span className="text-sm text-[var(--text-muted)] tabular-nums">{data.page} / {data.totalPages} 페이지</span>
              {data.page < data.totalPages ? <Link href={taskHref(filters, data.page + 1)} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 px-3 text-sm")}>다음</Link> : <span className="px-3 text-sm text-[var(--text-muted)]">다음</span>}
            </nav>
          ) : null}
        </section>

        <aside aria-labelledby="staff-task-progress-title" className="min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex min-h-12 items-center justify-between gap-2 border-b border-[var(--border)] px-3">
            <h2 id="staff-task-progress-title" className="text-sm font-semibold text-[var(--foreground)]">직원별 전체 현황</h2>
            <span className="text-xs text-[var(--text-muted)] tabular-nums">{employees.length}명</span>
          </div>
          {employees.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {employees.map((employee) => (
                <li key={employee.assigneeId}>
                  <Link
                    href={taskHref({ status: "all", assigneeId: employee.assigneeId, query: "" })}
                    aria-label={`${employee.assigneeName} 할 일 보기, 미완료 ${employee.pending}건, 완료 ${employee.completed}건, 기한 초과 ${employee.overdue}건`}
                    className="block min-h-16 px-3 py-2.5 hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-[var(--foreground)]">{employee.assigneeName}</span>
                      <span className="truncate text-xs text-[var(--text-muted)]">{employee.departmentName}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)] tabular-nums">
                      <span>미완료 {employee.pending}</span>
                      <span>완료 {employee.completed}</span>
                      {employee.overdue > 0 ? <span className="font-semibold text-[var(--danger)]">기한 초과 {employee.overdue}</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="px-3 py-5 text-sm text-[var(--text-muted)]">등록된 직원이 없습니다.</p>}
        </aside>
      </div>

      {editor ? (
        <StaffTaskEditorModal
          task={editor.task}
          assignees={assignees}
          requestId={editor.requestId}
          returnFocusTo={editor.trigger}
          onClose={() => setEditor(null)}
          onReload={() => {
            setEditor(null);
            startRefresh(() => router.refresh());
          }}
          onSaved={(success) => {
            setMessage(success);
            setEditor(null);
          }}
        />
      ) : null}
    </>
  );
}

function taskHref(filters: StaffTaskAdminFilters, page = 1) {
  const params = new URLSearchParams();
  if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.query) params.set("query", filters.query);
  if (page > 1) params.set("page", String(page));
  return `/admin/tasks${params.size ? `?${params.toString()}` : ""}`;
}
