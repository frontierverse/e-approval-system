"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import {
  createStaffTaskAction,
  updateStaffTaskAction,
  type StaffTaskFormState,
} from "@/app/tasks/actions";
import { AppModal } from "@/components/app-modal";
import { DatePickerInput } from "@/components/date-picker-input";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { formatDateTime } from "@/lib/mock-data";
import type { StaffTaskAssignee, StaffTaskItem } from "@/lib/staff-tasks-core";

const initialState: StaffTaskFormState = {};
const fieldClass = "mt-1 h-11 w-full min-w-0 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--focus-ring)] focus:ring-2 focus:ring-[var(--focus-ring)] disabled:opacity-60";
const labelClass = "text-xs font-semibold text-[var(--text-muted)]";

export function StaffTaskEditorModal({
  task,
  assignees,
  requestId,
  returnFocusTo,
  onClose,
  onReload,
  onSaved,
}: {
  task: StaffTaskItem | null;
  assignees: StaffTaskAssignee[];
  requestId: string;
  returnFocusTo?: HTMLElement;
  onClose: () => void;
  onReload?: () => void;
  onSaved: (message: string) => void;
}) {
  const [state, formAction, pending] = useActionState(task ? updateStaffTaskAction : createStaffTaskAction, initialState);
  const [values, setValues] = useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    meetingTitle: task?.meetingTitle ?? "",
    assigneeId: task?.assigneeId ?? "",
    dueDate: task?.dueDate ?? "",
  });
  const errorRef = useRef<HTMLParagraphElement>(null);
  const titleId = useId();
  const errorId = useId();
  const assigneeHelpId = useId();
  const currentAssigneeAvailable = assignees.some((assignee) => assignee.id === task?.assigneeId);

  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (state.success) onSaved(state.success);
  }, [state.success, onSaved]);

  function changeValue(name: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  return (
    <AppModal
      labelledBy={titleId}
      returnFocusTo={returnFocusTo}
      onClose={() => { if (!pending) onClose(); }}
      className="flex max-w-xl flex-col"
    >
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4">
        <h2 id={titleId} className="text-base font-semibold text-[var(--foreground)]">{task ? "할 일 상세 및 수정" : "할 일 등록"}</h2>
        <button type="button" disabled={pending} onClick={onClose} aria-label="할 일 창 닫기" className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 min-w-11 px-3 text-sm")}>닫기</button>
      </div>
      <form action={formAction} aria-busy={pending} aria-describedby={state.error ? errorId : undefined} className="min-h-0 overflow-y-auto p-4">
        {task ? <><input type="hidden" name="id" value={task.id} /><input type="hidden" name="version" value={task.version} /></> : <input type="hidden" name="requestId" value={requestId} />}
        {state.error ? <p id={errorId} ref={errorRef} role="alert" tabIndex={-1} className="mb-3 rounded-md border border-[var(--danger)] p-3 text-sm text-[var(--danger)] outline-none focus:ring-2 focus:ring-[var(--focus-ring)]">{state.error}</p> : null}
        {task?.completedAt ? <p className="mb-3 text-sm text-[var(--foreground)] tabular-nums">완료 · {formatDateTime(task.completedAt)}</p> : null}
        <fieldset disabled={pending} className="grid min-w-0 gap-3">
          <label className="block min-w-0">
            <span className={labelClass}>할 일 <span className="text-[var(--danger)]">(필수)</span></span>
            <input data-modal-initial-focus name="title" value={values.title} onChange={(event) => changeValue("title", event.target.value)} required maxLength={160} placeholder="예: 다음 회의 전 활동 계획안 정리" className={fieldClass} />
          </label>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className={labelClass}>담당 직원 <span className="text-[var(--danger)]">(필수)</span></span>
              <select name="assigneeId" value={values.assigneeId} onChange={(event) => changeValue("assigneeId", event.target.value)} required disabled={Boolean(task?.completedAt)} aria-describedby={task?.completedAt ? assigneeHelpId : undefined} className={fieldClass}>
                <option value="">직원 선택</option>
                {task && !currentAssigneeAvailable ? <option value={task.assigneeId}>{task.assigneeName} · {task.departmentName}</option> : null}
                {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name} · {assignee.departmentName}</option>)}
              </select>
              {task?.completedAt ? <><input type="hidden" name="assigneeId" value={task.assigneeId} /><span id={assigneeHelpId} className="mt-1 block text-xs text-[var(--text-muted)]">완료한 업무의 담당자는 변경할 수 없습니다.</span></> : null}
            </label>
            <label className="block min-w-0">
              <span className={labelClass}>기한 <span className="font-normal">(선택)</span></span>
              <DatePickerInput name="dueDate" value={values.dueDate} onChange={(event) => changeValue("dueDate", event.target.value)} className={fieldClass} />
            </label>
          </div>
          <label className="block min-w-0">
            <span className={labelClass}>회의명 <span className="font-normal">(선택)</span></span>
            <input name="meetingTitle" value={values.meetingTitle} onChange={(event) => changeValue("meetingTitle", event.target.value)} maxLength={160} placeholder="예: 9월 7일 주간 회의" className={fieldClass} />
          </label>
          <label className="block min-w-0">
            <span className={labelClass}>상세 내용 <span className="font-normal">(선택)</span></span>
            <textarea data-modal-plain-body="true" name="description" value={values.description} onChange={(event) => changeValue("description", event.target.value)} maxLength={2000} rows={4} placeholder="결과물, 참고 사항 등 담당자가 확인할 내용을 적어 주세요." className={`${fieldClass} h-auto resize-y py-2 leading-6`} />
          </label>
        </fieldset>
        {!task && assignees.length === 0 ? <p className="mt-3 text-sm text-[var(--danger)]">담당자로 지정할 재직 직원이 없습니다. 직원 정보를 먼저 등록해 주세요.</p> : null}
        {state.error?.startsWith("다른 창에서") && onReload ? (
          <div className="mt-3 rounded-md border border-[var(--border)] p-3">
            <p className="text-xs leading-5 text-[var(--text-muted)]">입력 내용은 이 창에 보존되어 있습니다. 필요한 내용을 복사한 뒤 목록을 새로고침하고 해당 할 일을 다시 열어 최신 내용을 확인해 주세요.</p>
            <button type="button" disabled={pending} onClick={onReload} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "mt-2 min-h-11 px-3 text-sm")}>창을 닫고 목록 새로고침</button>
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className={buttonClass(buttonStyles.base, buttonStyles.neutral, "min-h-11 px-4 text-sm")}>취소</button>
          <button type="submit" disabled={pending || (!task && assignees.length === 0)} className={buttonClass(buttonStyles.base, buttonStyles.save, "min-h-11 px-4 text-sm")}>{pending ? "저장 중…" : task ? "변경 저장" : "할 일 등록"}</button>
        </div>
      </form>
    </AppModal>
  );
}
