"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import {
  createYouthStudyConceptAction,
  deleteYouthStudyConceptAction,
  toggleYouthStudyConceptCheckAction,
} from "@/app/youth/learning-progress/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
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
  youths: Array<{ id: string; name: string }>;
  concepts: YouthStudyConcept[];
  checks: YouthStudyConceptCheck[];
};

export function YouthSubjectProgressBoard({
  youths,
  concepts,
  checks,
}: YouthSubjectProgressBoardProps) {
  const [selectedSubject, setSelectedSubject] = useState<YouthStudySubject>(
    youthStudySubjects[0].value,
  );
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
                    youths={youths}
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
  subject,
  subunit,
  youths,
  concepts,
  checkedKeys,
}: {
  subject: YouthStudySubject;
  subunit: YouthStudySubunit;
  youths: Array<{ id: string; name: string }>;
  concepts: YouthStudyConcept[];
  checkedKeys: Set<string>;
}) {
  const [toggleError, setToggleError] = useState("");
  const createConceptAction = createYouthStudyConceptAction.bind(
    null,
    subject,
    subunit.id,
  );
  const [formState, formAction, formPending] = useActionState(
    createConceptAction,
    initialFormState,
  );

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
                    <form
                      action={deleteYouthStudyConceptAction.bind(
                        null,
                        concept.id,
                      )}
                    >
                      <ConfirmSubmitButton
                        message="이 개념을 삭제하시겠습니까? 학생들의 체크 기록도 함께 삭제됩니다."
                        type="submit"
                        className={buttonClass(
                          buttonStyles.base,
                          buttonStyles.dangerOutline,
                          "h-7 whitespace-nowrap px-2.5 text-xs",
                        )}
                      >
                        삭제
                      </ConfirmSubmitButton>
                    </form>
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

      <form
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
            placeholder="예: 소수는 무엇인가?"
            className="h-9 w-full min-w-0 flex-1 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          />
          <button
            type="submit"
            disabled={formPending}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.save,
              "h-9 shrink-0 px-4 text-sm",
            )}
          >
            {formPending ? "추가 중" : "개념 추가"}
          </button>
        </div>

        {formState.error ? (
          <p className="mt-2 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
            {formState.error}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function YouthStudyConceptCheckBox({
  conceptId,
  youth,
  checked,
  conceptContent,
  onToggleError,
}: {
  conceptId: string;
  youth: { id: string; name: string };
  checked: boolean;
  conceptContent: string;
  onToggleError: (error: string) => void;
}) {
  const [togglePending, startToggleTransition] = useTransition();

  return (
    <input
      type="checkbox"
      aria-label={`${youth.name} - ${conceptContent}`}
      checked={checked}
      disabled={togglePending}
      onChange={(event) => {
        const nextChecked = event.target.checked;

        startToggleTransition(async () => {
          const result = await toggleYouthStudyConceptCheckAction(
            conceptId,
            youth.id,
            nextChecked,
          );

          onToggleError(result.ok ? "" : result.error);
        });
      }}
      className="size-4 accent-[#196b69]"
    />
  );
}
