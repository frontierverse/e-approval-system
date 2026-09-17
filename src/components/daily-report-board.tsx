"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { PageTitle } from "@/components/page-title";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  dailyReportMainLimit, dailyReportPath, dailyReportYouthLimit,
  type DailyReportEntry, type DailyReportPageData, type DailyReportState,
} from "@/lib/daily-report-core";

type ReportAction = (previous: DailyReportState, form: FormData) => Promise<DailyReportState>;
const panel = "min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]";
const control = "min-h-11 min-w-0 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)]";
const button = `${control} inline-flex items-center justify-center gap-1 font-medium hover:bg-[var(--surface-hover)] disabled:opacity-50`;
const primary = buttonClass(buttonStyles.base, buttonStyles.primary, "min-h-11 px-4 text-sm whitespace-nowrap");
const leaveMessage = "저장하지 않은 업무보고 내용이 있습니다. 이 페이지를 나가면 입력 내용이 사라집니다. 이동할까요?";

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
function statusLabel(entry: { submittedAt: string | null; reviewedAt: string | null } | null) {
  return !entry ? "미작성" : !entry.submittedAt ? "임시저장" : entry.reviewedAt ? "확인 완료" : "제출 완료";
}

function StatusBadge({ entry }: { entry: { submittedAt: string | null; reviewedAt: string | null } | null }) {
  return <span className={`inline-flex shrink-0 items-center rounded border px-2 py-1 text-xs font-medium ${entry?.submittedAt && !entry.reviewedAt
    ? "border-transparent bg-[var(--brand-soft)] text-[var(--focus-ring)]"
    : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)]"}`}>{statusLabel(entry)}</span>;
}

function ReportHistory({ data }: { data: DailyReportPageData }) {
  return <section className={panel} aria-labelledby="report-history-title">
    <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
      <h2 id="report-history-title" className="text-sm font-semibold">내 보고 보관함</h2>
      <span className="text-xs text-[var(--text-muted)]">날짜별 기록</span>
    </div>
    {!data.history.length ? <p className="px-4 py-5 text-sm leading-6 text-[var(--text-muted)]">아직 저장한 보고가 없습니다.<br />저장한 보고는 이곳에 모입니다.</p> :
      <ul className="divide-y divide-[var(--border)]">{data.history.map(entry => <li key={entry.id}>
        <Link href={`${dailyReportPath}?date=${entry.workDate}&page=${data.historyPage}`} aria-current={entry.workDate === data.selectedDate ? "date" : undefined}
          className={`flex min-h-16 flex-wrap items-center justify-between gap-2 border-l-2 px-3 py-3 text-sm hover:bg-[var(--surface-hover)] focus-visible:outline-offset-[-3px]! ${entry.workDate === data.selectedDate ? "border-l-[var(--brand)] bg-[var(--brand-soft)]" : "border-l-transparent"}`}>
          <time dateTime={entry.workDate} className="font-medium tabular-nums">{entry.workDate}</time><StatusBadge entry={entry} />
        </Link>
      </li>)}</ul>}
    {(data.historyPage > 1 || data.historyHasMore) && <nav aria-label="보고 보관함 페이지" className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-3 py-2">
      {data.historyPage > 1 && <Link className={button} href={`${dailyReportPath}?date=${data.selectedDate}&page=${data.historyPage - 1}`}>이전</Link>}
      <span className="text-xs tabular-nums">{data.historyPage}쪽</span>
      {data.historyHasMore && <Link className={button} href={`${dailyReportPath}?date=${data.selectedDate}&page=${data.historyPage + 1}`}>다음</Link>}
    </nav>}
  </section>;
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
      <EmployeeReport key={data.selectedDate} data={data} saveAction={saveAction} onDirtyChange={setDirty} />}
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
  const [writtenOnly, setWrittenOnly] = useState(false);
  const [expandedYouths, setExpandedYouths] = useState<Set<string>>(() => new Set());
  const feedback = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const youths = new Map(data.youths.map(youth => [youth.id, youth]));
  for (const note of entry?.youthReports ?? []) youths.set(note.youthId, { id: note.youthId, name: note.youthName });
  const allYouths = [...youths.values()];
  const visibleYouths = allYouths.filter(youth => youth.name.includes(query.trim()) && (!writtenOnly || notes[youth.id]?.trim() || expandedYouths.has(youth.id)));
  const baselineNotes = Object.fromEntries(entry?.youthReports.map(note => [note.youthId, note.content]) ?? []);
  const dirty = mainContent.trim() !== (entry?.mainContent ?? "") || Object.keys({ ...notes, ...baselineNotes }).some(id => (notes[id] ?? "").trim() !== (baselineNotes[id] ?? ""));
  const noteCount = Object.values(notes).filter(note => note.trim()).length;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!pending) inFlight.current = false;
    if (state.error) feedback.current?.focus();
  }, [state, pending]);
  return <form action={action} className="min-w-0 space-y-3" onSubmit={event => {
    if (inFlight.current || pending) { event.preventDefault(); return; }
    inFlight.current = true;
  }}>
    <input type="hidden" name="workDate" value={data.selectedDate} />
    <input type="hidden" name="version" value={entry?.version ?? 0} />
    <input type="hidden" name="youthReports" value={JSON.stringify(Object.entries(notes).map(([youthId, content]) => ({ youthId, content })))} />
    <div className={`${panel} flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:sticky lg:top-0 lg:z-10`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{data.userName}의 보고서</h2>
        <StatusBadge entry={entry} />
        <span className="text-xs text-[var(--text-muted)]">{dirty ? "저장하지 않은 변경" : entry ? "저장된 내용" : "작성 후 제출해 주세요"}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {!entry?.submittedAt && <button type="submit" name="intent" value="draft" disabled={pending || !data.canWrite} className={button}>임시저장</button>}
        <button type="submit" name="intent" value="submit" disabled={pending || !data.canWrite || !data.recipients.length} className={primary}>{pending ? "저장 중…" : entry?.submittedAt ? "수정 제출" : "시설장에게 제출"}</button>
      </div>
    </div>
    <div ref={feedback} tabIndex={-1} role={state.error ? "alert" : "status"} className={state.error || state.success ? `${panel} break-words px-4 py-3 text-sm` : "sr-only"}>
        {state.error ? <><p className="text-[var(--danger)]">{state.error}</p>{state.fieldErrors && <ul className="mt-1 list-inside list-disc text-[var(--danger)]">{Object.entries(state.fieldErrors).map(([key, value]) => <li key={key}>{value}</li>)}</ul>}</> : state.success}
    </div>
    {!data.canWrite && <p className="text-sm text-[var(--danger)]">현재 작성 권한이 없습니다. 기존 보고서는 조회할 수 있습니다.</p>}
    {!data.recipients.length && <p className="text-sm text-[var(--text-muted)]">수신 시설장 미등록 · 임시저장할 수 있습니다.</p>}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_248px]">
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        <legend className="sr-only">보고 내용 작성</legend>
        <section className={panel} aria-labelledby="report-main-title">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 sm:px-5">
            <h3 id="report-main-title" className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden="true" className="text-xs tabular-nums text-[var(--focus-ring)]">01</span> 주요 업무보고</h3>
            <span className="text-xs text-[var(--text-muted)]">제출 시 필수</span>
          </div>
          <div className="p-4 sm:p-5">
            <label htmlFor="report-main" className="sr-only">주요 업무보고 제출 시 필수</label>
            <p id="report-main-help" className="mb-3 text-xs leading-5 text-[var(--text-muted)]">수행한 업무와 결과, 공유하거나 지원이 필요한 사항을 기록해 주세요.</p>
            <textarea id="report-main" name="mainContent" value={mainContent} readOnly={!data.canWrite} onChange={event => setMainContent(event.target.value)} rows={5} maxLength={dailyReportMainLimit}
              aria-invalid={Boolean(state.fieldErrors?.mainContent)} aria-describedby="report-main-help report-main-error"
              className={`${control} block w-full resize-y px-3 py-3 leading-7 placeholder:text-[var(--text-muted)]`}
              placeholder={"수행 업무 및 진행 결과\n\n공유 사항 및 후속 계획"} />
            <div className="mt-2 flex flex-wrap justify-between gap-1 text-xs text-[var(--text-muted)]"><span>보고일 <time dateTime={data.selectedDate} className="tabular-nums">{data.selectedDate}</time></span><span className="tabular-nums">{mainContent.length.toLocaleString()} / 10,000자</span></div>
            <p id="report-main-error" className="mt-1 text-sm text-[var(--danger)]">{state.fieldErrors?.mainContent}</p>
          </div>
        </section>
        <section className={panel} aria-labelledby="youth-report-title">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3 sm:px-5">
            <h3 id="youth-report-title" className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden="true" className="text-xs tabular-nums text-[var(--focus-ring)]">02</span> 청소년별 보고 <span className="text-xs font-normal text-[var(--text-muted)]">선택</span></h3>
            <span className="text-xs text-[var(--text-muted)]"><strong className="font-semibold tabular-nums text-[var(--foreground)]">{noteCount}</strong>명 작성 / {allYouths.length}명</span>
          </div>
          <div className="px-4 py-3 sm:px-5">
            <p className="text-xs leading-5 text-[var(--text-muted)]">이름을 선택해 활동·대화·관찰 내용을 작성하세요. 빈 항목은 제출되지 않습니다.</p>
            {allYouths.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2">
              <input type="search" aria-label="작성할 청소년 이름 찾기" value={query} onChange={event => setQuery(event.target.value)} placeholder="청소년 이름 검색" className={`${control} w-full flex-1 basis-32`} />
              <button type="button" aria-pressed={writtenOnly} onClick={() => setWrittenOnly(!writtenOnly)} className={`${button} ${writtenOnly ? "border-[var(--brand)] bg-[var(--brand-soft)]" : ""}`}>작성한 기록만</button>
            </div>}
          </div>
          {!allYouths.length ? <p className="px-4 pb-5 text-sm text-[var(--text-muted)]">해당 날짜에 보고할 청소년이 없습니다. 주요 업무만 제출할 수 있습니다.</p> :
            !visibleYouths.length ? <p className="px-4 pb-5 text-sm text-[var(--text-muted)]">{writtenOnly ? "조건에 맞는 작성 기록이 없습니다. 검색어나 필터를 변경해 주세요." : "이름과 일치하는 청소년이 없습니다. 검색어를 지워 주세요."}</p> :
            <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">{visibleYouths.map(youth => {
              const note = notes[youth.id] ?? "";
              const fieldError = state.fieldErrors?.[`youth-${youth.id}`];
              const expanded = expandedYouths.has(youth.id) || Boolean(fieldError);
              return <div key={youth.id} className="min-w-0">
                <button type="button" aria-expanded={expanded} aria-controls={`youth-editor-${youth.id}`} aria-label={`${youth.name} 보고 ${expanded ? "접기" : data.canWrite ? "작성" : "보기"}`}
                  onClick={() => setExpandedYouths(previous => { const next = new Set(previous); if (next.has(youth.id)) next.delete(youth.id); else next.add(youth.id); return next; })}
                  className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-hover)] focus-visible:outline-offset-[-3px]! sm:px-5 ${expanded ? "bg-[var(--surface-muted)]" : ""}`}>
                  <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{youth.name}</span><span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">{note.trim() || "활동 · 대화 · 생활 관찰"}</span></span>
                  <span className={`shrink-0 text-xs ${note.trim() ? "font-medium text-[var(--focus-ring)]" : "text-[var(--text-muted)]"}`}>{note.trim() ? "작성됨" : "미작성"}</span>
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">{expanded ? "접기" : "열기"}</span>
                </button>
                <div id={`youth-editor-${youth.id}`} hidden={!expanded} className="bg-[var(--surface-muted)] px-4 pb-4 sm:px-5">{expanded && <>
                  <label htmlFor={`youth-${youth.id}`} className="sr-only">{youth.name}선택 보고 내용</label>
                  <textarea id={`youth-${youth.id}`} value={note} readOnly={!data.canWrite} onChange={event => setNotes(previous => ({ ...previous, [youth.id]: event.target.value }))}
                    rows={4} maxLength={dailyReportYouthLimit} className={`${control} block w-full resize-y py-3 leading-6 placeholder:text-[var(--text-muted)]`}
                    aria-invalid={Boolean(fieldError)} aria-describedby={`youth-error-${youth.id}`} placeholder="활동 · 나눈 말 · 생활 및 관찰 사항" />
                  <div className="mt-1 flex flex-wrap justify-between gap-1 text-xs text-[var(--text-muted)]"><span>입력한 내용은 보고서와 함께 저장됩니다.</span><span className="tabular-nums">{note.length.toLocaleString()} / 4,000자</span></div>
                  <p id={`youth-error-${youth.id}`} className="text-sm text-[var(--danger)]">{fieldError}</p>
                </>}</div>
              </div>;
            })}</div>}
        </section>
      </fieldset>
      <aside aria-label="보고서 제출 정보와 보관함" className="min-w-0 space-y-4">
        <section className={panel} aria-labelledby="report-submission-title">
          <h2 id="report-submission-title" className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">제출 정보</h2>
          <dl className="space-y-3 p-4 text-sm">
            <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-2"><dt className="text-xs leading-5 text-[var(--text-muted)]">보고일</dt><dd className="tabular-nums">{data.selectedDate}</dd></div>
            <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-2"><dt className="text-xs leading-5 text-[var(--text-muted)]">작성자</dt><dd className="break-words">{data.userName}</dd></div>
            <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-2"><dt className="text-xs leading-5 text-[var(--text-muted)]">수신</dt><dd className="break-words">{data.recipients.length ? `${data.recipients.join(", ")} 시설장` : "시설장 미등록"}</dd></div>
          </dl>
          <div className="border-t border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
            <p className="text-xs font-medium">{entry?.submittedAt ? "제출된 보고서" : "제출 전에는 나에게만 공개"}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{entry?.submittedAt ? "수정 제출하면 시설장에게 다시 미확인으로 표시됩니다." : "임시저장한 보고는 본인만 볼 수 있습니다. 제출하면 시설장이 확인합니다."}</p>
          </div>
          {entry && <dl className="space-y-3 border-t border-[var(--border)] p-4 text-xs">
            <div className="flex flex-wrap justify-between gap-1"><dt className="text-[var(--text-muted)]">최근 저장</dt><dd className="tabular-nums">{timeLabel(entry.updatedAt)}</dd></div>
            <div className="flex flex-wrap justify-between gap-1"><dt className="text-[var(--text-muted)]">제출</dt><dd className="tabular-nums">{entry.submittedAt ? timeLabel(entry.submittedAt) : "제출 전"}</dd></div>
            <div className="flex flex-wrap justify-between gap-1"><dt className="text-[var(--text-muted)]">시설장 확인</dt><dd className="break-words">{entry.reviewedAt ? `${entry.reviewedByName ?? "시설장"} · ${timeLabel(entry.reviewedAt)}` : entry.submittedAt ? "확인 대기" : "제출 후 확인"}</dd></div>
          </dl>}
        </section>
        <ReportHistory data={data} />
      </aside>
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
      {[["대상 직원", data.staff.length], ["제출", submitted], ["미제출", missing], ["미확인", unread]].map(([label, count]) => <div key={label} className={`px-2 py-3 sm:px-4 ${label === "미확인" && unread > 0 ? "bg-[var(--brand-soft)]" : ""}`}>
        <dt className="text-xs text-[var(--text-muted)]">{label}</dt><dd className={`mt-1 text-2xl font-semibold leading-7 tabular-nums ${label === "미확인" && unread > 0 ? "text-[var(--focus-ring)]" : ""}`}>{count}<span className="ml-1 text-xs font-normal text-[var(--text-muted)]">명</span></dd>
      </div>)}
    </dl>
    <section className={panel} aria-labelledby="staff-reports-title" data-daily-report-list>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2">
        <h2 id="staff-reports-title" className="text-sm font-semibold">직원별 보고 <span className="ml-1 font-normal text-[var(--text-muted)] tabular-nums">{rows.length}명</span></h2>
        <button type="button" className={button} aria-pressed={expandAll} onClick={() => setExpandAll(!expandAll)}>{expandAll ? "모두 접기" : "모두 펼치기"}</button>
      </div>
      <div className="flex gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 sm:px-4">
        <select value={filter} onChange={event => setFilter(event.target.value)} aria-label="제출 상태 필터" className={`${control} w-[112px] shrink-0 px-2`}>
          <option value="all">전체</option><option value="unread">미확인</option><option value="missing">미제출</option><option value="reviewed">확인 완료</option>
        </select>
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="직원 및 보고 내용 검색" placeholder="직원 · 청소년 · 보고 내용 검색" className={`${control} w-full`} />
      </div>
      <div aria-hidden="true" className="hidden grid-cols-[140px_minmax(0,1fr)_80px_104px_32px] gap-3 border-b border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--text-muted)] xl:grid">
        <span>직원 / 부서</span><span>주요 보고 내용</span><span>확인 상태</span><span>최근 저장</span><span />
      </div>
      <div className="divide-y divide-[var(--border)]">
        {!rows.length ? <div className="px-3 py-6 text-sm text-[var(--text-muted)]">{data.staff.length ? "조건에 맞는 보고가 없습니다. 필터나 검색어를 변경해 주세요." : "해당 날짜의 보고 대상 직원이 없습니다."}</div> :
          rows.map(({ staff, report }) => report ? <DirectorReportRow key={`${report.id}-${expandAll}`} report={report} expandAll={expandAll} reviewAction={reviewAction} /> :
            <div key={staff.id} className="grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-sm xl:grid-cols-[140px_minmax(0,1fr)_80px_104px_32px]">
              <div className="min-w-0"><p className="break-words font-medium">{staff.name}</p><p className="mt-1 break-words text-xs text-[var(--text-muted)]">{staff.departmentName}</p></div>
              <p className="hidden text-xs text-[var(--text-muted)] xl:block">제출된 보고가 없습니다.</p>
              <span className="w-fit shrink-0 rounded border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-xs text-[var(--text-muted)]">미제출</span>
              <span className="hidden text-xs text-[var(--text-muted)] xl:block">—</span><span />
            </div>) }
      </div>
    </section>
    <p className="text-xs leading-5 text-[var(--text-muted)]">보고 날짜를 바꾸면 이전 보고를 조회합니다. 미제출은 휴무 여부와 관계없는 제출 현황입니다.</p>
  </>;
}

function DirectorReportRow({ report, expandAll, reviewAction }: { report: DailyReportEntry; expandAll: boolean; reviewAction: ReportAction }) {
  return <details open={expandAll} className="group">
    <summary className="grid min-h-[72px] cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 hover:bg-[var(--surface-hover)] focus-visible:outline-offset-[-3px]! group-open:bg-[var(--surface-muted)] xl:grid-cols-[140px_minmax(0,1fr)_80px_104px_32px] [&::-webkit-details-marker]:hidden">
      <div className="min-w-0"><h3 className="break-words text-sm font-semibold">{report.authorName}</h3><p className="mt-1 break-words text-xs text-[var(--text-muted)]">{report.departmentName}</p></div>
      <div className="col-span-2 row-start-2 min-w-0 xl:col-span-1 xl:row-start-auto"><p className="line-clamp-1 break-words text-sm leading-5 [overflow-wrap:anywhere]">{report.mainContent}</p><p className="mt-1 text-xs text-[var(--text-muted)]">청소년별 기록 {report.youthReports.length}명<span className="ml-2 xl:hidden">저장 {timeLabel(report.updatedAt)}</span></p></div>
      <span className={`col-start-2 row-start-1 w-fit shrink-0 rounded border px-2 py-1 text-xs xl:col-start-auto xl:row-start-auto ${report.reviewedAt ? "border-[var(--border)] text-[var(--text-muted)]" : "border-transparent bg-[var(--brand-soft)] font-medium text-[var(--focus-ring)]"}`}>{report.reviewedAt ? "확인 완료" : "미확인"}</span>
      <time dateTime={report.updatedAt} className="hidden text-xs tabular-nums text-[var(--text-muted)] xl:block">{timeLabel(report.updatedAt)}</time>
      <span aria-hidden="true" className="hidden text-xs text-[var(--text-muted)] xl:block"><span className="group-open:hidden">상세</span><span className="hidden group-open:inline">접기</span></span>
    </summary>
    <div className="space-y-4 border-t border-[var(--border)] px-4 py-4 sm:px-5">
      <div><h4 className="text-xs font-semibold text-[var(--text-muted)]">주요 업무보고</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">{report.mainContent}</p></div>
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
