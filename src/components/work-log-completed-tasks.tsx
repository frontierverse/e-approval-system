"use client";

import Link from "next/link";
import { useState } from "react";
import { formatWorkLogDateLabel, type WorkLogEntry } from "@/lib/work-log-core";

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function WorkLogCompletedTaskPanel({
  entry,
  headingLevel = "h2",
  canNavigateToTask,
}: {
  entry: WorkLogEntry | null;
  headingLevel?: "h2" | "h3";
  canNavigateToTask?: () => boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const Heading = headingLevel;
  const tasks = entry?.completedTasks ?? [];
  if (!entry || !tasks.length) return null;
  const visible = expanded ? tasks : tasks.slice(0, 5);
  return (
    <section aria-label="완료한 할 일 자동 기록" className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <Heading className="text-sm font-semibold text-[var(--foreground)]">
            완료한 할 일 <span className="tabular-nums">{tasks.length}건</span>
          </Heading>
          <p className="mt-1 text-xs tabular-nums text-[var(--text-muted)]">{formatWorkLogDateLabel(entry.workDate)}</p>
        </div>
        <span className="rounded-md bg-[var(--brand-soft)] px-2 py-1 text-xs font-semibold text-[var(--brand)] dark:text-[var(--foreground)]">자동 기록</span>
      </header>
      <ul className="divide-y divide-[var(--border)]">
        {visible.map((task) => <li key={task.id} className="px-4 py-2">
          <Link
            href={`/tasks/${encodeURIComponent(task.id)}/history`}
            onNavigate={(event) => { if (canNavigateToTask?.() === false) event.preventDefault(); }}
            className="flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-sm text-sm font-medium text-[var(--foreground)] hover:text-[var(--brand)] dark:hover:text-[var(--foreground)]"
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">{task.title}</span>
            <time dateTime={task.completedAt} className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{timeFormatter.format(new Date(task.completedAt))} 완료</time>
          </Link>
          {task.meetingTitle ? <p className="text-xs leading-5 text-[var(--text-muted)] [overflow-wrap:anywhere]">{task.meetingTitle}</p> : null}
          {task.description ? <p className="whitespace-pre-wrap text-sm leading-5 text-[var(--text-muted)] [overflow-wrap:anywhere]">{task.description}</p> : null}
        </li>)}
      </ul>
      <footer className="border-t border-[var(--border)] px-4 py-2">
        {tasks.length > 5 ? (
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="mb-1 min-h-11 rounded-md px-2 text-sm font-semibold text-[var(--brand)] dark:text-[var(--foreground)]">
            {expanded ? "접기" : `완료한 할 일 ${tasks.length}건 모두 보기`}
          </button>
        ) : null}
        <p className="text-xs leading-5 text-[var(--text-muted)]">완료 체크한 날짜에 자동 반영됩니다. 완료를 취소하거나 할 일을 삭제하면 자동 기록에서도 제외됩니다.</p>
      </footer>
    </section>
  );
}

export function hasManualWorkLog(entry: WorkLogEntry | null) {
  return !!entry && entry.manualLogId !== null;
}

export function getManualWorkLogUpdatedAt(entry: WorkLogEntry | null) {
  return hasManualWorkLog(entry) ? entry!.manualUpdatedAt ?? entry!.updatedAt : "";
}
