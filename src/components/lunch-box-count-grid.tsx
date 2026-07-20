"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DatePickerInput } from "@/components/date-picker-input";
import { EmptyState } from "@/components/empty-state";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  getLunchBoxCountTotal,
  getLunchBoxPreservationClassLabel,
  getLunchBoxSchoolTypeLabel,
  formatLunchBoxDateLabel,
  lunchBoxCountFields,
  lunchBoxCountFieldLabels,
  shiftLunchBoxDate,
  type LunchBoxActionResult,
  type LunchBoxCountGrid as LunchBoxCountGridData,
  type LunchBoxCountRowInput,
  type LunchBoxCountValues,
} from "@/lib/lunch-box-counts-core";

type LunchBoxCountGridProps = {
  initialGrid: LunchBoxCountGridData;
  loadGrid: (
    date: string,
  ) => Promise<LunchBoxActionResult<{ grid: LunchBoxCountGridData }>>;
  onGridSaved?: (grid: LunchBoxCountGridData) => void;
  onGridLoaded?: (grid: LunchBoxCountGridData) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onSavePendingChange?: (isPending: boolean) => void;
  saveCounts: (
    date: string,
    rows: LunchBoxCountRowInput[],
  ) => Promise<LunchBoxActionResult<{ grid: LunchBoxCountGridData }>>;
  today: string;
};

const cellInputClassName =
  "h-11 w-16 rounded-md border border-[#cfd6e3] bg-white px-2 text-center text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]";
const navButtonClassName = buttonClass(
  buttonStyles.base,
  buttonStyles.neutral,
  "h-11 px-3 text-sm",
);
const pdfButtonClassName = buttonClass(
  buttonStyles.base,
  buttonStyles.save,
  "h-11 px-3 text-sm",
);

export function LunchBoxCountGrid({
  initialGrid,
  loadGrid,
  onDirtyChange,
  onGridLoaded,
  onGridSaved,
  onSavePendingChange,
  saveCounts,
  today,
}: LunchBoxCountGridProps) {
  const [grid, setGrid] = useState(initialGrid);
  const [edits, setEdits] = useState<Record<string, LunchBoxCountValues>>({});
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoadPending, startLoadTransition] = useTransition();
  const [isSavePending, startSaveTransition] = useTransition();
  const loadRequestIdRef = useRef(0);

  const editedCount = Object.keys(edits).length;
  const grandTotal = useMemo(
    () =>
      grid.rows.reduce(
        (sum, row) => sum + getLunchBoxCountTotal(edits[row.schoolId] ?? row),
        0,
      ),
    [edits, grid.rows],
  );
  const preservationTotal = useMemo(
    () =>
      grid.rows.reduce(
        (sum, row) =>
          sum + (edits[row.schoolId] ?? row).preservationCount,
        0,
      ),
    [edits, grid.rows],
  );
  const deliveryDriverTotal = useMemo(
    () =>
      grid.rows.reduce(
        (sum, row) =>
          sum + (edits[row.schoolId] ?? row).deliveryDriverCount,
        0,
      ),
    [edits, grid.rows],
  );

  useEffect(() => {
    onDirtyChange?.(editedCount > 0);
  }, [editedCount, onDirtyChange]);

  useEffect(() => {
    onSavePendingChange?.(isSavePending);
  }, [isSavePending, onSavePendingChange]);

  useEffect(
    () => () => {
      loadRequestIdRef.current += 1;
      onSavePendingChange?.(false);
    },
    [onSavePendingChange],
  );

  function loadDate(nextDate: string) {
    if (editedCount > 0) {
      return;
    }

    setError("");
    setSuccessMessage("");
    const requestId = ++loadRequestIdRef.current;

    startLoadTransition(async () => {
      const result = await loadGrid(nextDate);

      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setGrid(result.data.grid);
      setEdits({});
      onGridLoaded?.(result.data.grid);
    });
  }

  function handleFieldChange(
    schoolId: string,
    field: (typeof lunchBoxCountFields)[number],
    rawValue: string,
  ) {
    const row = grid.rows.find((item) => item.schoolId === schoolId);

    if (!row) {
      return;
    }

    const parsedValue = Math.max(0, Math.floor(Number(rawValue) || 0));

    setSuccessMessage("");
    setEdits((current) => {
      const base = current[schoolId] ?? pickCountValues(row);
      const nextValues = { ...base, [field]: parsedValue };

      if (
        lunchBoxCountFields.every(
          (countField) => nextValues[countField] === row[countField],
        )
      ) {
        const nextEdits = { ...current };
        delete nextEdits[schoolId];
        return nextEdits;
      }

      return {
        ...current,
        [schoolId]: nextValues,
      };
    });
  }

  function handleSave() {
    const rows = Object.entries(edits).map(([schoolId, values]) => ({
      schoolId,
      ...values,
    }));

    if (rows.length === 0) {
      return;
    }

    setError("");
    startSaveTransition(async () => {
      const result = await saveCounts(grid.date, rows);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setGrid(result.data.grid);
      setEdits({});
      setSuccessMessage(`${rows.length}개교 개수를 저장했습니다.`);
      onGridSaved?.(result.data.grid);
    });
  }

  const isPending = isLoadPending || isSavePending;

  return (
    <section
      aria-busy={isPending || undefined}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-[#d9dee7] bg-white shadow-sm"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#eef1f5] px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-[#16181d]">
            일자별 도시락 개수
          </h2>
          <p className="mt-1 text-sm text-[#697386]">
            {formatLunchBoxDateLabel(grid.date)} 기준 · 총계 {grandTotal}개 ·
            보존식 {preservationTotal}개 · 배송기사 {deliveryDriverTotal}개 포함
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isPending || editedCount > 0}
            title={editedCount > 0 ? "변경사항을 먼저 저장하세요." : undefined}
            onClick={() => loadDate(shiftLunchBoxDate(grid.date, -1))}
            className={navButtonClassName}
          >
            전날
          </button>
          <DatePickerInput
            aria-label="입력 날짜"
            value={grid.date}
            disabled={isPending || editedCount > 0}
            onChange={(event) => {
              if (event.target.value) {
                loadDate(event.target.value);
              }
            }}
            className="h-11 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          />
          <button
            type="button"
            disabled={isPending || editedCount > 0}
            title={editedCount > 0 ? "변경사항을 먼저 저장하세요." : undefined}
            onClick={() => loadDate(shiftLunchBoxDate(grid.date, 1))}
            className={navButtonClassName}
          >
            다음날
          </button>
          {grid.date !== today ? (
            <button
              type="button"
              disabled={isPending || editedCount > 0}
              title={editedCount > 0 ? "변경사항을 먼저 저장하세요." : undefined}
              onClick={() => loadDate(today)}
              className={navButtonClassName}
            >
              오늘
            </button>
          ) : null}
          {editedCount > 0 || isPending ? (
            <button
              type="button"
              disabled
              title={
                editedCount > 0
                  ? "변경사항을 저장한 후 인쇄할 수 있습니다."
                  : "날짜를 불러온 후 인쇄할 수 있습니다."
              }
              className={pdfButtonClassName}
            >
              PDF 인쇄
            </button>
          ) : (
            <Link
              href={`/work-schedule/lunch-boxes/print?date=${grid.date}`}
              target="_blank"
              rel="noreferrer"
              className={pdfButtonClassName}
            >
              PDF 인쇄
            </Link>
          )}
        </div>
      </div>

      {error ? (
        <p className="mx-5 mt-4 shrink-0 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
          {error}
        </p>
      ) : null}
      {successMessage ? (
        <p className="mx-5 mt-4 shrink-0 rounded-md border border-[#bddfc9] bg-[#e8f5ed] px-3 py-2 text-sm text-[#22633a]">
          {successMessage}
        </p>
      ) : null}

      {grid.rows.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <EmptyState
            title="등록된 학교가 없습니다"
            description="도시락 개수를 입력하려면 먼저 학교를 등록하세요."
            action={
              <Link
                href="/work-schedule/lunch-boxes?tab=schools"
                className={buttonClass(
                  buttonStyles.base,
                  buttonStyles.create,
                  "h-11 px-4 text-sm",
                )}
              >
                학교 등록하기
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div
            aria-label="학교별 도시락·보존식·배송기사 개수 입력 표"
            className="min-h-0 flex-1 overflow-auto px-5 pb-4 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#196b69]"
            role="region"
            tabIndex={0}
          >
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-[#697386]">
                  <th
                    className="sticky top-0 left-0 z-30 border-b border-[#eef1f5] bg-white py-3 pr-3"
                    scope="col"
                  >
                    학교명
                  </th>
                  {lunchBoxCountFields.map((field) => (
                    <th
                      key={field}
                      className="sticky top-0 z-20 border-b border-[#eef1f5] bg-white px-2 py-3 text-center"
                      scope="col"
                    >
                      {lunchBoxCountFieldLabels[field]}
                    </th>
                  ))}
                  <th
                    className="sticky top-0 z-20 border-b border-[#eef1f5] bg-white px-2 py-3 text-center"
                    scope="col"
                  >
                    합계
                  </th>
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row) => {
                  const values = edits[row.schoolId] ?? pickCountValues(row);
                  const isEdited = Boolean(edits[row.schoolId]);

                  return (
                    <tr
                      key={row.schoolId}
                      className={`border-b border-[#f3f5f8] ${isEdited ? "bg-[#fffaf1]" : ""}`}
                    >
                      <th
                        className={`sticky left-0 z-10 py-2 pr-3 text-left ${isEdited ? "bg-[#fffaf1]" : "bg-white"}`}
                        scope="row"
                      >
                        <span className="block">
                          <span className="font-medium text-[#16181d]">
                            {row.schoolName}
                          </span>
                          <span className="ml-2 rounded-full border border-[#cfd6e3] px-2 py-0.5 text-xs font-normal text-[#697386]">
                            {getLunchBoxSchoolTypeLabel(row.schoolType)}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs font-normal text-[#697386]">
                          보존식 지정: {getLunchBoxPreservationClassLabel(row.preservationClass)}
                        </span>
                      </th>
                      {lunchBoxCountFields.map((field) => (
                        <td key={field} className="px-2 py-2 text-center">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            aria-label={`${row.schoolName} ${
                              field === "deliveryDriverCount"
                                ? "배송기사 도시락"
                                : lunchBoxCountFieldLabels[field]
                            } 개수${
                              field === "preservationCount"
                                ? row.preservationClass === null
                                  ? " (배정 미지정)"
                                  : ` (${row.preservationClass}반 배정)`
                                : ""
                            }`}
                            disabled={isPending}
                            value={values[field]}
                            onChange={(event) =>
                              handleFieldChange(
                                row.schoolId,
                                field,
                                event.target.value,
                              )
                            }
                            className={cellInputClassName}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center font-semibold text-[#16181d]">
                        {getLunchBoxCountTotal(values)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#eef1f5] px-5 py-4">
            <p className="text-sm text-[#697386]">
              {editedCount > 0
                ? `${editedCount}개교 수정 중 (저장 전)`
                : "변경 사항이 없습니다."}
            </p>
            <button
              type="button"
              disabled={isPending || editedCount === 0}
              onClick={handleSave}
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.save,
                "h-11 px-4 text-sm",
              )}
            >
              {isSavePending ? "저장 중" : "저장"}
            </button>
          </footer>
        </>
      )}
    </section>
  );
}

function pickCountValues(
  values: LunchBoxCountValues,
): LunchBoxCountValues {
  return {
    class1Count: values.class1Count,
    class2Count: values.class2Count,
    class3Count: values.class3Count,
    class4Count: values.class4Count,
    linkedCount: values.linkedCount,
    preservationCount: values.preservationCount,
    deliveryDriverCount: values.deliveryDriverCount,
  };
}
