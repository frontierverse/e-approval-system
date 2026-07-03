import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { QuestionBankArchiveBoard } from "@/components/question-bank-archive-board";
import {
  createQuestionBankProblemAction,
  createQuestionBankUnitAction,
  uploadQuestionBankPdfAction,
} from "@/app/question-bank/actions";
import { requireUser } from "@/lib/auth";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  getQuestionBankDashboard,
  type QuestionBankUnitListItem,
} from "@/lib/question-bank";
import {
  questionBankDifficultyOptions,
  questionBankProblemTypeLabels,
  questionBankProblemTypes,
} from "@/lib/question-bank-core";

type SearchParamValue = string | string[] | undefined;
type QuestionBankTab = "add" | "archive";

type QuestionBankPageProps = {
  searchParams: Promise<{
    pdfError?: SearchParamValue;
    problemError?: SearchParamValue;
    tab?: SearchParamValue;
    unitError?: SearchParamValue;
  }>;
};

export default async function QuestionBankPage({
  searchParams,
}: QuestionBankPageProps) {
  await requireUser();
  const params = await searchParams;
  const activeTab = getSelectedQuestionBankTab(params.tab);
  const { pdfs, units } = await getQuestionBankDashboard();
  const subunits = units.filter((unit) => unit.parentId);

  return (
    <>
      <PageTitle
        title="문제은행"
        description="단원별 문제를 추가하고 학년·학기별 문제지를 관리합니다."
      />

      <QuestionBankTabs activeTab={activeTab} />

      <div className="mt-6">
        {activeTab === "archive" ? (
          <QuestionBankArchiveBoard pdfs={pdfs} units={units} />
        ) : (
          <QuestionBankAddPanel
            pdfError={getSingleParam(params.pdfError)}
            problemError={getSingleParam(params.problemError)}
            subunits={subunits}
            unitError={getSingleParam(params.unitError)}
            units={units}
          />
        )}
      </div>
    </>
  );
}

function QuestionBankAddPanel({
  pdfError,
  problemError,
  subunits,
  unitError,
  units,
}: {
  pdfError?: string;
  problemError?: string;
  subunits: QuestionBankUnitListItem[];
  unitError?: string;
  units: QuestionBankUnitListItem[];
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <aside className="space-y-6">
        <QuestionBankUnitForm error={unitError} units={units} />
        <QuestionBankUnitSummary units={units} />
      </aside>

      <div className="space-y-6">
        <QuestionBankProblemForm
          error={problemError}
          subunits={subunits}
          units={units}
        />
        <QuestionBankPdfUploadForm
          error={pdfError}
          subunits={subunits}
          units={units}
        />
      </div>
    </div>
  );
}

function QuestionBankTabs({ activeTab }: { activeTab: QuestionBankTab }) {
  return (
    <nav aria-label="문제은행 항목" className="border-b border-[#d9dee7]">
      <div className="flex gap-2 overflow-x-auto">
        <QuestionBankTabLink
          active={activeTab === "add"}
          href="/question-bank"
          label="문제 추가"
        />
        <QuestionBankTabLink
          active={activeTab === "archive"}
          href="/question-bank?tab=archive"
          label="문제지 보관함"
        />
      </div>
    </nav>
  );
}

function QuestionBankTabLink({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      href={href}
      className={[
        "relative flex h-12 min-w-32 items-center justify-center rounded-t-md border border-transparent px-4 text-sm font-semibold transition-colors",
        active
          ? "border-[#c9dddb] border-b-white bg-white text-[#0f5553]"
          : "text-[#394150] hover:border-[#c7dfdc] hover:bg-[#e7f5f3] hover:text-[#12343b]",
      ].join(" ")}
    >
      {label}
      <span
        aria-hidden="true"
        className={[
          "absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[#196b69] transition-opacity",
          active ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />
    </Link>
  );
}

function QuestionBankUnitForm({
  error,
  units,
}: {
  error?: string;
  units: QuestionBankUnitListItem[];
}) {
  return (
    <form
      action={createQuestionBankUnitAction}
      className="rounded-md border border-[#d9dee7] bg-white p-5"
    >
      <h2 className="text-base font-semibold text-[#16181d]">단원 등록</h2>
      <div className="mt-4 grid gap-4">
        <label>
          <span className="text-sm font-semibold text-[#394150]">과목</span>
          <input
            name="subject"
            defaultValue="중학수학"
            maxLength={40}
            className={inputClassName}
          />
        </label>

        <label>
          <span className="text-sm font-semibold text-[#394150]">
            학년/과정
          </span>
          <input
            name="gradeLevel"
            defaultValue="1학년"
            maxLength={40}
            className={inputClassName}
          />
        </label>

        <label>
          <span className="text-sm font-semibold text-[#394150]">
            상위 단원
          </span>
          <select name="parentId" defaultValue="" className={inputClassName}>
            <option value="">없음</option>
            {units
              .filter((unit) => !unit.parentId)
              .map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {formatUnitLabel(unit)}
                </option>
              ))}
          </select>
        </label>

        <label>
          <span className="text-sm font-semibold text-[#394150]">단원명</span>
          <input
            name="name"
            placeholder="예: 1. 소인수분해"
            maxLength={80}
            className={inputClassName}
          />
        </label>

        <FormError error={error} />

        <PendingSubmitButton
          type="submit"
          pendingLabel="단원 저장 중"
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.create,
            "h-10 px-4 text-sm",
          )}
        >
          단원 저장
        </PendingSubmitButton>
      </div>
    </form>
  );
}

function QuestionBankProblemForm({
  error,
  subunits,
  units,
}: {
  error?: string;
  subunits: QuestionBankUnitListItem[];
  units: QuestionBankUnitListItem[];
}) {
  const hasSubunits = subunits.length > 0;

  return (
    <form
      action={createQuestionBankProblemAction}
      className="rounded-md border border-[#d9dee7] bg-white p-5"
    >
      <div>
        <h2 className="text-base font-semibold text-[#16181d]">문제 추가</h2>
        <p className="mt-1 text-sm leading-6 text-[#697386]">
          단원별로 객관식, 단답형, 서술형 문제를 저장합니다.
        </p>
      </div>

      <div className="mt-4 grid gap-4">
        <label>
          <span className="text-sm font-semibold text-[#394150]">중단원</span>
          <select
            name="unitId"
            defaultValue={subunits[0]?.id ?? ""}
            disabled={!hasSubunits}
            className={inputClassName}
          >
            {subunits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {formatSubunitLabel(unit, units)} · 문제 {unit.problemCount}개
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-sm font-semibold text-[#394150]">
              문제 유형
            </span>
            <select
              name="problemType"
              defaultValue="multiple-choice"
              className={inputClassName}
            >
              {questionBankProblemTypes.map((type) => (
                <option key={type} value={type}>
                  {questionBankProblemTypeLabels[type]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="text-sm font-semibold text-[#394150]">난이도</span>
            <select name="difficulty" defaultValue="2" className={inputClassName}>
              {questionBankDifficultyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          <span className="text-sm font-semibold text-[#394150]">
            문제 내용
          </span>
          <textarea
            name="body"
            placeholder="예: 다음 방정식 2x + 3 = 7을 풀어라."
            maxLength={2000}
            rows={5}
            className={textareaClassName}
          />
        </label>

        <label>
          <span className="text-sm font-semibold text-[#394150]">보기</span>
          <textarea
            name="choices"
            placeholder={"객관식 보기만 줄바꿈으로 입력\n예: x = 1\nx = 2"}
            maxLength={1000}
            rows={4}
            className={textareaClassName}
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-sm font-semibold text-[#394150]">정답</span>
            <input
              name="answer"
              placeholder="예: x = 2"
              maxLength={200}
              className={inputClassName}
            />
          </label>

          <label>
            <span className="text-sm font-semibold text-[#394150]">
              해설 요약
            </span>
            <input
              name="explanation"
              placeholder="예: 양변에서 3을 빼고 2로 나눈다."
              maxLength={2000}
              className={inputClassName}
            />
          </label>
        </div>

        <FormError error={error} />

        {!hasSubunits ? (
          <p className="rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-3 py-3 text-sm text-[#697386]">
            문제 추가 전에 중단원을 먼저 등록하세요.
          </p>
        ) : null}

        <div>
          <PendingSubmitButton
            type="submit"
            disabled={!hasSubunits}
            pendingLabel="문제 저장 중"
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.create,
              "h-10 px-4 text-sm",
            )}
          >
            문제 저장
          </PendingSubmitButton>
        </div>
      </div>
    </form>
  );
}

function QuestionBankPdfUploadForm({
  error,
  subunits,
  units,
}: {
  error?: string;
  subunits: QuestionBankUnitListItem[];
  units: QuestionBankUnitListItem[];
}) {
  const hasSubunits = subunits.length > 0;

  return (
    <form
      action={uploadQuestionBankPdfAction}
      className="rounded-md border border-[#d9dee7] bg-white p-5"
    >
      <div>
        <h2 className="text-base font-semibold text-[#16181d]">
          PDF 문제지 추가
        </h2>
        <p className="mt-1 text-sm leading-6 text-[#697386]">
          PDF 파일은 반드시 중단원에 연결됩니다. 한 번에 여러 개를 올릴 수 있습니다.
        </p>
      </div>

      <div className="mt-4 grid gap-4">
        <label>
          <span className="text-sm font-semibold text-[#394150]">중단원</span>
          <select
            name="unitId"
            defaultValue={subunits[0]?.id ?? ""}
            disabled={!hasSubunits}
            className={inputClassName}
          >
            {subunits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {formatSubunitLabel(unit, units)} · PDF {unit.pdfCount}개
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-sm font-semibold text-[#394150]">
              문제지 제목
            </span>
            <input
              name="title"
              placeholder="비워두면 파일명으로 저장"
              maxLength={100}
              className={inputClassName}
            />
          </label>

          <label>
            <span className="text-sm font-semibold text-[#394150]">
              설명/메모
            </span>
            <input
              name="description"
              placeholder="예: 기본 유형, 숙제용, 20문항"
              maxLength={200}
              className={inputClassName}
            />
          </label>
        </div>

        <label>
          <span className="text-sm font-semibold text-[#394150]">PDF 파일</span>
          <input
            name="pdfFiles"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            disabled={!hasSubunits}
            className="mt-2 block w-full rounded-md border border-dashed border-[#b8c1d1] bg-[#fbfcfd] px-3 py-4 text-sm text-[#394150] file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border-0 file:bg-[#196b69] file:px-3 file:text-sm file:font-semibold file:text-white hover:bg-[#f7f9fc]"
          />
        </label>

        <FormError error={error} />

        {!hasSubunits ? (
          <p className="rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-3 py-3 text-sm text-[#697386]">
            PDF 업로드 전에 중단원을 먼저 등록하세요.
          </p>
        ) : null}

        <div>
          <PendingSubmitButton
            type="submit"
            disabled={!hasSubunits}
            pendingLabel="PDF 업로드 중"
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.primary,
              "h-10 px-4 text-sm",
            )}
          >
            PDF 업로드
          </PendingSubmitButton>
        </div>
      </div>
    </form>
  );
}

function QuestionBankUnitSummary({
  units,
}: {
  units: QuestionBankUnitListItem[];
}) {
  const majorUnits = units.filter((unit) => !unit.parentId);

  return (
    <section className="rounded-md border border-[#d9dee7] bg-white p-5">
      <h2 className="text-base font-semibold text-[#16181d]">단원 현황</h2>
      {majorUnits.length > 0 ? (
        <div className="mt-4 space-y-4">
          {majorUnits.map((majorUnit) => {
            const children = units.filter(
              (unit) => unit.parentId === majorUnit.id,
            );

            return (
              <section key={majorUnit.id} aria-label={majorUnit.name}>
                <h3 className="text-sm font-semibold text-[#0f5553]">
                  {majorUnit.name}
                </h3>
                {children.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {children.map((child) => (
                      <li
                        key={child.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 truncate text-[#394150]">
                          {child.name}
                        </span>
                        <span className="shrink-0 rounded-md border border-[#d9dee7] bg-[#f7f9fc] px-2 py-0.5 text-xs font-semibold text-[#697386]">
                          PDF {child.pdfCount}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[#8a95a6]">중단원 없음</p>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm text-[#697386]">
          등록된 단원이 없습니다.
        </p>
      )}
    </section>
  );
}

function FormError({ error }: { error?: string }) {
  return error ? (
    <p className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
      {error}
    </p>
  ) : null;
}

function formatUnitLabel(unit: QuestionBankUnitListItem) {
  return [unit.subject, unit.gradeLevel, unit.name].filter(Boolean).join(" · ");
}

function formatSubunitLabel(
  unit: QuestionBankUnitListItem,
  units: QuestionBankUnitListItem[],
) {
  const parent = units.find((candidate) => candidate.id === unit.parentId);

  return parent ? `${parent.name} · ${unit.name}` : formatUnitLabel(unit);
}

function getSelectedQuestionBankTab(value: SearchParamValue): QuestionBankTab {
  return getSingleParam(value) === "archive" ? "archive" : "add";
}

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const inputClassName =
  "mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:bg-[#f7f9fc] disabled:text-[#8a95a6]";
const textareaClassName =
  "mt-2 w-full rounded-md border border-[#cfd6e3] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:bg-[#f7f9fc] disabled:text-[#8a95a6]";
