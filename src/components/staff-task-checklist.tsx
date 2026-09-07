"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteMyStaffTaskAction, setStaffTaskCompletedAction } from "@/app/tasks/actions";
import { AppModal } from "@/components/app-modal";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import type { StaffTaskItem } from "@/lib/staff-tasks-core";
import { getKoreanDateTimeParts } from "@/lib/korean-date";

export function StaffTaskChecklist({
  tasks,
  today,
  emptyMessage = "배정된 할 일이 없습니다.",
  collapseCompleted = false,
}: {
  tasks: StaffTaskItem[];
  today: string;
  emptyMessage?: string;
  collapseCompleted?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const locked = useRef(false);
  const [deleting, setDeleting] = useState<{ task: StaffTaskItem; trigger: HTMLElement } | null>(null);
  const [feedback, setFeedback] = useState<{ error?: string; success?: string }>({});
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(() => new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const focusRequest = useRef<{ id: string; completed: boolean; deleted?: boolean; neighbors: string[] } | null>(null);
  const visibleTasks = collapseCompleted ? tasks.filter((task) => !task.completedAt) : tasks;
  const completedTasks = collapseCompleted ? tasks.filter((task) => task.completedAt) : [];

  useEffect(() => {
    if (feedback.error) errorRef.current?.focus();
  }, [feedback.error]);

  useEffect(() => {
    const request = focusRequest.current;
    if (pending || !feedback.success || !request) return;
    const current = tasks.find((task) => task.id === request.id);
    if (current && (request.deleted ? !current.deletedAt : Boolean(current.completedAt) !== request.completed)) return;
    const checkboxes = Array.from(containerRef.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? [])
      .filter((input) => !input.disabled && !input.closest("details:not([open])") && input.getClientRects().length > 0);
    const candidate = [request.id, ...request.neighbors]
      .map((id) => checkboxes.find((input) => input.dataset.taskId === id))
      .find(Boolean) ?? checkboxes[0];
    (candidate ?? statusRef.current)?.focus({ preventScroll: true });
    if (candidate && document.activeElement !== candidate) statusRef.current?.focus({ preventScroll: true });
    focusRequest.current = null;
  }, [tasks, feedback.success, pending]);

  function updateTask(task: StaffTaskItem, completed: boolean) {
    if (locked.current) return;
    locked.current = true;
    const index = tasks.findIndex((item) => item.id === task.id);
    focusRequest.current = { id: task.id, completed, neighbors: [...tasks.slice(index + 1), ...tasks.slice(0, index).reverse()].map((item) => item.id) };
    setFeedback({});
    startTransition(async () => {
      try {
        const result = await setStaffTaskCompletedAction({
          id: task.id,
          completed,
          version: task.version,
        });
        setFeedback(result);
        if (result.error) router.refresh();
      } catch {
        setFeedback({ error: "저장하지 못했습니다. 연결을 확인한 후 다시 시도해 주세요." });
      } finally {
        locked.current = false;
      }
    });
  }

  function deleteTask() {
    if (!deleting || locked.current) return;
    const task = deleting.task;
    locked.current = true;
    setFeedback({});
    focusRequest.current = { id: task.id, completed: Boolean(task.completedAt), deleted: true, neighbors: tasks.filter(item => item.id !== task.id).map(item => item.id) };
    startTransition(async () => {
      try {
        const result = await deleteMyStaffTaskAction({ id: task.id, version: task.version });
        setDeleting(null);
        setFeedback(result);
        if (result.error) router.refresh();
      } catch {
        setDeleting(null);
        setFeedback({ error: "삭제하지 못했습니다. 연결을 확인하고 다시 시도해 주세요." });
      } finally {
        locked.current = false;
      }
    });
  }

  return (
    <div ref={containerRef} aria-busy={pending}>
      {deleting ? <AppModal label="할 일 삭제 확인" returnFocusTo={deleting.trigger} onClose={() => { if (!pending) setDeleting(null); }} className="max-w-md p-4">
        <h2 className="text-base font-semibold">할 일을 삭제할까요?</h2>
        <p className="mt-3 break-words text-sm font-semibold [overflow-wrap:anywhere]">{deleting.task.title}</p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">내 할 일 목록에서 제외됩니다. 업무 내용과 삭제 이력은 보존되며 관리자도 확인할 수 있습니다.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button data-modal-initial-focus type="button" disabled={pending} onClick={() => setDeleting(null)} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 px-4 text-sm")}>취소</button>
          <button type="button" disabled={pending} onClick={deleteTask} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 px-4 text-sm text-[var(--danger)]")}>{pending ? "삭제 중…" : "삭제"}</button>
        </div>
      </AppModal> : null}
      {visibleTasks.length ? renderList(visibleTasks) : <p className="px-4 py-5 text-sm text-[var(--text-muted)]">{emptyMessage}</p>}
      {completedTasks.length ? (
        <details className="border-t border-[var(--border)]">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-xs font-semibold text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">최근 완료 {completedTasks.length}건 · 펼쳐서 확인 / 완료 취소</summary>
          {renderList(completedTasks)}
        </details>
      ) : null}
      {feedback.error ? <p ref={errorRef} tabIndex={-1} role="alert" className="border-t border-[var(--border)] px-4 py-2 text-sm text-[var(--danger)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">{feedback.error}</p> : null}
      <p ref={statusRef} tabIndex={-1} role="status" className={pending || feedback.success ? "border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]" : "sr-only"}>
        {pending ? "저장 중…" : feedback.success ?? ""}
      </p>
    </div>
  );

  function renderList(items: StaffTaskItem[]) {
    return (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((task) => {
            const completed = Boolean(task.completedAt);
            const overdue = !task.deletedAt && !completed && Boolean(task.dueDate && task.dueDate < today);
            const dueToday = !task.deletedAt && !completed && task.dueDate === today;
            return (
              <li key={task.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-start px-2 py-1 sm:px-3">
                {!task.deletedAt ? <label className="col-start-1 row-start-1 flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--focus-ring)]">
                  <input
                    type="checkbox"
                    data-task-id={task.id}
                    checked={completed}
                    disabled={pending}
                    onChange={(event) => updateTask(task, event.target.checked)}
                    aria-label={`${task.title} ${completed ? "완료 취소" : "완료 처리"}`}
                    className="size-5 cursor-pointer accent-[var(--brand)] disabled:cursor-wait"
                  />
                </label> : null}
                <div className="col-start-2 row-start-1 min-w-0">
                  {task.description || task.meetingTitle ? (
                    <button
                      type="button"
                      aria-label={`${task.title} 업무 상세`}
                      aria-expanded={expandedTasks.has(task.id)}
                      aria-controls={`staff-task-details-${task.id}`}
                      onClick={() => setExpandedTasks((current) => {
                        const next = new Set(current);
                        if (next.has(task.id)) next.delete(task.id); else next.add(task.id);
                        return next;
                      })}
                      className="flex min-h-11 w-full items-center gap-1 rounded-md py-1 pr-1 text-left focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                    >
                      <span className={`min-w-0 break-words text-sm font-semibold [overflow-wrap:anywhere] ${completed ? "text-[var(--text-muted)] line-through" : "text-[var(--foreground)]"}`}>{task.title}</span>
                      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={`size-3 shrink-0 text-[var(--text-muted)] ${expandedTasks.has(task.id) ? "rotate-180" : ""}`}><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  ) : <p className={`flex min-h-11 items-center break-words py-1 pr-1 text-sm font-semibold [overflow-wrap:anywhere] ${completed ? "text-[var(--text-muted)] line-through" : "text-[var(--foreground)]"}`}>{task.title}</p>}
                </div>
                <div className="col-start-3 row-start-1 flex items-center text-xs">
                  <Link href={`/tasks/${task.id}/history`} aria-label={`${task.title} 이력`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-[var(--text-muted)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">이력</Link>
                  {!task.deletedAt ? <button type="button" disabled={pending} aria-label={`${task.title} 삭제`} aria-haspopup="dialog" onClick={(event) => setDeleting({ task, trigger: event.currentTarget })} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-[var(--danger)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-50">삭제</button> : null}
                </div>
                <div className="col-span-2 col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pb-1 text-xs text-[var(--text-muted)]">
                    <span className={`shrink-0 ${overdue ? "font-semibold text-[var(--danger)]" : dueToday ? "font-semibold text-[var(--brand)]" : ""}`}>
                      {task.deletedAt ? "삭제됨" : completed ? "완료" : overdue ? "기한 초과" : dueToday ? "오늘 마감" : "미완료"}
                    </span>
                    {task.dueDate ? <time dateTime={task.dueDate} className="shrink-0 tabular-nums">기한 {task.dueDate}</time> : <span className="shrink-0">기한 없음</span>}
                    {task.meetingTitle ? <span className="min-w-0 flex-1 truncate" title={task.meetingTitle}>{task.meetingTitle}</span> : null}
                    {task.completedAt ? <time dateTime={task.completedAt} className="tabular-nums">{formatCompletionTime(task.completedAt)} 완료</time> : null}
                    {task.deletedAt ? <time dateTime={task.deletedAt} className="tabular-nums">{formatCompletionTime(task.deletedAt)} 삭제</time> : null}
                </div>
                {task.description || task.meetingTitle ? <div id={`staff-task-details-${task.id}`} hidden={!expandedTasks.has(task.id)} className="col-span-2 col-start-2 row-start-3 min-w-0 border-t border-[var(--border)] py-2 text-xs leading-relaxed">
                  {task.meetingTitle ? <p className="break-words text-[var(--text-muted)] [overflow-wrap:anywhere]">회의 · {task.meetingTitle}</p> : null}
                  {task.description ? <p className="whitespace-pre-wrap break-words text-[var(--foreground)] [overflow-wrap:anywhere]">{task.description}</p> : null}
                </div> : null}
              </li>
            );
          })}
        </ul>
    );
  }
}

function formatCompletionTime(value: string) {
  const parts = getKoreanDateTimeParts(value);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day} ${String(parts.hour).padStart(2, "0")}:${parts.minute}`;
}
