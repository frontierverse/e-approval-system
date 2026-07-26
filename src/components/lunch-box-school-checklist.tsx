"use client";

import { useMemo, useSyncExternalStore } from "react";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  formatLunchBoxPreservationCellTitle,
  formatLunchBoxShortDateLabel,
  getLunchBoxSchoolTypeLabel,
  lunchBoxCountFieldLabels,
  normalizeLunchBoxChecklistIds,
  splitLunchBoxChecklistColumns,
  toggleLunchBoxChecklistId,
  type LunchBoxFixedCountList,
  type LunchBoxFixedCountRow,
  type LunchBoxServingCountField,
} from "@/lib/lunch-box-counts-core";

type ToggleHandler = (schoolId: string) => void;

export const lunchBoxChecklistColumnCount = 3;
export const lunchBoxChecklistStorageKey = "lunch-box-school-checklist:fixed";

const chipClassName =
  "inline-flex shrink-0 items-center gap-1 rounded-md bg-[#eef1f5] px-1.5 py-0.5 text-xs leading-5 tabular-nums text-[#394150] sm:text-sm";

// 체크된 행 배경은 :has(:checked)로 처리해 하이드레이션 전에도 상태가 정확히 보이게 한다.
// #e8f5ed의 다크 모드 대응값은 globals.css의 .dark .bg-[#e8f5ed] 규칙과 동일하게 맞춘다.
const checkedRowClassName = [
  "hover:bg-[#eef7f6]",
  "has-[:checked]:bg-[#e8f5ed] has-[:checked]:hover:bg-[#e8f5ed]",
  "dark:has-[:checked]:bg-[rgb(35_134_54_/_0.16)] dark:has-[:checked]:hover:bg-[rgb(35_134_54_/_0.16)]",
].join(" ");
const chipRowClassName = [
  "flex min-h-11 cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors sm:px-4",
  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-[#196b69]",
  checkedRowClassName,
].join(" ");
const tableRowClassName = [
  "border-b border-[#f3f5f8] transition-colors",
  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-[#196b69]",
  checkedRowClassName,
].join(" ");
const tableHeadClassName =
  "border-b border-[#e2e7ed] pb-1 text-[11px] font-semibold whitespace-nowrap text-[#697386]";
// 좁은 숫자 열에서 머리글이 한 글자씩 줄바꿈되지 않도록 표에서만 짧은 이름을 쓴다.
const tableHeadShortLabels: Record<LunchBoxServingCountField, string> = {
  class1Count: "1반",
  class2Count: "2반",
  class3Count: "3반",
  class4Count: "4반",
  linkedCount: "연계",
};
const numericCellClassName =
  "px-1 text-right text-[13px] leading-4 tabular-nums text-[#16181d]";

export function LunchBoxSchoolChecklist({
  fixedCountList,
}: {
  fixedCountList: LunchBoxFixedCountList;
}) {
  const storedValue = useSyncExternalStore(
    subscribeToChecklistStore,
    readChecklistValue,
    () => null,
  );
  const checkedIds = useMemo(
    () => parseChecklistIds(storedValue, fixedCountList.rows),
    [fixedCountList.rows, storedValue],
  );
  const checkedIdSet = useMemo(() => new Set(checkedIds), [checkedIds]);

  const checkedCount = checkedIds.length;
  const remainingCount = fixedCountList.rows.length - checkedCount;

  function handleToggle(schoolId: string) {
    writeChecklistValue(
      JSON.stringify(toggleLunchBoxChecklistId(checkedIds, schoolId)),
    );
  }

  if (fixedCountList.rows.length === 0) {
    return (
      <section className="rounded-md border border-[#d9dee7] bg-white px-3 py-3 shadow-sm sm:px-4">
        <h2 className="text-sm font-semibold text-[#16181d]">
          도시락 학교 목록
        </h2>
        <p className="mt-1 text-sm text-[#697386]">
          아직 등록된 도시락 수량이 없습니다. 일자별 개수 탭에서 먼저 수량을
          입력하세요.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-[#d9dee7] bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-[#eef1f5] px-3 py-2 sm:px-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <h2 className="text-sm font-semibold text-[#16181d]">
            도시락 학교 목록
          </h2>
          <p className="text-xs leading-5 tabular-nums text-[#697386]">
            {fixedCountList.rows.length}개교 · 1일 기준 총{" "}
            {fixedCountList.totalCount}개 · 보존식{" "}
            {fixedCountList.preservationTotal}개 · 첫 공급일 순
          </p>
          <p
            aria-live="polite"
            className="text-xs font-semibold tabular-nums text-[#196b69]"
          >
            체크 {checkedCount}/{fixedCountList.rows.length}
            {remainingCount === 0 ? " (완료)" : ` (남은 ${remainingCount})`}
          </p>
        </div>

        {checkedCount > 0 ? (
          <button
            type="button"
            onClick={() => writeChecklistValue("[]")}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.cancel,
              "h-11 shrink-0 self-start px-3 text-xs xl:self-auto",
            )}
          >
            체크 전체 해제
          </button>
        ) : null}
      </div>

      <ul className="divide-y divide-[#eef1f5] xl:hidden">
        {fixedCountList.rows.map((row) => (
          <LunchBoxChecklistChipRow
            key={row.schoolId}
            isChecked={checkedIdSet.has(row.schoolId)}
            onToggle={handleToggle}
            row={row}
          />
        ))}
      </ul>

      <LunchBoxChecklistColumns
        checkedIdSet={checkedIdSet}
        fixedCountList={fixedCountList}
        onToggle={handleToggle}
      />

      {fixedCountList.varyingSchoolNames.length > 0 ? (
        <p className="border-t border-[#eef1f5] px-3 py-1.5 text-xs leading-5 text-[#72512a] sm:px-4">
          <span className="font-semibold">날짜마다 수량이 다른 학교</span>{" "}
          {fixedCountList.varyingSchoolNames.length}곳 ·{" "}
          {fixedCountList.varyingSchoolNames.join(", ")} · 표에는 가장 많은
          날짜의 수량을 표시했습니다.
        </p>
      ) : null}

      {fixedCountList.idleSchoolNames.length > 0 ? (
        <p className="border-t border-[#eef1f5] px-3 py-1.5 text-xs leading-5 text-[#697386] sm:px-4">
          <span className="font-semibold">수량 미등록</span>{" "}
          {fixedCountList.idleSchoolNames.length}곳 ·{" "}
          {fixedCountList.idleSchoolNames.join(", ")}
        </p>
      ) : null}
    </section>
  );
}

function LunchBoxChecklistColumns({
  checkedIdSet,
  fixedCountList,
  onToggle,
}: {
  checkedIdSet: Set<string>;
  fixedCountList: LunchBoxFixedCountList;
  onToggle: ToggleHandler;
}) {
  const columns = splitLunchBoxChecklistColumns(
    fixedCountList.rows,
    lunchBoxChecklistColumnCount,
  );

  return (
    <div className="hidden gap-x-4 px-3 pb-2 xl:grid xl:grid-cols-3">
      {columns.map((columnRows, columnIndex) => (
        <table
          aria-label={`도시락 학교 목록 ${columnIndex + 1}단`}
          className="w-full border-collapse"
          key={columnIndex}
        >
          <thead>
            <tr>
              <th className={`${tableHeadClassName} w-6 text-left`} scope="col">
                <span className="sr-only">확인</span>
              </th>
              <th className={`${tableHeadClassName} text-left`} scope="col">
                학교
              </th>
              <th
                className={`${tableHeadClassName} w-11 pl-1 text-right`}
                scope="col"
                title="보존식 개수와 배정 반. 예: 1(2)는 보존식 1개, 2반 배정"
              >
                보존식
              </th>
              {fixedCountList.visibleServingFields.map((field) => (
                <th
                  className={`${tableHeadClassName} w-9 pl-1 text-right`}
                  key={field}
                  scope="col"
                  title={lunchBoxCountFieldLabels[field]}
                >
                  {tableHeadShortLabels[field]}
                </th>
              ))}
              {fixedCountList.hasDeliveryDriver ? (
                <th
                  className={`${tableHeadClassName} w-9 pl-1 text-right`}
                  scope="col"
                >
                  기사
                </th>
              ) : null}
              <th
                className={`${tableHeadClassName} w-10 pl-1 text-right`}
                scope="col"
              >
                합계
              </th>
              <th
                className={`${tableHeadClassName} w-10 pl-1 text-right`}
                scope="col"
                title="각 학교가 처음 공급하는 날. 이 순서로 정렬합니다."
              >
                시작
              </th>
            </tr>
          </thead>
          <tbody>
            {columnRows.map((row) => (
              <tr className={tableRowClassName} key={row.schoolId}>
                <td className="py-0.5">
                  <label className="flex min-h-9 cursor-pointer items-center justify-center">
                    <input
                      aria-label={`${row.schoolName} 준비 완료`}
                      checked={checkedIdSet.has(row.schoolId)}
                      className="size-4 cursor-pointer accent-[#196b69]"
                      onChange={() => onToggle(row.schoolId)}
                      type="checkbox"
                    />
                  </label>
                </td>
                <th
                  className="max-w-[7rem] truncate pl-1 text-left text-[13px] leading-4 font-semibold text-[#16181d]"
                  scope="row"
                  title={buildSchoolTitle(row)}
                >
                  {row.schoolName}
                  {row.varianceNote ? (
                    <span
                      aria-label="날짜마다 수량이 다름"
                      className="ml-0.5 font-bold text-[#a1670a]"
                    >
                      *
                    </span>
                  ) : null}
                </th>
                <td
                  className={numericCellClassName}
                  title={formatLunchBoxPreservationCellTitle(
                    row.schoolName,
                    row.preservationCount,
                    row.preservationClass,
                  )}
                >
                  {row.preservationCount > 0 ? (
                    <>
                      <span className="font-semibold text-[#0f5553]">
                        {row.preservationCount}
                      </span>
                      <span className="text-[11px] text-[#697386]">
                        ({row.preservationClass ?? "-"})
                      </span>
                    </>
                  ) : (
                    <span className="text-[#9aa4b2]">-</span>
                  )}
                </td>
                {fixedCountList.visibleServingFields.map((field) => (
                  <td className={numericCellClassName} key={field}>
                    {row.servingCounts[field] > 0 ? (
                      row.servingCounts[field]
                    ) : (
                      <span className="text-[#9aa4b2]">-</span>
                    )}
                  </td>
                ))}
                {fixedCountList.hasDeliveryDriver ? (
                  <td className={numericCellClassName}>
                    {row.deliveryDriverCount > 0 ? (
                      row.deliveryDriverCount
                    ) : (
                      <span className="text-[#9aa4b2]">-</span>
                    )}
                  </td>
                ) : null}
                <td className={`${numericCellClassName} font-semibold`}>
                  {row.total}
                </td>
                <td className={`${numericCellClassName} text-[#697386]`}>
                  {formatLunchBoxShortDateLabel(row.firstDate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

function LunchBoxChecklistChipRow({
  isChecked,
  onToggle,
  row,
}: {
  isChecked: boolean;
  onToggle: ToggleHandler;
  row: LunchBoxFixedCountRow;
}) {
  return (
    <li>
      <label className={chipRowClassName}>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => onToggle(row.schoolId)}
          className="size-5 shrink-0 cursor-pointer accent-[#196b69]"
        />
        <span
          className="w-28 shrink-0 truncate text-sm font-semibold text-[#16181d] sm:w-32 sm:text-[0.9375rem]"
          title={buildSchoolTitle(row)}
        >
          {row.schoolName}
          {row.varianceNote ? (
            <span
              aria-label="날짜마다 수량이 다름"
              className="ml-0.5 font-bold text-[#a1670a]"
            >
              *
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          {row.preservationLabel ? (
            <span className="inline-flex shrink-0 items-center rounded-md border border-[#b8d9d7] bg-[#eef7f6] px-1.5 py-0.5 text-xs leading-5 font-semibold tabular-nums text-[#0f5553] sm:text-sm">
              {row.preservationLabel}
            </span>
          ) : null}
          {row.classChips.map((chip) => (
            <span className={chipClassName} key={chip.field}>
              <span className="text-[#697386]">{chip.label}</span>
              <span className="font-semibold text-[#16181d]">{chip.value}</span>
            </span>
          ))}
          {row.deliveryDriverCount > 0 ? (
            <span className={chipClassName}>
              <span className="text-[#697386]">배송기사</span>
              <span className="font-semibold text-[#16181d]">
                {row.deliveryDriverCount}
              </span>
            </span>
          ) : null}
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#cfd6e3] px-1.5 py-0.5 text-xs leading-5 tabular-nums sm:text-sm">
            <span className="text-[#697386]">합계</span>
            <span className="font-semibold text-[#16181d]">{row.total}</span>
          </span>
          <span className="shrink-0 text-xs leading-5 tabular-nums text-[#697386]">
            {formatLunchBoxShortDateLabel(row.firstDate)}~ {row.supplyDayCount}일
          </span>
        </span>
      </label>
    </li>
  );
}

function buildSchoolTitle(row: LunchBoxFixedCountRow) {
  const base = `${row.schoolName} (${getLunchBoxSchoolTypeLabel(row.schoolType)}) · ${row.firstDate} ~ ${row.lastDate} · ${row.supplyDayCount}일`;

  return row.varianceNote ? `${base} · ${row.varianceNote}` : base;
}

// 세션 중에는 메모리 값을 우선하고, 새로고침 이후에는 localStorage 값을 사용한다.
// 시크릿 모드처럼 localStorage 쓰기가 막힌 환경에서도 체크 상태가 유지된다.
let checklistMemoryValue: string | null = null;
const checklistStoreListeners = new Set<() => void>();

function subscribeToChecklistStore(onStoreChange: () => void) {
  checklistStoreListeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);

  return () => {
    checklistStoreListeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function readChecklistValue(): string | null {
  if (checklistMemoryValue !== null) {
    return checklistMemoryValue;
  }

  try {
    return window.localStorage.getItem(lunchBoxChecklistStorageKey);
  } catch {
    return null;
  }
}

function writeChecklistValue(value: string) {
  checklistMemoryValue = value;

  try {
    window.localStorage.setItem(lunchBoxChecklistStorageKey, value);
  } catch {
    // 저장소를 쓸 수 없으면 이번 세션 동안 메모리 값으로만 유지한다.
  }

  for (const listener of checklistStoreListeners) {
    listener();
  }
}

function parseChecklistIds(
  storedValue: string | null,
  rows: readonly { schoolId: string }[],
) {
  if (!storedValue) {
    return [];
  }

  try {
    return normalizeLunchBoxChecklistIds(JSON.parse(storedValue), rows);
  } catch {
    return [];
  }
}
