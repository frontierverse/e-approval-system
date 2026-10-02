"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { AppModal } from "@/components/app-modal";
import { PageTitle } from "@/components/page-title";
import { getYouthRetentionState, getYouthRetentionUntil, youthRetentionStateLabels, type RetentionInput, type RetentionResult, type YouthRetentionRecord, type YouthRetentionDetail } from "@/lib/youth-retention-core";
import type { YouthPurgeInput } from "@/lib/youth-retention";

type Props = {
  data: YouthRetentionRecord[]; today: string;
  save: (id: string, input: RetentionInput) => Promise<RetentionResult<YouthRetentionRecord[]>>;
  purge: (id: string, input: YouthPurgeInput) => Promise<RetentionResult<YouthRetentionRecord[]>>;
  read: (id: string, reason: string) => Promise<RetentionResult<YouthRetentionDetail>>;
};
const button = "inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border)] px-3 text-sm font-medium hover:bg-[var(--surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] disabled:opacity-50";
const inputClass = "min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[var(--brand)]";
const stateOrder = { due: 0, purging: 1, pending: 2, held: 3, aftercare: 4, retained: 5, purged: 6 };

export function YouthRetentionBoard({ data, today, save, purge, read }: Props) {
  const [recordState, setRecordState] = useState({ source: data, records: data });
  if (recordState.source !== data) setRecordState({ source: data, records: data });
  const records = recordState.source === data ? recordState.records : data;
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<{ record: YouthRetentionRecord; mode: "manage" | "read" | "purge"; trigger: HTMLElement } | null>(null);
  const [profile, setProfile] = useState<YouthRetentionDetail | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [closedDate, setClosedDate] = useState("");
  const [confirmationName, setConfirmationName] = useState("");
  const [copiesReviewed, setCopiesReviewed] = useState(false);
  const [correctPlan, setCorrectPlan] = useState(false);
  const [pending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const retained = records.filter(record => record.actualDischargeDate || record.purgeStartedAt || record.purgedAt || (record.dischargeDate && record.dischargeDate < today));
  const active = records.filter(record => !retained.includes(record));
  const counts = {
    review: retained.filter(record => ["due", "purging"].includes(getYouthRetentionState(record, today))).length,
    pending: retained.filter(record => getYouthRetentionState(record, today) === "pending").length,
    retained: retained.filter(record => ["retained", "aftercare", "held"].includes(getYouthRetentionState(record, today))).length,
    purged: retained.filter(record => getYouthRetentionState(record, today) === "purged").length,
  };
  const visible = useMemo(() => records.filter(record => {
    const state = getYouthRetentionState(record, today);
    const archived = record.actualDischargeDate || record.purgeStartedAt || record.purgedAt || (record.dischargeDate && record.dischargeDate < today);
    return archived && (filter === "all" || state === filter) && record.name.includes(query.trim());
  }).sort((a, b) => stateOrder[getYouthRetentionState(a, today)] - stateOrder[getYouthRetentionState(b, today)] || a.name.localeCompare(b.name, "ko")), [records, filter, query, today]);

  function open(record: YouthRetentionRecord, mode: "manage" | "read" | "purge", trigger: HTMLElement) {
    setModal({ record, mode, trigger }); setProfile(null); setError(""); setSuccess("");
    setClosedDate(record.caseClosedDate ?? ""); setConfirmationName(""); setCopiesReviewed(false);
    setCorrectPlan(false);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || pending) return;
    const values = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        if (modal.mode === "read") {
          const result = await read(modal.record.id, String(values.get("reason")));
          if (!result.ok) { setError(result.error); return; }
          setProfile(result.data); return;
        }
        const result = modal.mode === "manage"
          ? await save(modal.record.id, correctPlan
            ? { correctedDischargeDate: String(values.get("correctedDischargeDate") ?? ""), actualDischargeDate: "", caseClosedDate: "", holdReason: "", version: modal.record.retentionVersion }
            : { actualDischargeDate: String(values.get("actualDischargeDate") ?? ""), caseClosedDate: closedDate, holdReason: String(values.get("holdReason") ?? ""), version: modal.record.retentionVersion })
          : await purge(modal.record.id, { confirmationName, reviewedCopies: copiesReviewed, version: modal.record.retentionVersion });
        if (!result.ok) { setError(result.error); return; }
        setRecordState({ source: data, records: result.data }); setModal(null);
        setSuccess(modal.mode === "manage" ? (correctPlan ? "퇴소 예정일을 정정하여 일반 명단에 다시 표시합니다." : "퇴소와 보존 정보를 저장했습니다.") : "개인정보와 결정문 파일을 파기했습니다.");
      } catch { setError("요청을 처리하지 못했습니다. 입력은 유지됩니다. 상태를 확인한 뒤 다시 시도하세요."); }
    });
  }
  function downloadRetainedDocument(id: string, filename: string) {
    if (pending) return;
    startTransition(async () => {
      try {
        const body = new FormData(); body.set("reason", "INTERNAL_REVIEW");
        const response = await fetch(`/youth/decision-documents/${id}`, { method: "POST", body });
        if (!response.ok) { setError(await response.text()); return; }
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a"); link.href = url; link.download = filename;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch { setError("결정문을 내려받지 못했습니다. 다시 시도하세요."); }
    });
  }
  return <div className="min-w-0 text-[var(--foreground)] [&>header]:flex-wrap">
    <PageTitle compact title="퇴소기록 관리" action={<div className="flex items-center gap-2"><label className="sr-only" htmlFor="confirm-active-youth">조기 퇴소 대상 선택</label><select id="confirm-active-youth" className={`${inputClass} max-w-28 sm:max-w-52`} value="" onChange={event => { const record = active.find(row => row.id === event.target.value); if (record) open(record, "manage", event.currentTarget); }}><option value="">퇴소 확인</option>{active.map(record => <option key={record.id} value={record.id}>{record.name}</option>)}</select><div className="hidden sm:block"><Link className={button} href="/youth/roster">청소년 명단</Link></div></div>} />
    <dl className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="퇴소기록 요약">
      {[["파기 검토·재시도", counts.review], ["퇴소 확인 필요", counts.pending], ["보존·사후관리", counts.retained], ["파기 완료", counts.purged]].map(([label, count]) => <div key={label} className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"><dt className="text-xs text-[var(--text-muted)]">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{count}</dd></div>)}
    </dl>
    <div className="mb-3 grid grid-cols-2 gap-2 sm:flex sm:items-center">
      <label className="sr-only" htmlFor="retention-search">퇴소기록 이름 검색</label><input id="retention-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="이름 검색" className={`${inputClass} min-w-0 sm:max-w-52`} />
      <label className="sr-only" htmlFor="retention-state">보존 상태</label><select id="retention-state" className={`${inputClass} min-w-0 sm:max-w-40`} value={filter} onChange={event => setFilter(event.target.value)}><option value="all">전체 상태</option>{Object.entries(youthRetentionStateLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
    </div>
    {success && <p role="status" className="mb-3 text-sm">{success}</p>}
    <section className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]" aria-labelledby="retention-list-title">
      <div className="flex min-h-12 items-center justify-between gap-2 border-b border-[var(--border)] px-3"><h2 id="retention-list-title" className="font-semibold">처리할 퇴소기록</h2><span className="text-xs tabular-nums text-[var(--text-muted)]">{visible.length}건</span></div>
      {visible.length === 0 ? <p className="px-3 py-6 text-sm text-[var(--text-muted)]">{retained.length ? "검색 조건에 맞는 기록이 없습니다." : "퇴소 확인이 필요한 기록이 없습니다."}</p> : <ul className="divide-y divide-[var(--border)]">{visible.map(record => {
        const state = getYouthRetentionState(record, today);
        return <li key={record.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:flex-nowrap">
          <div className="min-w-0 basis-[calc(100%-7rem)] flex-1 sm:basis-auto"><p className="break-words text-sm font-semibold">{record.purgedAt ? "개인정보 파기 완료" : record.name}</p><p className="mt-1 text-xs tabular-nums text-[var(--text-muted)]">퇴소 {record.actualDischargeDate ?? (record.dischargeDate ? `${record.dischargeDate} 예정` : "미확정")} · 보존 {record.retentionUntil ? `${record.retentionUntil}까지` : "완료일 미등록"}</p></div>
          <span className="rounded bg-[var(--surface-muted)] px-2 py-1 text-xs font-medium">{youthRetentionStateLabels[state]}</span>
          <div className="flex shrink-0 flex-wrap gap-2">
            {!record.purgedAt && !record.purgeStartedAt && <button className={button} onClick={event => open(record, "manage", event.currentTarget)} aria-label={`${record.name} 보존 관리`}>보존 관리</button>}
            {record.actualDischargeDate && !record.purgeStartedAt && !record.purgedAt && <button className={button} onClick={event => open(record, "read", event.currentTarget)} aria-label={`${record.name} 보존 기록 열람`}>기록 열람</button>}
            {["due", "purging"].includes(state) && <button className={button} onClick={event => open(record, "purge", event.currentTarget)} aria-label={`${record.name} 개인정보 파기`}>{state === "purging" ? "파기 재시도" : "파기 검토"}</button>}
          </div>
        </li>;
      })}</ul>}
    </section>
    <details className="mt-3 rounded-md border border-[var(--border)] bg-[var(--surface)] text-sm"><summary className="min-h-11 cursor-pointer px-3 py-3 focus-visible:outline-2">보존·파기 기준</summary><div className="space-y-2 px-3 pb-3 text-[var(--text-muted)]"><p>실제 퇴소를 확인한 뒤 일반 업무 조회를 제한합니다. 퇴소 예정일만으로 자동 파기하지 않습니다.</p><p>상담·사후관리 완료일부터 5년간 보존하며, 완료일 미등록·보존 보류·미정산 기록은 파기를 차단합니다. 추가 보존이 필요한 경우 근거와 사유를 보존 보류에 기록하세요.</p><a className="inline-flex min-h-11 items-center underline" href="https://www.mogef.go.kr/io/ind/io_ind_s005d.do?bbtSn=172&mid=old919" target="_blank" rel="noreferrer">2026년 청소년사업 안내 2권 418·459쪽</a></div></details>
    <div className="mt-3 sm:hidden"><Link className={button} href="/youth/roster">청소년 명단으로</Link></div>
    {modal && <AppModal label={`${modal.record.name} ${modal.mode === "manage" ? "보존 관리" : modal.mode === "read" ? "보존 기록 열람" : "개인정보 파기"}`} returnFocusTo={modal.trigger} onClose={() => { if (!pending) setModal(null); }} className="w-full max-w-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--foreground)]">
      <div className="max-h-[calc(100dvh-5rem)] overflow-y-auto">
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="min-w-0 break-words font-semibold">{modal.record.name} · {modal.mode === "manage" ? "보존 관리" : modal.mode === "read" ? "보존 기록 열람" : "개인정보 파기"}</h2><button className={`${button} shrink-0`} disabled={pending} onClick={() => setModal(null)}>닫기</button></div>
      <form onSubmit={submit} className="space-y-3">
        {modal.mode === "manage" && <>
          {!modal.record.actualDischargeDate && <label className="block text-sm">처리 내용<select className={`${inputClass} mt-1`} value={correctPlan ? "correct" : "confirm"} onChange={event => setCorrectPlan(event.target.value === "correct")}><option value="confirm">실제 퇴소 확인</option><option value="correct">입소 유지 · 퇴소 예정일 정정</option></select></label>}
          {correctPlan ? <label className="block text-sm">정정할 퇴소 예정일<input className={`${inputClass} mt-1`} type="date" name="correctedDischargeDate" min={today} required /></label> : <>
          <label className="block text-sm">실제 퇴소일<input className={`${inputClass} mt-1`} type="date" name="actualDischargeDate" required max={today} min={modal.record.admissionDate ?? undefined} defaultValue={modal.record.actualDischargeDate ?? modal.record.dischargeDate ?? ""} readOnly={Boolean(modal.record.actualDischargeDate)} /></label>
          <label className="block text-sm">상담·사후관리 완료일 <span className="text-[var(--text-muted)]">(진행 중이면 비워 두세요)</span><input className={`${inputClass} mt-1`} type="date" name="caseClosedDate" max={today} value={closedDate} onChange={event => setClosedDate(event.target.value)} /></label>
          <p className="text-sm tabular-nums text-[var(--text-muted)]">보존 만료일: {closedDate ? `${getYouthRetentionUntil(closedDate)} (해당 날짜까지 보존)` : "완료일 등록 후 계산"}</p>
          <label className="block text-sm">보존 보류 사유<textarea name="holdReason" className={`${inputClass} mt-1 py-2`} rows={3} maxLength={500} defaultValue={modal.record.retentionHoldReason ?? ""} placeholder="추가 보존 근거·관련 업무·재검토 시점을 입력하세요." /></label>
          <p className="text-xs text-[var(--text-muted)]">실제 퇴소를 확정하면 일반 업무 목록에서 제외됩니다. 확정된 퇴소일과 보존기간을 앞당길 수 없습니다.</p>
          </>}
        </>}
        {modal.mode === "read" && <>
          {!profile && <label className="block text-sm">열람 사유<select name="reason" className={`${inputClass} mt-1`} required><option value="">사유 선택</option><option value="AFTERCARE">사후관리</option><option value="OFFICIAL_REQUEST">법원·관계기관 요청</option><option value="RETENTION_REVIEW">보존·파기 검토</option></select></label>}
          {profile && <div className="space-y-3 text-sm"><p>열람 이력이 기록되었습니다.</p><dl className="grid grid-cols-1 gap-2 sm:grid-cols-2"><div><dt className="text-[var(--text-muted)]">생년월일</dt><dd>{profile.birthDate ?? "미등록"}</dd></div><div><dt className="text-[var(--text-muted)]">연락처</dt><dd>{profile.phone ?? "미등록"}</dd></div></dl><div><h3 className="font-semibold">가족 연락처</h3>{profile.familyContacts.map(contact => <p key={contact.id}>{contact.relationship ?? "관계 미등록"} · {contact.phone ?? "미등록"}</p>)}</div><div><h3 className="font-semibold">결정문</h3>{profile.decisionDocuments.map(document => <div key={document.id}><button type="button" disabled={pending} onClick={() => downloadRetainedDocument(document.id, document.originalName)} className={`${button} max-w-full break-all text-left`}>{document.originalName} 다운로드</button></div>)}</div><div><h3 className="font-semibold">청소년별 업무보고</h3>{profile.retainedReports.map((report, index) => <div key={index} className="mt-2 border-t border-[var(--border)] pt-2"><p className="text-xs text-[var(--text-muted)]">{report.workDate} · {report.authorName}</p><p className="whitespace-pre-wrap break-words">{report.content}</p></div>)}</div><div><h3 className="font-semibold">특이사항</h3>{profile.notes.map(note => <div key={note.id} className="mt-2 border-t border-[var(--border)] pt-2"><p className="font-medium">{note.title}</p><p className="whitespace-pre-wrap break-words">{note.detail || note.summary}</p></div>)}</div></div>}
        </>}
        {modal.mode === "purge" && <>
          <p className="text-sm">{modal.record.name}의 기본정보·연락처·개별 기록과 결정문 {modal.record.decisionDocumentCount}개를 파기합니다. 청소년별 업무보고와 연결된 감사기록의 개인정보도 제거합니다. 복구할 수 없습니다.</p>
          <p className="text-xs text-[var(--text-muted)]">확정된 보상 금액은 식별정보를 제거하여 유지합니다. 업무일지·결재문서·채팅의 자유서술과 외부 사본·백업은 별도로 점검하고, 추가 보존이 필요하면 먼저 보존 보류를 등록하세요.</p>
          <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" required checked={copiesReviewed} onChange={event => setCopiesReviewed(event.target.checked)} className="mt-1 size-5 shrink-0"/><span>자유서술 기록·외부 사본·백업의 개인정보와 추가 보존 필요 여부를 점검했습니다.</span></label>
          <label className="block text-sm">확인을 위해 청소년 이름 입력<input className={`${inputClass} mt-1`} required value={confirmationName} onChange={event => setConfirmationName(event.target.value)} autoComplete="off" /></label>
        </>}
        {error && <p ref={errorRef} tabIndex={-1} role="alert" className="rounded border border-[var(--border)] p-3 text-sm">{error} <button type="button" className="min-h-11 underline" onClick={() => window.location.reload()}>상태 새로고침</button></p>}
        {!(modal.mode === "read" && profile) && <button className={`${button} w-full sm:w-auto`} type="submit" disabled={pending || (modal.mode === "purge" && (!copiesReviewed || confirmationName.trim() !== modal.record.name))}>{pending ? "처리 중…" : modal.mode === "manage" ? (correctPlan ? "퇴소 예정일 정정" : "퇴소·보존 정보 저장") : modal.mode === "read" ? "사유를 기록하고 열람" : "개인정보 영구 파기"}</button>}
      </form>
      </div>
    </AppModal>}
  </div>;
}
