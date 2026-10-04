"use client";
import { useYouthActivityLeaveGuard } from "@/lib/youth-activity-leave";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  createYouthStudyConceptClientAction,
  deleteYouthStudyConceptAction,
  deleteYouthStudyConceptClientAction,
  toggleYouthStudyConceptCheckAction,
} from "@/app/youth/learning-progress/actions";
import { YouthActivityDeleteForm } from "@/components/youth-activity-controls";
import { getYouthActivityReceiptAction, getYouthConceptCheckBaselineAction } from "@/app/youth/activity-actions";
import { newYouthActivityAttempt, runYouthActivity, invalidateYouthActivity, type ActivityAttempt } from "@/lib/youth-activity-client";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  createYouthStudyConceptCheckKey,
  getYouthStudyCurriculum,
  youthStudyConceptMaxLength,
  youthStudySubjects,
  type YouthStudyConcept,
  type YouthStudyConceptCheck,
  type YouthStudyConceptFormState,
  type YouthStudySubject,
  type YouthStudySubunit,
} from "@/lib/youth-subject-progress-core";

const initialFormState: YouthStudyConceptFormState = {};

type YouthSubjectProgressBoardProps = {
  actorId?: string;
  canManage?: boolean;
  youths: Array<{ id: string; name: string; updatedAt?: string }>;
  concepts: YouthStudyConcept[];
  checks: YouthStudyConceptCheck[];
};

export function YouthSubjectProgressBoard(props: YouthSubjectProgressBoardProps) { return <YouthSubjectProgressBoardContent key={props.actorId ?? "legacy"} {...props} />; }
function YouthSubjectProgressBoardContent({
  actorId = "",
  canManage = true,
  youths,
  concepts,
  checks,
}: YouthSubjectProgressBoardProps) {
  const [selectedSubject, setSelectedSubject] = useState<YouthStudySubject>(
    youthStudySubjects[0].value,
  );
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const visibleYouths = youths.filter(youth => !unavailable.includes(youth.id)).map(youth => ({ ...youth, updatedAt: tokens[youth.id] ?? youth.updatedAt }));
  const checkedKeys = useMemo(
    () =>
      new Set(
        checks.map((check) =>
          createYouthStudyConceptCheckKey(check.conceptId, check.youthId),
        ),
      ),
    [checks],
  );

  if (youths.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-8 text-sm text-[#697386]">
        등록된 학생이 없습니다. 학생 명단에서 학생을 먼저 등록해 주세요.
      </p>
    );
  }

  const activeSubject =
    youthStudySubjects.find((subject) => subject.value === selectedSubject) ??
    youthStudySubjects[0];
  const subjectConcepts = concepts.filter(
    (concept) => concept.subject === activeSubject.value,
  );
  const curriculum = getYouthStudyCurriculum(activeSubject.value);

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="과목 선택"
        className="flex flex-wrap gap-2"
      >
        {youthStudySubjects.map((subject) => {
          const active = subject.value === activeSubject.value;

          return (
            <button
              key={subject.value}
              id={`subject-${subject.value}-tab`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`subject-${subject.value}-panel`}
              onClick={() => setSelectedSubject(subject.value)}
              className={[
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-md border px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#d7eceb]",
                active
                  ? "border-[#196b69] bg-[#196b69] text-white"
                  : "border-[#cfd6e3] bg-white text-[#394150] hover:bg-[#f7f9fc]",
              ].join(" ")}
            >
              {subject.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`subject-${activeSubject.value}-panel`}
        aria-labelledby={`subject-${activeSubject.value}-tab`}
        className="flex flex-col gap-8"
      >
        {curriculum.map((semester) => (
          <section key={semester.id} className="flex flex-col gap-5">
            <h2 className="rounded-md border border-[#196b69] bg-[#eef7f6] px-4 py-3 text-center text-base font-bold text-[#196b69]">
              {semester.label}
            </h2>

            {semester.units.map((unit) => (
              <div key={unit.id} className="flex flex-col gap-3">
                <h3 className="border-l-4 border-[#196b69] pl-3 text-base font-semibold text-[#16181d]">
                  {unit.label}
                </h3>

                {unit.subunits.map((subunit) => (
                  <YouthStudySubunitCard
                    key={subunit.id}
                    subject={activeSubject.value}
                    subunit={subunit}
                    youths={visibleYouths}
                    actorId={actorId}
                    canManage={canManage}
                    onYouthToken={(id, token) => setTokens(current => ({ ...current, [id]: token }))}
                    onYouthUnavailable={id => setUnavailable(current => [...current, id])}
                    concepts={subjectConcepts.filter(
                      (concept) => concept.subunitId === subunit.id,
                    )}
                    checkedKeys={checkedKeys}
                  />
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function YouthStudySubunitCard({
  actorId, canManage, onYouthToken, onYouthUnavailable,
  subject,
  subunit,
  youths,
  concepts,
  checkedKeys,
}: {
  actorId: string; canManage: boolean; onYouthToken: (id: string, token: string) => void; onYouthUnavailable: (id: string) => void;
  subject: YouthStudySubject;
  subunit: YouthStudySubunit;
  youths: Array<{ id: string; name: string; updatedAt?: string }>;
  concepts: YouthStudyConcept[];
  checkedKeys: Set<string>;
}) {
  const [toggleError, setToggleError] = useState("");
  const createAttempt = useRef<ActivityAttempt<{ subject: string; subunitId: string; content: string }> | null>(null), createAlive = useRef(true), createError = useRef<HTMLParagraphElement>(null);
  const [createUnknown, setCreateUnknown] = useState(false), [createBlocked, setCreateBlocked] = useState(false);
  useEffect(() => { createAlive.current = true; return () => { createAlive.current = false; invalidateYouthActivity(createAttempt.current); }; }, []);
  const createConceptAction = async (_previous: YouthStudyConceptFormState, formData: FormData): Promise<YouthStudyConceptFormState> => {
    if (!canManage || createBlocked) return { error: "최신 목록을 확인하세요." };
    const content = String(formData.get("content") ?? "");
    if (!createAttempt.current) createAttempt.current = newYouthActivityAttempt("concept.create", { subject, subunitId: subunit.id, content });
    const attempt = createAttempt.current;
    const outcome = await runYouthActivity(attempt, (payload, key) => createYouthStudyConceptClientAction(payload, key, actorId), key => getYouthActivityReceiptAction(key, actorId));
    if (!createAlive.current || outcome.kind === "blocked") return { values: { content } };
    if (outcome.kind === "committed" || outcome.result.ok) { if (outcome.kind === "committed") window.location.reload(); createAttempt.current = null; setCreateUnknown(false); return { resetKey: crypto.randomUUID(), success: "개념 등록 요청을 확인했습니다." }; }
    setCreateUnknown(attempt.unknown); setCreateBlocked(attempt.conflict || [401,403,404].includes(outcome.result.status ?? 0));
    if (!attempt.unknown && !attempt.conflict) createAttempt.current = null;
    return { error: outcome.result.error, values: { content: attempt.payload.content } };
  };
  const [formState, formAction, formPending] = useActionState(
    createConceptAction,
    initialFormState,
  );

  useEffect(() => { if (formState.error) createError.current?.focus(); }, [formState.error]);
  useYouthActivityLeaveGuard({ dirty: createUnknown || Boolean(formState.values?.content), pending: formPending, discard: () => invalidateYouthActivity(createAttempt.current) });
  return (
    <section className="rounded-md border border-[#d9dee7] bg-white shadow-sm">
      <h4 className="border-b border-[#eef1f5] bg-[#f7f9fc] px-4 py-2.5 text-sm font-semibold text-[#196b69]">
        {subunit.label}
      </h4>

      {concepts.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#eef1f5] text-xs text-[#697386]">
                <th className="w-full px-4 py-2 text-left font-semibold">
                  개념
                </th>
                {youths.map((youth) => (
                  <th
                    key={youth.id}
                    className="whitespace-nowrap px-3 py-2 text-center font-semibold"
                  >
                    {youth.name}
                  </th>
                ))}
                <th className="px-3 py-2" aria-label="개념 삭제" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef1f5]">
              {concepts.map((concept) => (
                <tr key={concept.id}>
                  <td className="px-4 py-2.5 align-middle leading-6 text-[#394150]">
                    <span className="break-words [overflow-wrap:anywhere]">
                      {concept.content}
                    </span>
                  </td>
                  {youths.map((youth) => (
                    <td
                      key={youth.id}
                      className="px-3 py-2.5 text-center align-middle"
                    >
                      <YouthStudyConceptCheckBox
                        conceptId={concept.id}
                        conceptUpdatedAt={concept.updatedAt}
                        actorId={actorId}
                        canManage={canManage}
                        onYouthToken={onYouthToken}
                        onYouthUnavailable={onYouthUnavailable}
                        youth={youth}
                        checked={checkedKeys.has(
                          createYouthStudyConceptCheckKey(
                            concept.id,
                            youth.id,
                          ),
                        )}
                        conceptContent={concept.content}
                        onToggleError={setToggleError}
                      />
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle">
                    {canManage ? <YouthActivityDeleteForm key={`${actorId}:${concept.id}`} operation="concept.delete" actorId={actorId} id={concept.id} expectedUpdatedAt={concept.updatedAt} message="이 개념을 삭제하시겠습니까? 모든 학생의 체크 기록도 함께 삭제되며 복구할 수 없습니다." dispatch={(id, baseline) => deleteYouthStudyConceptClientAction(id, baseline)} fallbackAction={deleteYouthStudyConceptAction.bind(null, concept.id, { expectedUpdatedAt: concept.updatedAt ?? "", expectedActorId: actorId })} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mx-4 my-4 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-4 text-sm text-[#697386]">
          아직 등록된 개념이 없습니다. 이 소단원에서 숙지해야 하는 개념을
          추가해 보세요.
        </p>
      )}

      {toggleError ? (
        <p className="mx-4 mb-3 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
          {toggleError}
        </p>
      ) : null}

      {canManage ? <form
        key={formState.resetKey ?? "draft"}
        action={formAction}
        className="border-t border-[#eef1f5] px-4 py-3"
      >
        <div className="flex gap-2">
          <input
            type="text"
            name="content"
            required
            maxLength={youthStudyConceptMaxLength}
            defaultValue={formState.values?.content ?? ""}
            disabled={formPending || createUnknown || createBlocked}
            placeholder="예: 소수는 무엇인가?"
            className="h-9 w-full min-w-0 flex-1 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          />
          <button
            type="submit"
            disabled={formPending || createBlocked}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.save,
              "h-9 shrink-0 px-4 text-sm",
            )}
          >
            {createUnknown ? "같은 요청 결과 확인" : formPending ? "추가 중" : "개념 추가"}
          </button>
        </div>

        {formState.error ? (
          <p ref={createError} tabIndex={-1} role="alert" className="mt-2 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
            {formState.error}
          </p>
        ) : null}
      </form> : null}
      {createBlocked ? <button type="button" className="min-h-11 px-3 text-sm" onClick={() => window.location.reload()}>최신 목록 확인</button> : null}
    </section>
  );
}

function YouthStudyConceptCheckBox({ conceptId, conceptUpdatedAt, actorId, canManage, youth, checked, conceptContent, onToggleError, onYouthToken, onYouthUnavailable }: { conceptId: string; conceptUpdatedAt?: string; actorId: string; canManage: boolean; youth: { id: string; name: string; updatedAt?: string }; checked: boolean; conceptContent: string; onToggleError: (error: string) => void; onYouthToken: (id: string, token: string) => void; onYouthUnavailable: (id: string) => void }) {
  const [togglePending, startToggleTransition] = useTransition(), [currentChecked, setCurrentChecked] = useState(checked), [previousChecked, setPreviousChecked] = useState(checked), [recovery, setRecovery] = useState<"idle" | "unknown" | "conflict">("idle"), [blocked, setBlocked] = useState(false);
  if (checked !== previousChecked) { setPreviousChecked(checked); setCurrentChecked(checked); }
  const busy = useRef(false), alive = useRef(true), attemptRef = useRef<ActivityAttempt<{ checked: boolean; expectedYouthUpdatedAt: string; expectedConceptUpdatedAt: string }> | null>(null), fence = useRef<{ youth: string; concept: string } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; invalidateYouthActivity(attemptRef.current); }; }, []);
  useYouthActivityLeaveGuard({ dirty: recovery !== "idle", pending: togglePending, discard: () => invalidateYouthActivity(attemptRef.current) });
  function toggle(desired: boolean) {
    if (busy.current || recovery === "conflict" || blocked || !canManage) return;
    if (!attemptRef.current) attemptRef.current = newYouthActivityAttempt("concept.check", { checked: desired, expectedYouthUpdatedAt: fence.current?.youth ?? youth.updatedAt ?? "", expectedConceptUpdatedAt: fence.current?.concept ?? conceptUpdatedAt ?? "" });
    const attempt = attemptRef.current; busy.current = true;
    startToggleTransition(async () => {
      try {
        const outcome = await runYouthActivity(attempt, (payload, requestId) => toggleYouthStudyConceptCheckAction(conceptId, youth.id, payload.checked, { ...payload, requestId, expectedActorId: actorId }), key => getYouthActivityReceiptAction(key, actorId));
        if (!alive.current || attemptRef.current !== attempt || outcome.kind === "blocked") return;
        if (outcome.kind === "committed") { window.location.reload(); return; }
        if (!outcome.result.ok) { onToggleError(outcome.result.error); setRecovery(attempt.conflict ? "conflict" : attempt.unknown ? "unknown" : "idle"); if ([401,403,404].includes(outcome.result.status ?? 0)) { setBlocked(true); onYouthUnavailable(youth.id); } if (!attempt.unknown && !attempt.conflict) attemptRef.current = null; return; }
        setCurrentChecked(outcome.result.data.isChecked); if (outcome.result.data.youthUpdatedAt) onYouthToken(youth.id, outcome.result.data.youthUpdatedAt); attemptRef.current = null; fence.current = null; setRecovery("idle"); onToggleError("");
      } finally { busy.current = false; }
    });
  }
  async function recover() {
    if (busy.current) return; busy.current = true;
    try { const result = await getYouthConceptCheckBaselineAction(youth.id, conceptId, actorId); if (!alive.current) return; if (!result.ok) { onToggleError(result.error); if ([401,403,404].includes(result.status)) { setBlocked(true); onYouthUnavailable(youth.id); } return; } setCurrentChecked(result.data.checked); onYouthToken(youth.id, result.data.youthUpdatedAt); if (!window.confirm("최신 숙지 상태를 확인했습니다. 이 기준으로 다시 변경할 준비를 하시겠습니까? 아직 변경하지 않습니다.")) return; fence.current = { youth: result.data.youthUpdatedAt, concept: result.data.conceptUpdatedAt }; invalidateYouthActivity(attemptRef.current); attemptRef.current = null; setRecovery("idle"); onToggleError(""); } finally { busy.current = false; }
  }
  return <div className="flex min-h-11 min-w-11 flex-col items-center justify-center">
    <input type="checkbox" aria-label={`${youth.name} - ${conceptContent}`} checked={currentChecked} disabled={togglePending || recovery !== "idle" || blocked || !canManage || !youth.updatedAt || !conceptUpdatedAt} onChange={event => toggle(event.target.checked)} className="size-4 accent-[var(--brand)]" />
    {recovery === "unknown" ? <button type="button" className="min-h-11 px-2 text-xs" disabled={togglePending} onClick={() => toggle(currentChecked)}>같은 체크 요청 확인</button> : null}
    {recovery === "conflict" ? <button type="button" className="min-h-11 px-2 text-xs" disabled={togglePending} onClick={recover}>최신 상태 확인</button> : null}
  </div>;
}
