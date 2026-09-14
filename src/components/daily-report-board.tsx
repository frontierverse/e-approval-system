"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { PageTitle } from "@/components/page-title";
import {
  dailyReportMainLimit, dailyReportPath, dailyReportYouthLimit,
  type DailyReportEntry, type DailyReportPageData, type DailyReportState,
} from "@/lib/daily-report-core";

type ReportAction = (previous: DailyReportState, form: FormData) => Promise<DailyReportState>;
const panel = "min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface)]";
const control = "min-h-11 min-w-0 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)]";
const button = `${control} inline-flex items-center justify-center gap-1 font-medium hover:bg-[var(--surface-hover)] disabled:opacity-50`;
const primary = "inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--brand)] px-3 text-sm font-semibold text-white hover:bg-[var(--brand-hover)] disabled:opacity-50";
const leaveMessage = "저장하지 않은 업무보고 내용이 있습니다. 이 페이지를 나가면 입력 내용이 사라집니다. 이동할까요?";

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
function statusLabel(entry: { submittedAt: string | null; reviewedAt: string | null } | null) {
  return !entry ? "미작성" : !entry.submittedAt ? "임시저장" : entry.reviewedAt ? "확인 완료" : "제출 · 미확인";
}

export function DailyReportBoard({ data, saveAction, reviewAction }: {
  data: DailyReportPageData; saveAction: ReportAction; reviewAction: ReportAction;
}) {
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const followLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.getAttribute("href")?.startsWith("#")) return;
      if (!window.confirm(leaveMessage)) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", followLink, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", followLink, true); };
  }, [dirty]);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <PageTitle compact title="일일 업무보고" />
      <form action={dailyReportPath} method="get" className="mb-3 flex min-w-0 items-center gap-2" onSubmit={event => {
        if (dirty && !window.confirm(leaveMessage)) event.preventDefault();
      }}>
        <label htmlFor="report-date" className="sr-only">보고 날짜</label>
        <input className={`${control} w-[145px] tabular-nums`} id="report-date" type="date" name="date" defaultValue={data.selectedDate} max={data.today} required />
        <button className={button} type="submit">조회</button>
        {data.selectedDate !== data.today && <Link className={button} href={dailyReportPath}>오늘</Link>}
      </form>
    </div>
    {data.mode === "director" ? <DirectorReports data={data} reviewAction={reviewAction} /> :
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
        <EmployeeReport key={data.selectedDate} data={data} saveAction={saveAction} onDirtyChange={setDirty} />
        <section className={panel} aria-labelledby="report-history-title">
          <h2 id="report-history-title" className="border-b border-[var(--border)] px-3 py-3 text-sm font-semibold">내 보고 보관함</h2>
          {!data.history.length ? <p className="px-3 py-6 text-sm text-[var(--text-muted)]">아직 저장한 보고가 없습니다.</p> :
            <ul className="divide-y divide-[var(--border)]">{data.history.map(entry => <li key={entry.id}>
              <Link href={`${dailyReportPath}?date=${entry.workDate}&page=${data.historyPage}`} aria-current={entry.workDate === data.selectedDate ? "date" : undefined}
                className={`flex min-h-14 flex-wrap items-center justify-between gap-1 px-3 py-2 text-sm hover:bg-[var(--surface-hover)] ${entry.workDate === data.selectedDate ? "bg-[var(--brand-soft)]" : ""}`}>
                <span className="tabular-nums">{entry.workDate}</span><span className="text-xs text-[var(--text-muted)]">{statusLabel(entry)}</span>
              </Link>
            </li>)}</ul>}
          {(data.historyPage > 1 || data.historyHasMore) && <nav aria-label="보고 보관함 페이지" className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-3 py-2">
            {data.historyPage > 1 && <Link className={button} href={`${dailyReportPath}?date=${data.selectedDate}&page=${data.historyPage - 1}`}>이전</Link>}
            <span className="text-xs tabular-nums">{data.historyPage}쪽</span>
            {data.historyHasMore && <Link className={button} href={`${dailyReportPath}?date=${data.selectedDate}&page=${data.historyPage + 1}`}>다음</Link>}
          </nav>}
        </section>
      </div>}
  </div>;
}

function EmployeeReport({ data, saveAction, onDirtyChange }: {
  data: DailyReportPageData; saveAction: ReportAction; onDirtyChange: (dirty: boolean) => void;
}) {
  const [state, action, pending] = useActionState<DailyReportState, FormData>(async (previous, form) => {
    try {
      const result = await saveAction(previous, form);
      return { ...result, entry: result.entry ?? previous.entry };
    } catch {
      return { entry: previous.entry, error: "서버에 연결하지 못했습니다. 입력은 유지됩니다. 연결을 확인한 뒤 다시 시도해 주세요." };
    }
  }, {});
  const entry = state.entry ?? data.selectedReport;
  const [mainContent, setMainContent] = useState(data.selectedReport?.mainContent ?? "");
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(data.selectedReport?.youthReports.map(note => [note.youthId, note.content]) ?? []));
  const [query, setQuery] = useState("");
  const feedback = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const youths = new Map(data.youths.map(youth => [youth.id, youth]));
  for (const note of entry?.youthReports ?? []) youths.set(note.youthId, { id: note.youthId, name: note.youthName });
  const allYouths = [...youths.values()];
  const visibleYouths = allYouths.filter(youth => youth.name.includes(query.trim()));
  const baselineNotes = Object.fromEntries(entry?.youthReports.map(note => [note.youthId, note.content]) ?? []);
  const dirty = mainContent.trim() !== (entry?.mainContent ?? "") || Object.keys({ ...notes, ...baselineNotes }).some(id => (notes[id] ?? "").trim() !== (baselineNotes[id] ?? ""));
  const noteCount = Object.values(notes).filter(note => note.trim()).length;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!pending) inFlight.current = false;
    if (state.error) feedback.current?.focus();
  }, [state, pending]);
  return <form action={action} className={panel} onSubmit={event => {
    if (inFlight.current || pending) { event.preventDefault(); return; }
    inFlight.current = true;
  }}>
    <input type="hidden" name="workDate" value={data.selectedDate} />
    <input type="hidden" name="version" value={entry?.version ?? 0} />
    <input type="hidden" name="youthReports" value={JSON.stringify(Object.entries(notes).map(([youthId, content]) => ({ youthId, content })))} />
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
      <div className="min-w-0 text-sm"><h2 className="font-semibold">{data.userName}의 보고</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{statusLabel(entry)}{dirty ? " · 저장하지 않은 변경" : ""}</p></div>
      <div className="flex items-center gap-2">
        {!entry?.submittedAt && <button type="submit" name="intent" value="draft" disabled={pending || !data.canWrite} className={button}>임시저장</button>}
        <button type="submit" name="intent" value="submit" disabled={pending || !data.canWrite || !data.recipients.length} className={primary}>{pending ? "저장 중…" : entry?.submittedAt ? "수정 제출" : "시설장에게 제출"}</button>
      </div>
    </div>
    <fieldset disabled={pending || !data.canWrite} className="min-w-0 space-y-4 p-3 sm:p-4">
      <div>
        <label htmlFor="report-main" className="text-sm font-semibold">주요 업무보고 <span className="text-xs font-normal text-[var(--text-muted)]">제출 시 필수</span></label>
        <textarea id="report-main" name="mainContent" value={mainContent} onChange={event => setMainContent(event.target.value)} rows={5} maxLength={dailyReportMainLimit}
          aria-invalid={Boolean(state.fieldErrors?.mainContent)} aria-describedby="report-main-help report-main-error"
          className={`${control} mt-2 block w-full resize-y py-2 leading-6`} placeholder="오늘 수행한 주요 업무, 진행 결과, 시설장에게 전달할 사항을 작성해 주세요." />
        <div className="mt-1 flex flex-wrap justify-between gap-1 text-xs text-[var(--text-muted)]"><span id="report-main-help">{data.recipients.length ? `수신: ${data.recipients.join(", ")} 시설장` : "수신 시설장 미등록 · 임시저장할 수 있습니다."}</span><span className="tabular-nums">{mainContent.length.toLocaleString()} / 10,000</span></div>
        <p id="report-main-error" className="mt-1 text-sm text-[var(--danger)]">{state.fieldErrors?.mainContent}</p>
      </div>
      <section aria-labelledby="youth-report-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="youth-report-title" className="text-sm font-semibold">청소년별 보고 <span className="text-xs font-normal text-[var(--text-muted)]">선택 · {noteCount}명 작성</span></h3>
          {allYouths.length > 0 && <input type="search" aria-label="작성할 청소년 이름 찾기" value={query} onChange={event => setQuery(event.target.value)} placeholder="청소년 이름 찾기" className={`${control} w-40`} />}
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">당일 활동, 대화 내용, 생활 모습과 관찰 사항을 기록해 주세요. 빈 항목은 제출되지 않습니다.</p>
        {!allYouths.length ? <p className="py-5 text-sm text-[var(--text-muted)]">해당 날짜에 보고할 청소년이 없습니다. 주요 업무만 제출할 수 있습니다.</p> :
          !visibleYouths.length ? <p className="py-5 text-sm text-[var(--text-muted)]">이름과 일치하는 청소년이 없습니다. 검색어를 지워 주세요.</p> :
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{visibleYouths.map(youth => <div key={youth.id} className="min-w-0">
            <label htmlFor={`youth-${youth.id}`} className="block break-words text-sm font-medium">{youth.name}<span className="ml-2 text-xs font-normal text-[var(--text-muted)]">선택</span></label>
            <textarea id={`youth-${youth.id}`} value={notes[youth.id] ?? ""} onChange={event => setNotes(previous => ({ ...previous, [youth.id]: event.target.value }))}
              rows={3} maxLength={dailyReportYouthLimit} className={`${control} mt-1 block w-full resize-y py-2 leading-6`}
              aria-invalid={Boolean(state.fieldErrors?.[`youth-${youth.id}`])} aria-describedby={`youth-error-${youth.id}`} placeholder="활동 · 나눈 말 · 생활 및 관찰 사항" />
            <p id={`youth-error-${youth.id}`} className="text-sm text-[var(--danger)]">{state.fieldErrors?.[`youth-${youth.id}`]}</p>
          </div>)}</div>}
      </section>
    </fieldset>
    <div className="space-y-2 border-t border-[var(--border)] px-3 py-3 text-xs text-[var(--text-muted)]">
      <p>{entry?.submittedAt ? "수정 제출하면 시설장에게 다시 미확인으로 표시됩니다." : "임시저장은 나에게만 보이며, 제출하면 시설장이 확인할 수 있습니다."} 보고서는 날짜별로 보관됩니다.</p>
      {entry && <p>최근 변경 {timeLabel(entry.updatedAt)}{entry.reviewedAt ? ` · ${entry.reviewedByName ?? "시설장"} 확인 ${timeLabel(entry.reviewedAt)}` : ""}</p>}
      {!data.canWrite && <p className="text-[var(--danger)]">현재 작성 권한이 없습니다. 기존 보고서는 조회할 수 있습니다.</p>}
      <div ref={feedback} tabIndex={-1} role={state.error ? "alert" : "status"} className="break-words text-sm">
        {state.error ? <><p className="text-[var(--danger)]">{state.error}</p>{state.fieldErrors && <ul className="mt-1 list-inside list-disc text-[var(--danger)]">{Object.entries(state.fieldErrors).map(([key, value]) => <li key={key}>{value}</li>)}</ul>}</> : state.success}
      </div>
    </div>
  </form>;
}

function DirectorReports({ data, reviewAction }: { data: DailyReportPageData; reviewAction: ReportAction }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [expandAll, setExpandAll] = useState(false);
  const reports = new Map(data.reports.map(report => [report.authorId, report]));
  const unread = data.reports.filter(report => !report.reviewedAt).length;
  const submitted = data.reports.length;
  const missing = data.staff.filter(staff => !reports.has(staff.id)).length;
  const rows = data.staff.map(staff => ({ staff, report: reports.get(staff.id) ?? null }))
    .filter(({ staff, report }) => {
      const matchesStatus = filter === "all" || (filter === "missing" ? !report : filter === "unread" ? report && !report.reviewedAt : report?.reviewedAt);
      const text = [staff.name, staff.departmentName, report?.mainContent, ...(report?.youthReports.map(note => `${note.youthName} ${note.content}`) ?? [])].join(" ").toLocaleLowerCase();
      return matchesStatus && text.includes(query.trim().toLocaleLowerCase());
    }).sort((a, b) => {
      const priority = (report: DailyReportEntry | null) => report ? report.reviewedAt ? 2 : 0 : 1;
      return priority(a.report) - priority(b.report) || a.staff.name.localeCompare(b.staff.name, "ko");
    });
  return <>
    <dl aria-label="선택 날짜 보고 현황" className={`${panel} grid grid-cols-4 divide-x divide-[var(--border)]`}>
      {[["대상 직원", data.staff.length], ["제출", submitted], ["미제출", missing], ["미확인", unread]].map(([label, count]) => <div key={label} className="px-2 py-2 sm:px-4">
        <dt className="text-xs text-[var(--text-muted)]">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{count}<span className="ml-1 text-xs font-normal">명</span></dd>
      </div>)}
    </dl>
    <section className={panel} aria-labelledby="staff-reports-title" data-daily-report-list>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <h2 id="staff-reports-title" className="text-sm font-semibold">직원별 보고 <span className="font-normal text-[var(--text-muted)] tabular-nums">{rows.length}명</span></h2>
        <button type="button" className={button} aria-pressed={expandAll} onClick={() => setExpandAll(!expandAll)}>{expandAll ? "모두 접기" : "모두 펼치기"}</button>
      </div>
      <div className="flex gap-2 border-b border-[var(--border)] p-2">
        <select value={filter} onChange={event => setFilter(event.target.value)} aria-label="제출 상태 필터" className={`${control} w-[112px] shrink-0 px-2`}>
          <option value="all">전체</option><option value="unread">미확인</option><option value="missing">미제출</option><option value="reviewed">확인 완료</option>
        </select>
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="직원 및 보고 내용 검색" placeholder="직원 · 청소년 · 보고 내용 검색" className={`${control} w-full`} />
      </div>
      <div className="divide-y divide-[var(--border)]">
        {!rows.length ? <div className="px-3 py-6 text-sm text-[var(--text-muted)]">{data.staff.length ? "조건에 맞는 보고가 없습니다. 필터나 검색어를 변경해 주세요." : "해당 날짜의 보고 대상 직원이 없습니다."}</div> :
          rows.map(({ staff, report }) => report ? <DirectorReportRow key={`${report.id}-${expandAll}`} report={report} expandAll={expandAll} reviewAction={reviewAction} /> :
            <div key={staff.id} className="flex min-h-16 items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0"><p className="break-words font-medium">{staff.name}</p><p className="text-xs text-[var(--text-muted)]">{staff.departmentName}</p></div>
              <span className="shrink-0 text-xs text-[var(--text-muted)]">미제출</span>
            </div>) }
      </div>
    </section>
    <p className="text-xs leading-5 text-[var(--text-muted)]">보고 날짜를 바꾸면 이전 보고를 조회합니다. 미제출은 휴무 여부와 관계없는 제출 현황입니다.</p>
  </>;
}

function DirectorReportRow({ report, expandAll, reviewAction }: { report: DailyReportEntry; expandAll: boolean; reviewAction: ReportAction }) {
  return <details open={expandAll} className="group">
    <summary className="min-h-16 cursor-pointer list-none px-3 py-3 hover:bg-[var(--surface-hover)] [&::-webkit-details-marker]:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h3 className="break-words text-sm font-semibold">{report.authorName}</h3><span className="text-xs text-[var(--text-muted)]">{report.departmentName} · 청소년 {report.youthReports.length}명</span></div>
          <p className="mt-1 line-clamp-2 break-words text-sm leading-5 [overflow-wrap:anywhere] group-open:hidden">{report.mainContent}</p>
        </div>
        <span className="shrink-0 text-xs"><span className={report.reviewedAt ? "text-[var(--text-muted)]" : "font-semibold"}>{report.reviewedAt ? "확인 완료" : "미확인"}</span><span aria-hidden="true" className="ml-2 inline-block group-open:rotate-180">⌄</span></span>
      </div>
    </summary>
    <div className="space-y-3 border-t border-[var(--border)] bg-[var(--surface-muted)] p-3">
      <div><h4 className="text-xs font-semibold text-[var(--text-muted)]">주요 업무보고</h4><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{report.mainContent}</p></div>
      <section aria-label={`${report.authorName}의 청소년별 보고`}>
        <h4 className="text-xs font-semibold text-[var(--text-muted)]">청소년별 보고 · {report.youthReports.length}명</h4>
        {report.youthReports.length ? <dl className="mt-2 divide-y divide-[var(--border)]">{report.youthReports.map(note => <div key={note.youthId} className="grid gap-1 py-2 sm:grid-cols-[100px_minmax(0,1fr)] sm:gap-3">
          <dt className="break-words text-sm font-semibold">{note.youthName}</dt><dd className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{note.content}</dd>
        </div>)}</dl> : <p className="mt-2 text-sm text-[var(--text-muted)]">작성된 청소년별 보고가 없습니다.</p>}
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2">
        <p className="text-xs text-[var(--text-muted)]">최초 제출 {timeLabel(report.submittedAt!)}<br />{report.reviewedAt ? `${report.reviewedByName ?? "시설장"} 확인 ${timeLabel(report.reviewedAt)}` : `최근 저장 ${timeLabel(report.updatedAt)}`}</p>
        {!report.reviewedAt && <ReviewReportForm key={`${report.id}-${report.version}`} report={report} reviewAction={reviewAction} />}
      </div>
    </div>
  </details>;
}

function ReviewReportForm({ report, reviewAction }: { report: DailyReportEntry; reviewAction: ReportAction }) {
  const [state, action, pending] = useActionState<DailyReportState, FormData>(async (previous, form) => {
    try { return await reviewAction(previous, form); }
    catch { return { error: "서버에 연결하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요." }; }
  }, {});
  const feedback = useRef<HTMLParagraphElement>(null);
  const inFlight = useRef(false);
  useEffect(() => { if (!pending) inFlight.current = false; if (state.error) feedback.current?.focus(); }, [pending, state]);
  return <form action={action} onSubmit={event => { if (inFlight.current) event.preventDefault(); else inFlight.current = true; }} className="min-w-0 space-y-1">
    <input type="hidden" name="id" value={report.id} /><input type="hidden" name="version" value={report.version} />
    <button type="submit" disabled={pending || Boolean(state.success)} className={primary}>{pending ? "처리 중…" : state.success ? "확인 완료" : "확인 완료로 표시"}</button>
    <p ref={feedback} tabIndex={-1} role={state.error ? "alert" : "status"} className={`max-w-xs break-words text-xs ${state.error ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>{state.error ?? state.success}</p>
  </form>;
}
