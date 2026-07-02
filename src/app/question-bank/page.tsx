import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PageTitle } from "@/components/page-title";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  createQuestionBankUnitAction,
  deleteQuestionBankPdfAction,
  uploadQuestionBankPdfAction,
} from "@/app/question-bank/actions";
import { requireUser } from "@/lib/auth";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  getQuestionBankDashboard,
  type QuestionBankPdfListItem,
  type QuestionBankUnitListItem,
} from "@/lib/question-bank";
import { formatFileSize } from "@/lib/file-display";

type QuestionBankPageProps = {
  searchParams: Promise<{
    pdfError?: string | string[];
    unitError?: string | string[];
  }>;
};

export default async function QuestionBankPage({
  searchParams,
}: QuestionBankPageProps) {
  await requireUser();
  const params = await searchParams;
  const { recentPdfs, units } = await getQuestionBankDashboard();
  const subunits = units.filter((unit) => unit.parentId);

  return (
    <>
      <PageTitle
        title="문제은행"
        description="중학수학 단원 체계에 맞춰 중단원별 PDF 문제지를 업로드하고 관리합니다."
      />

      <div className="grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <aside className="space-y-6">
          <QuestionBankUnitForm
            error={getSingleParam(params.unitError)}
            units={units}
          />
          <QuestionBankUnitSummary units={units} />
        </aside>

        <div className="space-y-6">
          <QuestionBankPdfUploadForm
            error={getSingleParam(params.pdfError)}
            subunits={subunits}
            units={units}
          />
          <QuestionBankPdfList pdfs={recentPdfs} />
        </div>
      </div>
    </>
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
          PDF 문제지 업로드
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

function QuestionBankPdfList({ pdfs }: { pdfs: QuestionBankPdfListItem[] }) {
  return (
    <section className="overflow-hidden rounded-md border border-[#d9dee7] bg-white">
      <header className="border-b border-[#eef1f5] px-5 py-4">
        <h2 className="text-base font-semibold text-[#16181d]">
          업로드된 PDF 문제지
        </h2>
        <p className="mt-1 text-sm text-[#697386]">
          최근 업로드된 PDF {pdfs.length}개를 표시합니다.
        </p>
      </header>

      {pdfs.length > 0 ? (
        <ul className="divide-y divide-[#eef1f5]">
          {pdfs.map((pdf) => (
            <li
              key={pdf.id}
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className={badgeClassName}>
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
                  {pdf.subject}
                  {pdf.gradeLevel ? ` · ${pdf.gradeLevel}` : ""} ·{" "}
                  {pdf.uploadedByName ?? "업로더 정보 없음"} ·{" "}
                  {formatDateTime(pdf.createdAt)}
                </p>
                {pdf.description ? (
                  <p className="mt-2 break-words text-sm leading-6 text-[#394150] [overflow-wrap:anywhere]">
                    {pdf.description}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
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
        <p className="m-5 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm text-[#697386]">
          업로드된 PDF 문제지가 없습니다.
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const inputClassName =
  "mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:bg-[#f7f9fc] disabled:text-[#8a95a6]";
const badgeClassName =
  "inline-flex h-7 items-center rounded-full border border-[#b8d9d7] bg-[#eef7f6] px-2.5 text-xs font-semibold text-[#196b69]";
const subtleBadgeClassName =
  "inline-flex h-7 items-center rounded-full border border-[#d9dee7] bg-[#f7f9fc] px-2.5 text-xs font-semibold text-[#394150]";
