"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { AppModal } from "@/components/app-modal";
import { DatePickerInput } from "@/components/date-picker-input";
import { EmptyState } from "@/components/empty-state";
import { useLunchBoxRealtimeSync } from "@/hooks/use-lunch-box-realtime-sync";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  formatLunchBoxMenuItems,
  getLunchBoxCountTotal,
  getLunchBoxPreservationClassLabel,
  getLunchBoxSchoolTypeLabel,
  formatLunchBoxDateLabel,
  lunchBoxCountFields,
  lunchBoxCountFieldLabels,
  mergeLunchBoxCountRealtimeGrid,
  shiftLunchBoxDate,
  type LunchBoxActionResult,
  type LunchBoxCountGrid as LunchBoxCountGridData,
  type LunchBoxCountRowInput,
  type LunchBoxCountValues,
} from "@/lib/lunch-box-counts-core";

type LunchBoxCountGridProps = {
  initialGrid: LunchBoxCountGridData;
  isCloseDisabled?: boolean;
  loadGrid: (
    date: string,
  ) => Promise<LunchBoxActionResult<{ grid: LunchBoxCountGridData }>>;
  onClose?: () => void;
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
  "h-11 w-14 rounded-md border border-[#cfd6e3] bg-white px-1 text-center text-sm tabular-nums outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] sm:w-16 sm:px-2";
const navButtonClassName = buttonClass(
  buttonStyles.base,
  buttonStyles.neutral,
  "h-11 shrink-0 px-3 text-sm",
);
const pdfButtonClassName = buttonClass(
  buttonStyles.base,
  buttonStyles.save,
  "h-11 shrink-0 px-3 text-sm",
);
const closeButtonClassName = buttonClass(
  buttonStyles.base,
  buttonStyles.danger,
  "h-11 shrink-0 px-3 text-sm",
);

export function LunchBoxCountGrid({
  initialGrid,
  isCloseDisabled = false,
  loadGrid,
  onClose,
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
  const [realtimeConflict, setRealtimeConflict] = useState<{
    fieldCount: number;
    schoolCount: number;
    unavailableSchoolCount: number;
  } | null>(null);
  const [isStatusPrintDialogOpen, setIsStatusPrintDialogOpen] = useState(false);
  const [isLoadPending, startLoadTransition] = useTransition();
  const [isSavePending, startSaveTransition] = useTransition();
  const loadRequestIdRef = useRef(0);
  const gridRef = useRef(grid);
  const editsRef = useRef(edits);
  const latestCanonicalGridRef = useRef(grid);

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
  const menuLabel = useMemo(
    () => formatLunchBoxMenuItems(grid.menuItems),
    [grid.menuItems],
  );
  const gridRealtime = useLunchBoxRealtimeSync<LunchBoxCountGridData>({
    scopeKey: grid.date,
    streamUrl: `/api/lunch-boxes/checks/stream?date=${encodeURIComponent(grid.date)}`,
    load: async () => {
      try {
        const result = await loadGrid(grid.date);

        return result.ok
          ? { ok: true as const, data: result.data.grid }
          : { ok: false as const };
      } catch {
        return { ok: false as const };
      }
    },
    apply: (nextGrid) => {
      const currentEdits = editsRef.current;
      latestCanonicalGridRef.current = nextGrid;
      const mergeResult = mergeLunchBoxCountRealtimeGrid({
        currentGrid: gridRef.current,
        edits: currentEdits,
        nextGrid,
      });

      gridRef.current = mergeResult.grid;
      editsRef.current = mergeResult.edits;
      setGrid(mergeResult.grid);
      setEdits(mergeResult.edits);
      onGridLoaded?.(mergeResult.grid);

      if (mergeResult.conflictingFieldCount > 0) {
        setSuccessMessage("");
        setRealtimeConflict({
          fieldCount: mergeResult.conflictingFieldCount,
          schoolCount: mergeResult.conflictingSchoolCount,
          unavailableSchoolCount: mergeResult.unavailableSchoolCount,
        });
      } else {
        setRealtimeConflict((currentConflict) =>
          Object.keys(mergeResult.edits).length === 0
            ? null
            : currentConflict,
        );
      }
    },
  });
  const realtimeStatusClassName =
    gridRealtime.connectionStatus === "connected" &&
    !gridRealtime.syncFailed
      ? "text-[#22633a]"
      : gridRealtime.connectionStatus === "connecting" ||
          gridRealtime.connectionStatus === "paused"
        ? "text-[#697386]"
        : "text-[#7a5200]";

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

      gridRef.current = result.data.grid;
      latestCanonicalGridRef.current = result.data.grid;
      editsRef.current = {};
      setGrid(result.data.grid);
      setEdits({});
      setRealtimeConflict(null);
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
        editsRef.current = nextEdits;
        return nextEdits;
      }

      const nextEdits = {
        ...current,
        [schoolId]: nextValues,
      };
      editsRef.current = nextEdits;
      return nextEdits;
    });
  }

  function handleSave() {
    const rows = Object.entries(edits).map(([schoolId, values]) => ({
      schoolId,
      ...values,
    }));

    if (rows.length === 0 || realtimeConflict) {
      return;
    }

    setError("");
    startSaveTransition(async () => {
      const result = await saveCounts(grid.date, rows);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      gridRef.current = result.data.grid;
      latestCanonicalGridRef.current = result.data.grid;
      editsRef.current = {};
      setGrid(result.data.grid);
      setEdits({});
      setRealtimeConflict(null);
      setSuccessMessage(`${rows.length}개교 개수를 저장했습니다.`);
      onGridSaved?.(result.data.grid);
    });
  }

  function keepLocalValuesAfterConflict() {
    if (realtimeConflict?.unavailableSchoolCount) {
      return;
    }

    setRealtimeConflict(null);
    setSuccessMessage(
      "현재 입력값을 유지합니다. 저장하면 해당 값이 최종 반영됩니다.",
    );
  }

  function applyLatestValuesAfterConflict() {
    if (
      !window.confirm(
        "입력 중인 변경사항을 취소하고 다른 직원이 저장한 최신값을 적용할까요?",
      )
    ) {
      return;
    }

    editsRef.current = {};
    gridRef.current = latestCanonicalGridRef.current;
    setEdits({});
    setGrid(latestCanonicalGridRef.current);
    setRealtimeConflict(null);
    setSuccessMessage("다른 직원이 저장한 최신값을 적용했습니다.");
  }

  const isPending = isLoadPending || isSavePending;

  return (
    <section
      aria-busy={isPending || undefined}
      className="flex h-full min-h-0 flex-col overflow-hidden bg-white sm:rounded-md sm:border sm:border-[#d9dee7] sm:shadow-sm"
    >
      <div className="flex shrink-0 flex-col gap-3 border-b border-[#eef1f5] px-3 py-3 sm:px-5 sm:py-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#16181d]">
            일자별 도시락 현황
          </h2>
          <p className="mt-1 text-xs leading-5 tabular-nums text-[#697386] sm:text-sm">
            {formatLunchBoxDateLabel(grid.date)} 기준 · 총계 {grandTotal}개 ·
            보존식 {preservationTotal}개 · 배송기사 {deliveryDriverTotal}개 포함{" "}
            <span
              aria-live="polite"
              className={`whitespace-nowrap font-medium ${realtimeStatusClassName}`}
            >
              · {gridRealtime.statusLabel}
            </span>
          </p>
          {menuLabel ? (
            <p className="mt-1.5 max-w-4xl text-xs leading-5 text-[#566174] sm:text-sm">
              <span className="mr-1.5 font-semibold text-[#196b69]">식단</span>
              {menuLabel}
            </p>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:w-auto xl:flex-nowrap">
          <div className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-2 sm:w-auto sm:grid-cols-[auto_10.5rem_auto]">
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
              className="h-11 w-full min-w-0 rounded-md border border-[#cfd6e3] bg-white px-2 text-sm tabular-nums outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] sm:px-3"
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
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:justify-start">
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
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
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
              <button
                type="button"
                aria-expanded={isStatusPrintDialogOpen}
                aria-haspopup="dialog"
                disabled={editedCount > 0 || isPending}
                title={
                  editedCount > 0
                    ? "변경사항을 저장한 후 인쇄할 수 있습니다."
                    : isPending
                      ? "날짜를 불러온 후 인쇄할 수 있습니다."
                      : undefined
                }
                onClick={() => setIsStatusPrintDialogOpen(true)}
                className={pdfButtonClassName}
              >
                현황표 인쇄
              </button>
              {editedCount > 0 || isPending || grid.menuItems.length === 0 ? (
                <button
                  type="button"
                  disabled
                  title={
                    editedCount > 0
                      ? "변경사항을 저장한 후 인쇄할 수 있습니다."
                      : isPending
                        ? "날짜를 불러온 후 인쇄할 수 있습니다."
                        : "이 날짜에 등록된 메뉴가 없어 인쇄할 수 없습니다."
                  }
                  className={pdfButtonClassName}
                >
                  메뉴 재료 인쇄
                </button>
              ) : (
                <Link
                  href={`/work-schedule/lunch-boxes/menu-ingredients-print?date=${grid.date}`}
                  target="_blank"
                  rel="noreferrer"
                  prefetch={false}
                  className={pdfButtonClassName}
                >
                  메뉴 재료 인쇄
                </Link>
              )}
              {onClose ? (
                <button
                  type="button"
                  data-modal-initial-focus
                  disabled={isCloseDisabled}
                  title={
                    isCloseDisabled
                      ? "저장이 끝난 후 닫을 수 있습니다."
                      : undefined
                  }
                  onClick={onClose}
                  className={closeButtonClassName}
                >
                  닫기
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <p
          className="mx-3 mt-3 shrink-0 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f] sm:mx-5 sm:mt-4"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {realtimeConflict ? (
        <div
          className="mx-3 mt-3 flex shrink-0 flex-col gap-2 rounded-md border border-[#f0d28a] bg-[#fff8e8] px-3 py-2 text-sm text-[#7a5200] sm:mx-5 sm:mt-4 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="min-w-0 leading-5">
            {realtimeConflict.unavailableSchoolCount > 0
              ? `다른 직원이 편집 중인 ${realtimeConflict.unavailableSchoolCount.toLocaleString("ko-KR")}개교의 학교 상태를 변경했습니다. 현재 입력은 보존했으며 최신값을 적용해야 계속할 수 있습니다.`
              : `다른 직원이 수정 중인 ${realtimeConflict.schoolCount.toLocaleString("ko-KR")}개교의 같은 수량 ${realtimeConflict.fieldCount.toLocaleString("ko-KR")}건을 변경했습니다. 현재 입력은 유지했으며 확인 전까지 저장되지 않습니다.`}
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            {realtimeConflict.unavailableSchoolCount === 0 ? (
              <button
                type="button"
                className={buttonClass(
                  buttonStyles.base,
                  buttonStyles.neutral,
                  "h-11 px-3 text-sm",
                )}
                onClick={keepLocalValuesAfterConflict}
              >
                내 입력 유지
              </button>
            ) : null}
            <button
              type="button"
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.danger,
                "h-11 px-3 text-sm",
              )}
              onClick={applyLatestValuesAfterConflict}
            >
              최신값 적용
            </button>
          </div>
        </div>
      ) : null}
      {successMessage ? (
        <p
          className="mx-3 mt-3 shrink-0 rounded-md border border-[#bddfc9] bg-[#e8f5ed] px-3 py-2 text-sm text-[#22633a] sm:mx-5 sm:mt-4"
          role="status"
        >
          {successMessage}
        </p>
      ) : null}

      {grid.rows.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
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
          <p className="shrink-0 border-b border-[#eef1f5] bg-[#f7f9fc] px-3 py-1.5 text-xs text-[#566174] sm:hidden">
            표를 좌우로 밀어 반별 개수를 입력하세요.
          </p>
          <div
            aria-label="학교별 도시락·보존식·배송기사 개수 입력 표"
            className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 pb-3 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#196b69] sm:px-5 sm:pb-4"
            role="region"
            tabIndex={0}
          >
            <table className="w-full min-w-[720px] table-fixed border-collapse text-sm sm:min-w-[900px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-[#697386]">
                  <th
                    className="sticky top-0 left-0 z-30 w-36 border-r border-b border-[#e2e7ed] bg-white py-2.5 pr-2 shadow-[4px_0_8px_-6px_rgba(17,24,39,0.45)] sm:w-48 sm:py-3 sm:pr-3"
                    scope="col"
                  >
                    학교명
                  </th>
                  {lunchBoxCountFields.map((field) => (
                    <th
                      key={field}
                      className="sticky top-0 z-20 w-16 border-b border-[#eef1f5] bg-white px-1 py-2.5 text-center sm:w-20 sm:px-2 sm:py-3"
                      scope="col"
                    >
                      {lunchBoxCountFieldLabels[field]}
                    </th>
                  ))}
                  <th
                    className="sticky top-0 z-20 w-16 border-b border-[#eef1f5] bg-white px-1 py-2.5 text-center sm:w-20 sm:px-2 sm:py-3"
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
                      className={`group border-b border-[#f3f5f8] transition-colors hover:bg-[#eef7f6] focus-within:bg-[#eef7f6] ${isEdited ? "bg-[#fffaf1]" : ""}`}
                    >
                      <th
                        className={`sticky left-0 z-10 w-36 border-r border-[#e2e7ed] py-1 pr-2 text-left shadow-[4px_0_8px_-6px_rgba(17,24,39,0.35)] transition-colors group-hover:bg-[#eef7f6] group-focus-within:bg-[#eef7f6] sm:w-48 sm:py-2 sm:pr-3 ${isEdited ? "bg-[#fffaf1]" : "bg-white"}`}
                        scope="row"
                      >
                        <span
                          className="block truncate font-medium text-[#16181d]"
                          title={row.schoolName}
                        >
                          {row.schoolName}
                        </span>
                        <span className="mt-1 flex min-w-0 items-center gap-1">
                          <span className="shrink-0 rounded-full border border-[#cfd6e3] px-1.5 py-0.5 text-[11px] font-normal text-[#697386] sm:px-2 sm:text-xs">
                            {getLunchBoxSchoolTypeLabel(row.schoolType)}
                          </span>
                          <span className="min-w-0 truncate text-[11px] font-normal text-[#697386] sm:text-xs">
                            보존식 {getLunchBoxPreservationClassLabel(row.preservationClass)}
                          </span>
                        </span>
                      </th>
                      {lunchBoxCountFields.map((field) => (
                        <td
                          key={field}
                          className="px-1 py-1 text-center sm:px-2 sm:py-2"
                        >
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
                      <td className="px-1 py-1 text-center font-semibold tabular-nums text-[#16181d] sm:px-2 sm:py-2">
                        {getLunchBoxCountTotal(values)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <footer className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-[#eef1f5] px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:justify-between sm:px-5 sm:py-4">
            <p className="min-w-0 text-xs leading-5 text-[#697386] sm:text-sm">
              {realtimeConflict
                ? "다른 직원의 변경사항을 확인하세요."
                : editedCount > 0
                ? `${editedCount}개교 수정 중 (저장 전)`
                : "변경 사항이 없습니다."}
            </p>
            <button
              type="button"
              disabled={
                isPending || editedCount === 0 || Boolean(realtimeConflict)
              }
              title={
                realtimeConflict
                  ? "다른 직원의 변경사항을 먼저 확인하세요."
                  : undefined
              }
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

      {isStatusPrintDialogOpen ? (
        <LunchBoxStatusPrintDialog
          date={grid.date}
          onClose={() => setIsStatusPrintDialogOpen(false)}
        />
      ) : null}
    </section>
  );
}

export function LunchBoxStatusPrintDialog({
  date,
  onClose,
}: {
  date: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dateLabel = formatLunchBoxPrintDateLabel(date);
  const dailyHref = `/work-schedule/lunch-boxes/status-print?date=${date}`;

  return (
    <AppModal
      className="max-w-lg"
      describedBy={descriptionId}
      labelledBy={titleId}
      onClose={onClose}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0">
          <h3
            id={titleId}
            className="break-words text-lg font-semibold leading-tight text-[var(--foreground)]"
          >
            {dateLabel} 현황표 인쇄
          </h3>
          <p
            id={descriptionId}
            className="mt-2 text-sm leading-5 text-[var(--text-muted)]"
          >
            인쇄할 기간을 선택하세요. 일주일치는 해당 주의 실제 공급일마다
            현황표와 그룹 배치도를 두 페이지로 묶습니다.
          </p>
        </div>
        <button
          type="button"
          aria-label="현황표 인쇄 선택 닫기"
          onClick={onClose}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.neutral,
            "h-11 shrink-0 px-3 text-sm",
          )}
        >
          닫기
        </button>
      </div>

      <div className="grid gap-3 px-5 py-5 sm:grid-cols-2">
        <Link
          data-modal-initial-focus
          href={dailyHref}
          target="_blank"
          rel="noreferrer"
          onClick={onClose}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.neutral,
            "min-h-16 min-w-0 whitespace-normal px-4 py-3 text-center text-sm",
          )}
        >
          <span>
            <span className="block">{dateLabel}만 인쇄</span>
            <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">
              현황표 + 그룹 배치도 2페이지
            </span>
          </span>
        </Link>
        <Link
          href={`${dailyHref}&period=week`}
          target="_blank"
          rel="noreferrer"
          onClick={onClose}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.save,
            "min-h-16 min-w-0 whitespace-normal px-4 py-3 text-center text-sm",
          )}
        >
          <span>
            <span className="block">일주일치 인쇄</span>
            <span className="mt-1 block text-xs font-normal text-white/85">
              공급일별 현황표 + 배치도 2페이지씩
            </span>
          </span>
        </Link>
      </div>
    </AppModal>
  );
}

function formatLunchBoxPrintDateLabel(date: string) {
  const [, month, day] = date.split("-");

  return `${Number(month)}월 ${Number(day)}일`;
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
