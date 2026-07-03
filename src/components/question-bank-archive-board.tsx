"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { deleteQuestionBankPdfAction } from "@/app/question-bank/actions";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { formatFileSize } from "@/lib/file-display";
import {
  inferQuestionBankGradeNumber,
  inferQuestionBankSchoolLevel,
  inferQuestionBankSemester,
  questionBankGradeOptions,
  questionBankSchoolLevelOptions,
  questionBankSemesterOptions,
  type QuestionBankSchoolLevel,
  type QuestionBankSemester,
} from "@/lib/question-bank-core";

export type QuestionBankArchiveUnit = {
  id: string;
  subject: string;
  gradeLevel: string | null;
  name: string;
  parentId: string | null;
  sortOrder: number;
  pdfCount: number;
  problemCount: number;
};

export type QuestionBankArchivePdf = {
  id: string;
  title: string;
  description: string | null;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  unitId: string;
  unitName: string;
  parentUnitName: string | null;
  subject: string;
  gradeLevel: string | null;
  uploadedByName: string | null;
};

type QuestionBankArchiveBoardProps = {
  pdfs: QuestionBankArchivePdf[];
  units: QuestionBankArchiveUnit[];
};

export function QuestionBankArchiveBoard({
  pdfs,
  units,
}: QuestionBankArchiveBoardProps) {
  const [schoolLevel, setSchoolLevel] =
    useState<QuestionBankSchoolLevel>("middle");
  const [grade, setGrade] = useState(1);
  const [semester, setSemester] = useState<QuestionBankSemester>("1학기");
  const [selectedMajorUnitId, setSelectedMajorUnitId] = useState("");
  const [selectedSubunitId, setSelectedSubunitId] = useState("");
  const archiveUnits = useMemo(() => createArchiveUnits(units), [units]);
  const selectedMajorUnits = useMemo(
    () =>
      archiveUnits.filter(
        (unit) =>
          unit.schoolLevel === schoolLevel &&
          unit.grade === grade &&
          unit.semester === semester,
      ),
    [archiveUnits, grade, schoolLevel, semester],
  );
  const selectedMajorUnit =
    selectedMajorUnits.find((unit) => unit.id === selectedMajorUnitId) ?? null;
  const selectedSubunits = selectedMajorUnit?.children ?? [];
  const selectedSubunit =
    selectedSubunits.find((unit) => unit.id === selectedSubunitId) ?? null;
  const selectedSubunitIdForPdfs = selectedSubunit?.id ?? "";
  const selectedPdfs = selectedSubunitIdForPdfs
    ? pdfs.filter((pdf) => pdf.unitId === selectedSubunitIdForPdfs)
    : [];
  const selectedSubunitCount = selectedMajorUnits.reduce(
    (count, unit) => count + unit.children.length,
    0,
  );
  const selectedSchoolLabel =
    questionBankSchoolLevelOptions.find((option) => option.value === schoolLevel)
      ?.label ?? "";
  const selectedPath = [
    selectedSchoolLabel,
    `${grade}학년`,
    semester,
    selectedMajorUnit?.name,
    selectedSubunit?.name,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <section className="overflow-hidden rounded-md border border-[#d9dee7] bg-white">
      <header className="border-b border-[#eef1f5] px-5 py-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#16181d]">
              문제지 보관함
            </h2>
            <p className="mt-1 break-words text-sm text-[#697386] [overflow-wrap:anywhere]">
              {selectedPath}
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-[#394150]">
            대단원 {selectedMajorUnits.length} · 소단원 {selectedSubunitCount}
          </p>
        </div>
      </header>

      <div className="overflow-x-auto">
        <div className="flex min-h-[32rem] min-w-max">
          <FinderColumn title="학교급" widthClassName="w-36">
            {questionBankSchoolLevelOptions.map((option) => (
              <FinderColumnButton
                key={option.value}
                active={option.value === schoolLevel}
                label={option.label}
                onClick={() => {
                  setSchoolLevel(option.value);
                  setGrade(1);
                  setSemester("1학기");
                  setSelectedMajorUnitId("");
                  setSelectedSubunitId("");
                }}
              />
            ))}
          </FinderColumn>

          <FinderColumn title="학년" widthClassName="w-28">
            {questionBankGradeOptions.map((option) => (
              <FinderColumnButton
                key={option.value}
                active={option.value === grade}
                label={option.label}
                onClick={() => {
                  setGrade(option.value);
                  setSemester("1학기");
                  setSelectedMajorUnitId("");
                  setSelectedSubunitId("");
                }}
              />
            ))}
          </FinderColumn>

          <FinderColumn title="학기" widthClassName="w-28">
            {questionBankSemesterOptions.map((option) => (
              <FinderColumnButton
                key={option.value}
                active={option.value === semester}
                label={option.label}
                onClick={() => {
                  setSemester(option.value);
                  setSelectedMajorUnitId("");
                  setSelectedSubunitId("");
                }}
              />
            ))}
          </FinderColumn>

          <FinderColumn title="대단원" widthClassName="w-64">
            {selectedMajorUnits.length > 0 ? (
              selectedMajorUnits.map((unit) => (
                <FinderColumnButton
                  key={unit.id}
                  active={unit.id === selectedMajorUnitId}
                  count={`소단원 ${unit.children.length}`}
                  label={unit.name}
                  onClick={() => {
                    setSelectedMajorUnitId(unit.id);
                    setSelectedSubunitId("");
                  }}
                />
              ))
            ) : (
              <FinderEmpty label="대단원 없음" />
            )}
          </FinderColumn>

          <FinderColumn title="소단원" widthClassName="w-64">
            {selectedMajorUnit ? (
              selectedSubunits.length > 0 ? (
                selectedSubunits.map((unit) => (
                  <FinderColumnButton
                    key={unit.id}
                    active={unit.id === selectedSubunitId}
                    count={`PDF ${unit.pdfCount}`}
                    label={unit.name}
                    onClick={() => setSelectedSubunitId(unit.id)}
                  />
                ))
              ) : (
                <FinderEmpty label="소단원 없음" />
              )
            ) : (
              <FinderEmpty label="대단원 미선택" />
            )}
          </FinderColumn>

          <FinderPdfColumn
            pdfs={selectedPdfs}
            selectedSubunit={selectedSubunit}
          />
        </div>
      </div>
    </section>
  );
}

function FinderColumn({
  children,
  title,
  widthClassName = "w-60",
}: {
  children: React.ReactNode;
  title: string;
  widthClassName?: string;
}) {
  return (
    <section
      className={[
        "shrink-0 border-r border-[#eef1f5] bg-white",
        widthClassName,
      ].join(" ")}
    >
      <header className="sticky top-0 z-10 border-b border-[#eef1f5] bg-[#fbfcfd] px-3 py-2">
        <h3 className="text-xs font-semibold text-[#697386]">{title}</h3>
      </header>
      <div className="p-2">{children}</div>
    </section>
  );
}

function FinderColumnButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
        active
          ? "bg-[#196b69] text-white"
          : "text-[#394150] hover:bg-[#eef7f6] hover:text-[#0f5553]",
      ].join(" ")}
    >
      <span className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]">
        {label}
      </span>
      {count ? (
        <span
          className={[
            "shrink-0 text-xs font-semibold",
            active ? "text-[#d7eceb]" : "text-[#8a95a6]",
          ].join(" ")}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function FinderPdfColumn({
  pdfs,
  selectedSubunit,
}: {
  pdfs: QuestionBankArchivePdf[];
  selectedSubunit: ArchiveChildUnit | null;
}) {
  return (
    <section className="w-[30rem] shrink-0 bg-white">
      <header className="sticky top-0 z-10 border-b border-[#eef1f5] bg-[#fbfcfd] px-3 py-2">
        <h3 className="text-xs font-semibold text-[#697386]">
          {selectedSubunit ? `문제지 ${pdfs.length}` : "문제지"}
        </h3>
      </header>

      {!selectedSubunit ? (
        <FinderEmpty label="소단원 미선택" />
      ) : pdfs.length > 0 ? (
        <ul className="divide-y divide-[#eef1f5]">
          {pdfs.map((pdf) => (
            <li key={pdf.id} className="px-4 py-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className={subtleBadgeClassName}>
                  {pdf.parentUnitName ?? pdf.subject}
                </span>
                <span className={subtleBadgeClassName}>{pdf.unitName}</span>
                <span className="text-xs font-medium text-[#697386]">
                  {formatFileSize(pdf.size)}
                </span>
              </div>
              <p className="mt-2 break-words text-sm font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                {pdf.title}
              </p>
              <p className="mt-1 text-xs text-[#697386]">
                {pdf.uploadedByName ?? "업로더 정보 없음"} ·{" "}
                {formatDateTime(pdf.createdAt)}
              </p>
              {pdf.description ? (
                <p className="mt-2 break-words text-sm leading-6 text-[#394150] [overflow-wrap:anywhere]">
                  {pdf.description}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/question-bank/pdfs/${pdf.id}/preview`}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.neutral,
                    "h-9 px-3 text-sm",
                  )}
                >
                  열기
                </Link>
                <Link
                  href={`/question-bank/pdfs/${pdf.id}`}
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.neutral,
                    "h-9 px-3 text-sm",
                  )}
                >
                  다운로드
                </Link>
                <form action={deleteQuestionBankPdfAction.bind(null, pdf.id)}>
                  <ConfirmSubmitButton
                    type="submit"
                    message="이 PDF 문제지를 삭제할까요?"
                    className={buttonClass(
                      buttonStyles.base,
                      buttonStyles.dangerOutline,
                      "h-9 px-3 text-sm",
                    )}
                  >
                    삭제
                  </ConfirmSubmitButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <FinderEmpty label="PDF 없음" />
      )}
    </section>
  );
}

function FinderEmpty({ label }: { label: string }) {
  return (
    <p className="px-3 py-6 text-sm font-medium text-[#8a95a6]">{label}</p>
  );
}

type ArchiveChildUnit = QuestionBankArchiveUnit;

type ArchiveMajorUnit = QuestionBankArchiveUnit & {
  children: ArchiveChildUnit[];
  grade: number | null;
  schoolLevel: QuestionBankSchoolLevel;
  semester: QuestionBankSemester;
};

function createArchiveUnits(
  units: QuestionBankArchiveUnit[],
): ArchiveMajorUnit[] {
  const childUnitsByParentId = new Map<string, QuestionBankArchiveUnit[]>();

  for (const unit of units) {
    if (!unit.parentId) {
      continue;
    }

    const childUnits = childUnitsByParentId.get(unit.parentId) ?? [];
    childUnits.push(unit);
    childUnitsByParentId.set(unit.parentId, childUnits);
  }

  const majorUnits = units.filter((unit) => !unit.parentId);
  const majorUnitContexts = majorUnits.map((unit) => {
    const grade = inferQuestionBankGradeNumber(unit.gradeLevel);
    const schoolLevel = inferQuestionBankSchoolLevel({
      gradeLevel: unit.gradeLevel,
      subject: unit.subject,
    });

    return {
      grade,
      schoolLevel,
      unit,
    };
  });

  return majorUnitContexts.map(({ grade, schoolLevel, unit }) => {
    const siblingUnits = majorUnitContexts.filter(
      (context) =>
        context.grade === grade && context.schoolLevel === schoolLevel,
    );

    return {
      ...unit,
      children: childUnitsByParentId.get(unit.id) ?? [],
      grade,
      schoolLevel,
      semester: inferQuestionBankSemester({
        name: unit.name,
        siblingCount: siblingUnits.length,
        siblingIndex: siblingUnits.findIndex(
          (context) => context.unit.id === unit.id,
        ),
        sortOrder: unit.sortOrder,
      }),
    };
  });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

const subtleBadgeClassName =
  "inline-flex h-7 items-center rounded-full border border-[#d9dee7] bg-[#f7f9fc] px-2.5 text-xs font-semibold text-[#394150]";
