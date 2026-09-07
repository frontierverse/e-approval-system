import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/components/page-title";
import { getStaffTaskHistory } from "@/lib/staff-tasks";
import { formatDateTime } from "@/lib/mock-data";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

export const metadata = { title: "할 일 이력" };
const fields = { title: "할 일", description: "상세 내용", meetingTitle: "회의명", assigneeId: "담당자", dueDate: "기한", completedAt: "완료 일시", deletedAt: "삭제 일시" };

export default async function StaffTaskHistoryPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const data = await getStaffTaskHistory(id, Number((await searchParams).page) || 1);
  if (!data) notFound();
  function display(key: string, value: unknown) {
    if (typeof value !== "string" || !value) return "없음";
    if (key === "assigneeId") return data!.assignees.find(person => person.id === value)?.name ?? "이전 담당자";
    return key.endsWith("At") ? formatDateTime(value) : value;
  }
  return <>
    <PageTitle compact title="할 일 이력" action={<Link href={data.isAdmin ? "/admin/tasks" : "/tasks"} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 px-3 text-sm")}>목록으로</Link>} />
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="break-words text-base font-semibold [overflow-wrap:anywhere]">{data.task.title}</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{data.task.assigneeName} · {data.task.deletedAt ? "삭제됨" : data.task.completedAt ? "완료" : "미완료"} · 기록 {data.total}건</p>
        {data.task.description ? <p className="mt-2 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{data.task.description}</p> : null}
      </header>
      <ol className="divide-y divide-[var(--border)]">
        {data.logs.map(log => {
          const meta = log.metadata as Record<string, unknown> | null;
          const before = meta?.before as Record<string, unknown> | undefined;
          const after = meta?.after as Record<string, unknown> | undefined;
          const changes = after ? Object.entries(fields).filter(([key]) => before?.[key] !== after[key]) : [];
          return <li key={log.id} className="px-4 py-3">
            <p className="text-sm font-semibold">{log.message}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{log.actor.name} · <time dateTime={log.createdAt.toISOString()}>{formatDateTime(log.createdAt.toISOString())}</time></p>
            {changes.length ? <details className="mt-1">
              <summary className="flex min-h-11 w-fit cursor-pointer items-center text-xs font-semibold text-[var(--brand)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">변경 내용 {changes.length}개</summary>
              <dl className="space-y-3 rounded-md bg-[var(--surface-muted)] p-3 text-sm">
                {changes.map(([key, label]) => <div key={key}><dt className="font-semibold">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{before ? <span className="block text-[var(--text-muted)]">변경 전: {display(key, before[key])}</span> : null}<span className="block">{before ? "변경 후" : "등록 내용"}: {display(key, after?.[key])}</span></dd></div>)}
              </dl>
            </details> : null}
          </li>;
        })}
      </ol>
      {!data.total ? <p className="p-4 text-sm text-[var(--text-muted)]">저장된 처리 이력이 없습니다.</p> : null}
      <nav aria-label="할 일 이력 페이지" className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-2 text-xs">
        <span>{data.page} / {data.totalPages}페이지</span><div className="flex gap-2">{[data.page - 1, data.page + 1].filter(page => page > 0 && page <= data.totalPages).map(page => <Link key={page} href={`/tasks/${id}/history?page=${page}`} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 px-3")}>{page < data.page ? "이전" : "다음"}</Link>)}</div>
      </nav>
    </section>
  </>;
}
