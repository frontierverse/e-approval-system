"use client";

import {
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { AppModal } from "@/components/app-modal";
import { DatePickerInput } from "@/components/date-picker-input";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  formatLunchBoxDateLabel,
  formatLunchBoxMonthLabel,
  shiftLunchBoxMonth,
  type LunchBoxActionResult,
} from "@/lib/lunch-box-counts-core";
import {
  createLunchBoxOperationSummary,
  formatLunchBoxWon,
  formatLunchBoxWorkMinutes,
  getLunchBoxWorkerTypeLabel,
  getLunchBoxShiftMinutes,
  maxLunchBoxIngredientPurchaseCount,
  maxLunchBoxWorkShiftCount,
  validateLunchBoxOperationsInput,
  type LunchBoxDailyOperation,
  type LunchBoxIngredientPurchaseInput,
  type LunchBoxOperationMonthSummaryRow,
  type LunchBoxOperationsViewData,
  type LunchBoxWorkerType,
  type LunchBoxWorkShiftInput,
} from "@/lib/lunch-box-operations-core";

type LunchBoxOperationsBoardProps = {
  initialData: LunchBoxOperationsViewData;
  loadOperations: (
    date: string,
  ) => Promise<LunchBoxActionResult<LunchBoxOperationsViewData>>;
  saveOperations: (
    date: string,
    expectedVersion: number,
    workShifts: LunchBoxWorkShiftInput[],
    ingredientPurchases: LunchBoxIngredientPurchaseInput[],
  ) => Promise<LunchBoxActionResult<LunchBoxOperationsViewData>>;
  today: string;
};

type WorkShiftDraft = LunchBoxWorkShiftInput & { clientId: string };
type IngredientPurchaseDraft = LunchBoxIngredientPurchaseInput & {
  clientId: string;
};

const inputClassName =
  "h-11 w-full min-w-0 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[#9aa4b2] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)] disabled:cursor-not-allowed disabled:opacity-60";
const fieldLabelClassName =
  "mb-1 block text-xs font-semibold text-[var(--text-muted)] xl:sr-only";
const toolbarButtonClassName = buttonClass(
  buttonStyles.base,
  buttonStyles.neutral,
  "h-11 shrink-0 px-3 text-sm",
);
const addButtonClassName = buttonClass(
  buttonStyles.base,
  buttonStyles.neutral,
  "h-11 shrink-0 px-3 text-sm text-[var(--brand)]",
);
const workerTypeOptions: LunchBoxWorkerType[] = ["STAFF", "TEMPORARY"];

export function LunchBoxOperationsBoard({
  initialData,
  loadOperations,
  saveOperations,
  today,
}: LunchBoxOperationsBoardProps) {
  const [viewData, setViewData] = useState(initialData);
  const [workShifts, setWorkShifts] = useState<WorkShiftDraft[]>(() =>
    createWorkShiftDrafts(initialData.dailyOperation),
  );
  const [ingredientPurchases, setIngredientPurchases] = useState<
    IngredientPurchaseDraft[]
  >(() => createIngredientPurchaseDrafts(initialData.dailyOperation));
  const [editorOpen, setEditorOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [failedDate, setFailedDate] = useState<string | null>(null);
  const [isLoadPending, startLoadTransition] = useTransition();
  const [isSavePending, startSaveTransition] = useTransition();
  const draftSequenceRef = useRef(0);
  const saveErrorRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const selectedDate = viewData.dailyOperation.date;
  const selectedDateHasRecord = viewData.dailyOperation.version > 0;
  const monthTotals = useMemo(
    () => createMonthTotals(viewData.monthSummary),
    [viewData.monthSummary],
  );
  const draftSummary = useMemo(
    () =>
      createLunchBoxOperationSummary({
        workShifts: workShifts.map((shift) => ({
          ...shift,
          workerType:
            shift.workerType === "TEMPORARY" ? "TEMPORARY" : "STAFF",
          laborCost:
            shift.workerType === "TEMPORARY"
              ? parseDraftWon(shift.laborCost)
              : null,
        })),
        ingredientPurchases: ingredientPurchases.map((purchase) => ({
          purchaseAmount: parseDraftWon(purchase.purchaseAmount),
        })),
      }),
    [ingredientPurchases, workShifts],
  );
  const interactionPending = isLoadPending || pendingDate !== null;

  function applyCanonicalView(nextData: LunchBoxOperationsViewData) {
    setViewData(nextData);
    setWorkShifts(createWorkShiftDrafts(nextData.dailyOperation));
    setIngredientPurchases(
      createIngredientPurchaseDrafts(nextData.dailyOperation),
    );
    setDirty(false);
    setSaveError("");
    syncOperationsDateInHistory(nextData.dailyOperation.date);
  }

  function requestDate(
    date: string,
    openEditorAfterLoad = false,
    forceReload = false,
  ) {
    if (!date || interactionPending || isSavePending) {
      return;
    }

    if (editorOpen && dirty && !confirmDiscardChanges()) {
      return;
    }

    if (date === selectedDate && !forceReload) {
      if (openEditorAfterLoad) {
        setSaveError("");
        setEditorOpen(true);
      }
      return;
    }

    setPendingDate(date);
    setLoadError("");
    setSuccess("");

    startLoadTransition(async () => {
      try {
        const result = await loadOperations(date);

        if (!result.ok) {
          setLoadError(result.error);
          setFailedDate(date);
          return;
        }

        applyCanonicalView(result.data);
        setFailedDate(null);
        setEditorOpen(openEditorAfterLoad);
      } catch {
        setLoadError(
          "운영 기록을 불러오지 못했습니다. 잠시 후 다시 시도하세요.",
        );
        setFailedDate(date);
      } finally {
        setPendingDate(null);
      }
    });
  }

  function openSelectedDateEditor() {
    setSaveError("");
    setSuccess("");
    setEditorOpen(true);
  }

  function closeEditor() {
    if (isSavePending) {
      return;
    }

    if (dirty && !confirmDiscardChanges()) {
      return;
    }

    setWorkShifts(createWorkShiftDrafts(viewData.dailyOperation));
    setIngredientPurchases(
      createIngredientPurchaseDrafts(viewData.dailyOperation),
    );
    setDirty(false);
    setSaveError("");
    setEditorOpen(false);
  }

  function addWorkShift() {
    if (workShifts.length >= maxLunchBoxWorkShiftCount) {
      showSaveError(
        `근무 기록은 하루 ${maxLunchBoxWorkShiftCount}건까지 입력할 수 있습니다.`,
      );
      return;
    }

    draftSequenceRef.current += 1;
    setWorkShifts((current) => [
      ...current,
      {
        clientId: `new-shift-${draftSequenceRef.current}`,
        workerType: "",
        workerName: "",
        startTime: "",
        endTime: "",
        laborCost: "",
        note: "",
      },
    ]);
    markDirty();
  }

  function addIngredientPurchase() {
    if (ingredientPurchases.length >= maxLunchBoxIngredientPurchaseCount) {
      showSaveError(
        `식재료 구매는 하루 ${maxLunchBoxIngredientPurchaseCount}건까지 입력할 수 있습니다.`,
      );
      return;
    }

    draftSequenceRef.current += 1;
    setIngredientPurchases((current) => [
      ...current,
      {
        clientId: `new-purchase-${draftSequenceRef.current}`,
        itemName: "",
        quantity: "",
        unit: "",
        purchaseAmount: "",
        note: "",
      },
    ]);
    markDirty();
  }

  function updateWorkShift(
    clientId: string,
    field: keyof LunchBoxWorkShiftInput,
    value: string,
  ) {
    setWorkShifts((current) =>
      current.map((shift) =>
        shift.clientId === clientId
          ? {
              ...shift,
              [field]: value,
              ...(field === "workerType" && value !== "TEMPORARY"
                ? { laborCost: "" }
                : {}),
            }
          : shift,
      ),
    );
    markDirty();
  }

  function updateIngredientPurchase(
    clientId: string,
    field: keyof LunchBoxIngredientPurchaseInput,
    value: string,
  ) {
    setIngredientPurchases((current) =>
      current.map((purchase) =>
        purchase.clientId === clientId
          ? { ...purchase, [field]: value }
          : purchase,
      ),
    );
    markDirty();
  }

  function removeWorkShift(clientId: string) {
    setWorkShifts((current) =>
      current.filter((shift) => shift.clientId !== clientId),
    );
    markDirty();
  }

  function removeIngredientPurchase(clientId: string) {
    setIngredientPurchases((current) =>
      current.filter((purchase) => purchase.clientId !== clientId),
    );
    markDirty();
  }

  function markDirty() {
    setDirty(true);
    setSaveError("");
  }

  function showSaveError(message: string) {
    setSaveError(message);
    window.requestAnimationFrame(() => saveErrorRef.current?.focus());
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!dirty || isSavePending) {
      return;
    }

    const shiftInputs = workShifts.map(stripWorkShiftClientId);
    const purchaseInputs = ingredientPurchases.map(
      stripIngredientPurchaseClientId,
    );
    const validation = validateLunchBoxOperationsInput({
      workShifts: shiftInputs,
      ingredientPurchases: purchaseInputs,
    });

    if (!validation.ok) {
      showSaveError(validation.error);
      return;
    }

    if (
      selectedDateHasRecord &&
      shiftInputs.length === 0 &&
      purchaseInputs.length === 0 &&
      !window.confirm(
        `${formatLunchBoxDateLabel(selectedDate)}의 근무·지출 기록을 모두 삭제할까요? 삭제 후에는 감사 기록만 남습니다.`,
      )
    ) {
      return;
    }

    setSaveError("");

    startSaveTransition(async () => {
      try {
        const result = await saveOperations(
          selectedDate,
          viewData.dailyOperation.version,
          shiftInputs,
          purchaseInputs,
        );

        if (!result.ok) {
          showSaveError(result.error);
          return;
        }

        applyCanonicalView(result.data);
        setEditorOpen(false);
        setSuccess(
          shiftInputs.length === 0 && purchaseInputs.length === 0
            ? `${formatLunchBoxDateLabel(selectedDate)} 기록을 삭제했습니다.`
            : `${formatLunchBoxDateLabel(selectedDate)} 근무·지출 기록을 저장했습니다.`,
        );
      } catch {
        showSaveError(
          "근무·지출 기록을 저장하지 못했습니다. 입력 내용은 유지되었으니 다시 시도하세요.",
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      <section
        aria-labelledby="lunch-box-operations-title"
        className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-sm"
      >
        <div className="flex min-w-0 flex-col gap-3 border-b border-[var(--border)] px-3 py-3 sm:px-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2
              className="text-base font-semibold text-[var(--foreground)]"
              id="lunch-box-operations-title"
            >
              근무·지출 운영 기록
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">
              직원과 별도 고용 인력을 구분하고, 추가 고용비와 식재료 구매를 날짜별로 기록합니다.
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              aria-label="이전 달 운영 기록"
              className={toolbarButtonClassName}
              disabled={interactionPending || isSavePending}
              onClick={() =>
                requestDate(`${shiftLunchBoxMonth(viewData.month, -1)}-01`)
              }
              type="button"
            >
              이전 달
            </button>
            <DatePickerInput
              aria-label="운영 기록 날짜"
              className={`${inputClassName} w-40 max-w-40 shrink-0 tabular-nums`}
              disabled={interactionPending || isSavePending}
              onChange={(event) => requestDate(event.target.value)}
              value={pendingDate ?? selectedDate}
            />
            <button
              aria-label="다음 달 운영 기록"
              className={toolbarButtonClassName}
              disabled={interactionPending || isSavePending}
              onClick={() =>
                requestDate(`${shiftLunchBoxMonth(viewData.month, 1)}-01`)
              }
              type="button"
            >
              다음 달
            </button>
            <button
              className={toolbarButtonClassName}
              disabled={interactionPending || isSavePending}
              onClick={() => requestDate(today)}
              type="button"
            >
              오늘
            </button>
            <button
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.primary,
                "h-11 px-4 text-sm",
              )}
              disabled={interactionPending || isSavePending}
              onClick={openSelectedDateEditor}
              type="button"
            >
              {selectedDateHasRecord ? "선택일 기록 수정" : "선택일 기록 입력"}
            </button>
          </div>
        </div>

        <MonthMetricGrid totals={monthTotals} />
      </section>

      {interactionPending ? (
        <p
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--text-muted)]"
          role="status"
        >
          {pendingDate
            ? `${formatLunchBoxDateLabel(pendingDate)} 기록을 불러오는 중입니다.`
            : "운영 기록을 불러오는 중입니다."}
        </p>
      ) : null}

      {loadError ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]"
          role="alert"
        >
          <span>{loadError}</span>
          <button
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.dangerOutline,
              "h-11 px-3 text-sm",
            )}
            onClick={() =>
              requestDate(failedDate ?? selectedDate, false, true)
            }
            type="button"
          >
            다시 불러오기
          </button>
        </div>
      ) : null}

      {success ? (
        <p
          className="rounded-md border border-[#bddfc9] bg-[#e8f5ed] px-3 py-2 text-sm font-semibold text-[#22633a]"
          role="status"
        >
          {success}
        </p>
      ) : null}

      <MonthOperationsList
        month={viewData.month}
        onEditDate={(date) => requestDate(date, true)}
        rows={viewData.monthSummary}
        selectedDate={selectedDate}
      />

      {editorOpen ? (
        <AppModal
          className="flex h-full max-w-[88rem] flex-col sm:h-[calc(100dvh-3rem)]"
          describedBy={descriptionId}
          labelledBy={titleId}
          mobileFullscreen
          onClose={closeEditor}
        >
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={handleSave}
          >
            <div className="flex min-w-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2
                  className="text-lg font-semibold text-[var(--foreground)]"
                  id={titleId}
                >
                  {formatLunchBoxDateLabel(selectedDate)} 근무·지출
                </h2>
                <p
                  className="mt-1 text-xs leading-5 text-[var(--text-muted)]"
                  id={descriptionId}
                >
                  이 날짜에 실제로 발생한 값만 입력하세요. 다른 날짜에는 반영되지 않습니다.
                </p>
              </div>
              <button
                className={toolbarButtonClassName}
                disabled={isSavePending}
                onClick={closeEditor}
                type="button"
              >
                닫기
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--background)] px-3 py-3 sm:px-5 sm:py-4">
              <DailyDraftSummary summary={draftSummary} />

              {saveError ? (
                <div
                  className="mt-3 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm font-semibold text-[#8a1f1f] outline-none"
                  ref={saveErrorRef}
                  role="alert"
                  tabIndex={-1}
                >
                  {saveError}
                </div>
              ) : null}

              <div className="mt-3 space-y-3">
                <WorkShiftEditor
                  disabled={isSavePending}
                  onAdd={addWorkShift}
                  onRemove={removeWorkShift}
                  onUpdate={updateWorkShift}
                  rows={workShifts}
                />
                <IngredientPurchaseEditor
                  disabled={isSavePending}
                  onAdd={addIngredientPurchase}
                  onRemove={removeIngredientPurchase}
                  onUpdate={updateIngredientPurchase}
                  rows={ingredientPurchases}
                />
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-5">
              <p
                className={`text-xs font-semibold ${
                  dirty ? "text-[#8a5a12]" : "text-[var(--text-muted)]"
                }`}
                role="status"
              >
                {isSavePending
                  ? "저장 중입니다."
                  : dirty
                    ? "저장하지 않은 변경사항이 있습니다."
                    : viewData.dailyOperation.updatedAt
                      ? `마지막 저장 ${formatUpdatedAt(
                          viewData.dailyOperation.updatedAt,
                        )}${
                          viewData.dailyOperation.updatedByName
                            ? ` · ${viewData.dailyOperation.updatedByName}`
                            : ""
                        }`
                      : "아직 저장된 기록이 없습니다."}
              </p>
              <div className="flex items-center gap-2">
                <button
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.neutral,
                    "h-11 px-4 text-sm",
                  )}
                  disabled={isSavePending}
                  onClick={closeEditor}
                  type="button"
                >
                  취소
                </button>
                <button
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.save,
                    "h-11 px-5 text-sm",
                  )}
                  disabled={!dirty || isSavePending}
                  type="submit"
                >
                  {isSavePending ? "저장 중" : "변경사항 저장"}
                </button>
              </div>
            </div>
          </form>
        </AppModal>
      ) : null}
    </div>
  );
}

function MonthMetricGrid({ totals }: { totals: ReturnType<typeof createMonthTotals> }) {
  const metrics = [
    { label: "기록일", value: `${totals.recordedDays.toLocaleString("ko-KR")}일` },
    { label: "총 근무시간", value: formatLunchBoxWorkMinutes(totals.totalMinutes) },
    { label: "추가 고용비", value: formatLunchBoxWon(totals.laborCost) },
    {
      label: "식재료비",
      value: formatLunchBoxWon(totals.ingredientPurchaseCost),
    },
    { label: "추가 지출 합계", value: formatLunchBoxWon(totals.totalCost) },
  ];

  return (
    <dl className="grid grid-cols-2 border-b border-[var(--border)] sm:grid-cols-3 md:grid-cols-5 md:border-b-0">
      {metrics.map((metric, index) => (
        <div
          className={[
            "min-w-0 border-r border-t border-[var(--border)] px-3 py-2.5 md:border-t-0",
            index === metrics.length - 1
              ? "col-span-2 border-r-0 sm:col-span-1"
              : "",
          ].join(" ")}
          key={metric.label}
        >
          <dt className="text-[11px] font-semibold text-[var(--text-muted)]">
            {metric.label}
          </dt>
          <dd className="mt-1 truncate text-base font-semibold tabular-nums text-[var(--foreground)]">
            {metric.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MonthOperationsList({
  month,
  onEditDate,
  rows,
  selectedDate,
}: {
  month: string;
  onEditDate: (date: string) => void;
  rows: LunchBoxOperationMonthSummaryRow[];
  selectedDate: string;
}) {
  return (
    <section
      aria-labelledby="lunch-box-month-operations-title"
      className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-sm"
    >
      <div className="border-b border-[var(--border)] px-3 py-3 sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <h2
            className="text-base font-semibold text-[var(--foreground)]"
            id="lunch-box-month-operations-title"
          >
            {formatLunchBoxMonthLabel(month)} 날짜별 운영 내역
          </h2>
          <span className="shrink-0 rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--text-muted)]">
            {rows.length.toLocaleString("ko-KR")}일
          </span>
        </div>
      </div>

      {rows.length > 0 ? (
        <>
          <div className="hidden grid-cols-[6.5rem_minmax(0,1.2fr)_6.5rem_7rem_minmax(0,1fr)_7rem_7rem_4.5rem] gap-3 border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2 text-xs font-semibold text-[var(--text-muted)] xl:grid">
            <span>날짜</span>
            <span>근무자·시간</span>
            <span className="text-right">총 근무</span>
            <span className="text-right">추가 고용비</span>
            <span>식재료 구매</span>
            <span className="text-right">식재료비</span>
            <span className="text-right">추가 지출 합계</span>
            <span className="text-center">관리</span>
          </div>
          <ol className="divide-y divide-[var(--border)]">
            {rows.map((row) => (
              <MonthOperationRow
                key={row.date}
                onEdit={() => onEditDate(row.date)}
                row={row}
                selected={row.date === selectedDate}
              />
            ))}
          </ol>
        </>
      ) : (
        <div className="flex min-h-32 flex-col items-center justify-center px-4 py-5 text-center">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            이 달에 저장된 운영 기록이 없습니다.
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            위에서 날짜를 선택한 뒤 근무와 식재료 구매 내역을 입력하세요.
          </p>
        </div>
      )}
    </section>
  );
}

function MonthOperationRow({
  onEdit,
  row,
  selected,
}: {
  onEdit: () => void;
  row: LunchBoxOperationMonthSummaryRow;
  selected: boolean;
}) {
  return (
    <li
      className={[
        "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-3 py-3 transition hover:bg-[var(--surface-hover)] sm:px-4 xl:grid-cols-[6.5rem_minmax(0,1.2fr)_6.5rem_7rem_minmax(0,1fr)_7rem_7rem_4.5rem] xl:items-center",
        selected ? "bg-[var(--brand-soft)]" : "",
      ].join(" ")}
    >
      <div className="col-start-1 row-start-1 min-w-0 xl:col-auto xl:row-auto">
        <p className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
          {formatLunchBoxDateLabel(row.date)}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)] xl:hidden">
          근무자 {row.workerCount}명 · 식재료 {row.ingredientItemCount}건
        </p>
      </div>
      <div className="col-start-1 row-start-2 min-w-0 xl:col-start-2 xl:row-start-1">
        <p className="truncate text-sm text-[var(--foreground)]">
          {formatShiftItems(row)}
        </p>
      </div>
      <p className="col-start-1 row-start-3 text-xs tabular-nums text-[var(--text-muted)] xl:col-start-3 xl:row-start-1 xl:text-right xl:text-sm xl:text-[var(--foreground)]">
        <span className="font-semibold xl:hidden">총 근무 </span>
        {formatLunchBoxWorkMinutes(row.totalMinutes)}
      </p>
      <p className="col-start-2 row-start-3 text-right text-xs tabular-nums text-[var(--text-muted)] xl:col-start-4 xl:row-start-1 xl:text-sm xl:text-[var(--foreground)]">
        <span className="font-semibold xl:hidden">추가 고용비 </span>
        {formatLunchBoxWon(row.laborCost)}
      </p>
      <div className="col-span-2 row-start-4 min-w-0 xl:col-span-1 xl:col-start-5 xl:row-start-1">
        <p className="truncate text-xs text-[var(--text-muted)] xl:text-sm xl:text-[var(--foreground)]">
          {formatIngredientItems(row)}
        </p>
      </div>
      <p className="col-start-1 row-start-5 text-xs tabular-nums text-[var(--text-muted)] xl:col-start-6 xl:row-start-1 xl:text-right xl:text-sm xl:text-[var(--foreground)]">
        <span className="font-semibold xl:hidden">식재료비 </span>
        {formatLunchBoxWon(row.ingredientPurchaseCost)}
      </p>
      <p className="col-start-2 row-start-5 text-right text-sm font-semibold tabular-nums text-[var(--foreground)] xl:col-start-7 xl:row-start-1">
        <span className="mr-1 text-xs font-semibold text-[var(--text-muted)] xl:hidden">
          추가 지출 합계
        </span>
        {formatLunchBoxWon(row.totalCost)}
      </p>
      <button
        aria-label={`${formatLunchBoxDateLabel(row.date)} 운영 기록 수정`}
        className={buttonClass(
          buttonStyles.base,
          buttonStyles.neutral,
          "col-start-2 row-span-2 row-start-1 h-11 px-3 text-sm xl:col-start-8 xl:row-span-1 xl:row-start-1",
        )}
        onClick={onEdit}
        type="button"
      >
        수정
      </button>
    </li>
  );
}

function DailyDraftSummary({
  summary,
}: {
  summary: ReturnType<typeof createLunchBoxOperationSummary>;
}) {
  const metrics = [
    { label: "근무 인원", value: `${summary.workerCount}명` },
    { label: "총 근무", value: formatLunchBoxWorkMinutes(summary.totalMinutes) },
    { label: "추가 고용비", value: formatLunchBoxWon(summary.laborCost) },
    {
      label: "식재료비",
      value: formatLunchBoxWon(summary.ingredientPurchaseCost),
    },
    { label: "추가 지출 합계", value: formatLunchBoxWon(summary.totalCost) },
  ];

  return (
    <dl
      aria-label="선택일 입력 합계"
      className="grid grid-cols-2 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] sm:grid-cols-5"
    >
      {metrics.map((metric, index) => (
        <div
          className={[
            "min-w-0 border-r border-b border-[var(--border)] px-3 py-2 sm:border-b-0",
            index === metrics.length - 1
              ? "col-span-2 border-r-0 sm:col-span-1"
              : "",
          ].join(" ")}
          key={metric.label}
        >
          <dt className="text-[11px] font-semibold text-[var(--text-muted)]">
            {metric.label}
          </dt>
          <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-[var(--foreground)]">
            {metric.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function WorkShiftEditor({
  disabled,
  onAdd,
  onRemove,
  onUpdate,
  rows,
}: {
  disabled: boolean;
  onAdd: () => void;
  onRemove: (clientId: string) => void;
  onUpdate: (
    clientId: string,
    field: keyof LunchBoxWorkShiftInput,
    value: string,
  ) => void;
  rows: WorkShiftDraft[];
}) {
  const workerTypeHelpId = useId();

  return (
    <fieldset className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]">
      <legend className="sr-only">근무 기록</legend>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 sm:px-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            근무 기록
          </h3>
          <p
            className="mt-0.5 text-[11px] text-[var(--text-muted)]"
            id={workerTypeHelpId}
          >
            직원은 월급에 포함하고, 별도 고용 인력만 추가 고용비를 입력합니다.
          </p>
        </div>
        <button
          className={addButtonClassName}
          disabled={disabled || rows.length >= maxLunchBoxWorkShiftCount}
          onClick={onAdd}
          type="button"
        >
          근무자 추가
        </button>
      </div>

      <div className="hidden grid-cols-[2rem_7.5rem_minmax(8rem,1fr)_7.5rem_7.5rem_7rem_9rem_minmax(8rem,1fr)_3rem] gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[11px] font-semibold text-[var(--text-muted)] xl:grid">
        <span>번호</span>
        <span>근무 구분</span>
        <span>근무자</span>
        <span>시작</span>
        <span>종료</span>
        <span>근무시간</span>
        <span>추가 고용비</span>
        <span>비고</span>
        <span className="sr-only">행 관리</span>
      </div>

      {rows.length > 0 ? (
        <ol className="divide-y divide-[var(--border)]">
          {rows.map((row, index) => {
            const minutes = getLunchBoxShiftMinutes(
              row.startTime,
              row.endTime,
            );

            return (
              <li
                className="grid grid-cols-2 gap-2 px-3 py-3 sm:px-4 xl:grid-cols-[2rem_7.5rem_minmax(8rem,1fr)_7.5rem_7.5rem_7rem_9rem_minmax(8rem,1fr)_3rem] xl:items-end xl:px-3 xl:py-2"
                key={row.clientId}
              >
                <span className="col-span-2 flex h-6 items-center text-xs font-semibold tabular-nums text-[var(--text-muted)] xl:col-span-1 xl:h-11">
                  {index + 1}
                </span>
                <label className="col-span-2 min-w-0 xl:col-span-1">
                  <span className={fieldLabelClassName}>근무 구분</span>
                  <select
                    aria-describedby={workerTypeHelpId}
                    aria-label={`근무 ${index + 1}행 근무 구분`}
                    className={inputClassName}
                    disabled={disabled}
                    onChange={(event) =>
                      onUpdate(row.clientId, "workerType", event.target.value)
                    }
                    required
                    value={row.workerType}
                  >
                    <option value="">구분 선택</option>
                    {workerTypeOptions.map((workerType) => (
                      <option key={workerType} value={workerType}>
                        {getLunchBoxWorkerTypeLabel(workerType)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 min-w-0 xl:col-span-1">
                  <span className={fieldLabelClassName}>근무자</span>
                  <input
                    aria-label={`근무 ${index + 1}행 근무자`}
                    className={inputClassName}
                    disabled={disabled}
                    maxLength={50}
                    onChange={(event) =>
                      onUpdate(row.clientId, "workerName", event.target.value)
                    }
                    placeholder="이름"
                    required
                    value={row.workerName}
                  />
                </label>
                <label className="min-w-0">
                  <span className={fieldLabelClassName}>시작 시간</span>
                  <input
                    aria-label={`근무 ${index + 1}행 시작 시간`}
                    className={`${inputClassName} tabular-nums`}
                    disabled={disabled}
                    onChange={(event) =>
                      onUpdate(row.clientId, "startTime", event.target.value)
                    }
                    required
                    type="time"
                    value={row.startTime}
                  />
                </label>
                <label className="min-w-0">
                  <span className={fieldLabelClassName}>종료 시간</span>
                  <input
                    aria-label={`근무 ${index + 1}행 종료 시간`}
                    className={`${inputClassName} tabular-nums`}
                    disabled={disabled}
                    onChange={(event) =>
                      onUpdate(row.clientId, "endTime", event.target.value)
                    }
                    required
                    type="time"
                    value={row.endTime}
                  />
                </label>
                <div className="min-w-0">
                  <span className={fieldLabelClassName}>근무시간</span>
                  <output
                    aria-label={`근무 ${index + 1}행 계산 근무시간`}
                    className="flex h-11 items-center rounded-md bg-[var(--surface-muted)] px-3 text-sm font-semibold tabular-nums text-[var(--foreground)]"
                  >
                    {minutes > 0 ? formatLunchBoxWorkMinutes(minutes) : "-"}
                  </output>
                </div>
                {row.workerType === "STAFF" ? (
                  <div className="min-w-0">
                    <span className={fieldLabelClassName}>추가 고용비</span>
                    <output
                      aria-label={`근무 ${index + 1}행 추가 고용비`}
                      className="flex h-11 items-center rounded-md bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--text-muted)]"
                    >
                      월급 포함
                    </output>
                  </div>
                ) : row.workerType === "TEMPORARY" ? (
                  <label className="min-w-0">
                    <span className={fieldLabelClassName}>추가 고용비</span>
                    <div className="relative">
                      <input
                        aria-label={`근무 ${index + 1}행 추가 고용비`}
                        className={`${inputClassName} pr-8 text-right tabular-nums`}
                        disabled={disabled}
                        inputMode="numeric"
                        maxLength={11}
                        onChange={(event) =>
                          onUpdate(
                            row.clientId,
                            "laborCost",
                            event.target.value,
                          )
                        }
                        pattern="[0-9,]*"
                        placeholder="0"
                        required
                        value={row.laborCost}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[var(--text-muted)]">
                        원
                      </span>
                    </div>
                  </label>
                ) : (
                  <div className="min-w-0">
                    <span className={fieldLabelClassName}>추가 고용비</span>
                    <output
                      aria-label={`근무 ${index + 1}행 추가 고용비`}
                      className="flex h-11 items-center rounded-md bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--text-muted)]"
                    >
                      구분 먼저 선택
                    </output>
                  </div>
                )}
                <label className="col-span-2 min-w-0 xl:col-span-1">
                  <span className={fieldLabelClassName}>비고</span>
                  <input
                    aria-label={`근무 ${index + 1}행 비고`}
                    className={inputClassName}
                    disabled={disabled}
                    maxLength={200}
                    onChange={(event) =>
                      onUpdate(row.clientId, "note", event.target.value)
                    }
                    placeholder="선택 입력"
                    value={row.note}
                  />
                </label>
                <button
                  aria-label={`근무 ${index + 1}행 삭제`}
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.dangerOutline,
                    "col-span-2 h-11 px-3 text-sm xl:col-span-1 xl:px-0",
                  )}
                  disabled={disabled}
                  onClick={() => onRemove(row.clientId)}
                  type="button"
                >
                  <span className="xl:sr-only">행 삭제</span>
                  <span aria-hidden="true" className="hidden xl:inline">
                    ×
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="flex min-h-28 items-center justify-center px-4 py-4 text-center text-sm text-[var(--text-muted)]">
          등록된 근무자가 없습니다. 근무자가 있었던 날만 행을 추가하세요.
        </p>
      )}
    </fieldset>
  );
}

function IngredientPurchaseEditor({
  disabled,
  onAdd,
  onRemove,
  onUpdate,
  rows,
}: {
  disabled: boolean;
  onAdd: () => void;
  onRemove: (clientId: string) => void;
  onUpdate: (
    clientId: string,
    field: keyof LunchBoxIngredientPurchaseInput,
    value: string,
  ) => void;
  rows: IngredientPurchaseDraft[];
}) {
  return (
    <fieldset className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]">
      <legend className="sr-only">식재료 구매</legend>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 sm:px-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            식재료 구매
          </h3>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            품목별 실제 구매량·단위와 당일 구매비
          </p>
        </div>
        <button
          className={addButtonClassName}
          disabled={
            disabled || rows.length >= maxLunchBoxIngredientPurchaseCount
          }
          onClick={onAdd}
          type="button"
        >
          구매 항목 추가
        </button>
      </div>

      <div className="hidden grid-cols-[2rem_minmax(9rem,1.2fr)_8rem_7rem_10rem_minmax(8rem,1fr)_3rem] gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[11px] font-semibold text-[var(--text-muted)] xl:grid">
        <span>번호</span>
        <span>품목</span>
        <span>구매량</span>
        <span>단위</span>
        <span>구매비</span>
        <span>비고</span>
        <span className="sr-only">행 관리</span>
      </div>

      {rows.length > 0 ? (
        <ol className="divide-y divide-[var(--border)]">
          {rows.map((row, index) => (
            <li
              className="grid grid-cols-2 gap-2 px-3 py-3 sm:px-4 xl:grid-cols-[2rem_minmax(9rem,1.2fr)_8rem_7rem_10rem_minmax(8rem,1fr)_3rem] xl:items-end xl:px-3 xl:py-2"
              key={row.clientId}
            >
              <span className="col-span-2 flex h-6 items-center text-xs font-semibold tabular-nums text-[var(--text-muted)] xl:col-span-1 xl:h-11">
                {index + 1}
              </span>
              <label className="col-span-2 min-w-0 xl:col-span-1">
                <span className={fieldLabelClassName}>품목</span>
                <input
                  aria-label={`식재료 ${index + 1}행 품목`}
                  className={inputClassName}
                  disabled={disabled}
                  maxLength={100}
                  onChange={(event) =>
                    onUpdate(row.clientId, "itemName", event.target.value)
                  }
                  placeholder="예: 감자, 식용유"
                  required
                  value={row.itemName}
                />
              </label>
              <label className="min-w-0">
                <span className={fieldLabelClassName}>구매량</span>
                <input
                  aria-label={`식재료 ${index + 1}행 구매량`}
                  className={`${inputClassName} text-right tabular-nums`}
                  disabled={disabled}
                  inputMode="decimal"
                  maxLength={13}
                  onChange={(event) =>
                    onUpdate(row.clientId, "quantity", event.target.value)
                  }
                  pattern="[0-9]+([.][0-9]{1,3})?"
                  placeholder="0"
                  required
                  value={row.quantity}
                />
              </label>
              <label className="min-w-0">
                <span className={fieldLabelClassName}>단위</span>
                <input
                  aria-label={`식재료 ${index + 1}행 단위`}
                  className={inputClassName}
                  disabled={disabled}
                  maxLength={20}
                  onChange={(event) =>
                    onUpdate(row.clientId, "unit", event.target.value)
                  }
                  placeholder="kg, 개, 묶음"
                  required
                  value={row.unit}
                />
              </label>
              <label className="min-w-0">
                <span className={fieldLabelClassName}>구매비</span>
                <div className="relative">
                  <input
                    aria-label={`식재료 ${index + 1}행 구매비`}
                    className={`${inputClassName} pr-8 text-right tabular-nums`}
                    disabled={disabled}
                    inputMode="numeric"
                    maxLength={11}
                    onChange={(event) =>
                      onUpdate(
                        row.clientId,
                        "purchaseAmount",
                        event.target.value,
                      )
                    }
                    pattern="[0-9,]*"
                    placeholder="0"
                    required
                    value={row.purchaseAmount}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[var(--text-muted)]">
                    원
                  </span>
                </div>
              </label>
              <label className="col-span-2 min-w-0 xl:col-span-1">
                <span className={fieldLabelClassName}>비고</span>
                <input
                  aria-label={`식재료 ${index + 1}행 비고`}
                  className={inputClassName}
                  disabled={disabled}
                  maxLength={200}
                  onChange={(event) =>
                    onUpdate(row.clientId, "note", event.target.value)
                  }
                  placeholder="구매처 등 선택 입력"
                  value={row.note}
                />
              </label>
              <button
                aria-label={`식재료 ${index + 1}행 삭제`}
                className={buttonClass(
                  buttonStyles.base,
                  buttonStyles.dangerOutline,
                  "col-span-2 h-11 px-3 text-sm xl:col-span-1 xl:px-0",
                )}
                disabled={disabled}
                onClick={() => onRemove(row.clientId)}
                type="button"
              >
                <span className="xl:sr-only">행 삭제</span>
                <span aria-hidden="true" className="hidden xl:inline">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="flex min-h-28 items-center justify-center px-4 py-4 text-center text-sm text-[var(--text-muted)]">
          등록된 식재료 구매가 없습니다. 구매가 있었던 날만 행을 추가하세요.
        </p>
      )}
    </fieldset>
  );
}

function createWorkShiftDrafts(
  operation: LunchBoxDailyOperation,
): WorkShiftDraft[] {
  return operation.workShifts.map((shift) => ({
    clientId: shift.id,
    workerType: shift.workerType,
    workerName: shift.workerName,
    startTime: shift.startTime,
    endTime: shift.endTime,
    laborCost: shift.laborCost === null ? "" : String(shift.laborCost),
    note: shift.note ?? "",
  }));
}

function createIngredientPurchaseDrafts(
  operation: LunchBoxDailyOperation,
): IngredientPurchaseDraft[] {
  return operation.ingredientPurchases.map((purchase) => ({
    clientId: purchase.id,
    itemName: purchase.itemName,
    quantity: purchase.quantity,
    unit: purchase.unit,
    purchaseAmount: String(purchase.purchaseAmount),
    note: purchase.note ?? "",
  }));
}

function stripWorkShiftClientId(
  shift: WorkShiftDraft,
): LunchBoxWorkShiftInput {
  return {
    workerType: shift.workerType,
    workerName: shift.workerName,
    startTime: shift.startTime,
    endTime: shift.endTime,
    laborCost: shift.laborCost,
    note: shift.note,
  };
}

function stripIngredientPurchaseClientId(
  purchase: IngredientPurchaseDraft,
): LunchBoxIngredientPurchaseInput {
  return {
    itemName: purchase.itemName,
    quantity: purchase.quantity,
    unit: purchase.unit,
    purchaseAmount: purchase.purchaseAmount,
    note: purchase.note,
  };
}

function createMonthTotals(rows: LunchBoxOperationMonthSummaryRow[]) {
  return rows.reduce(
    (totals, row) => ({
      recordedDays: totals.recordedDays + 1,
      totalMinutes: totals.totalMinutes + row.totalMinutes,
      laborCost: totals.laborCost + row.laborCost,
      ingredientPurchaseCost:
        totals.ingredientPurchaseCost + row.ingredientPurchaseCost,
      totalCost: totals.totalCost + row.totalCost,
    }),
    {
      recordedDays: 0,
      totalMinutes: 0,
      laborCost: 0,
      ingredientPurchaseCost: 0,
      totalCost: 0,
    },
  );
}

function formatShiftItems(row: LunchBoxOperationMonthSummaryRow) {
  if (row.workShiftItems.length === 0) {
    return "근무 기록 없음";
  }

  const visible = row.workShiftItems
    .slice(0, 2)
    .map(
      (shift) =>
        `${shift.workerName} · ${getLunchBoxWorkerTypeLabel(shift.workerType)} ${shift.startTime}~${shift.endTime}`,
    )
    .join(" · ");
  const hiddenCount = row.workShiftItems.length - 2;

  return hiddenCount > 0 ? `${visible} 외 ${hiddenCount}건` : visible;
}

function formatIngredientItems(row: LunchBoxOperationMonthSummaryRow) {
  if (row.ingredientItems.length === 0) {
    return "구매 기록 없음";
  }

  const visible = row.ingredientItems
    .slice(0, 2)
    .map((item) => `${item.itemName} ${item.quantity}${item.unit}`)
    .join(" · ");
  const hiddenCount = row.ingredientItems.length - 2;

  return hiddenCount > 0 ? `${visible} 외 ${hiddenCount}건` : visible;
}

function parseDraftWon(value: string) {
  const parsed = Number(value.replaceAll(",", "").trim());

  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function confirmDiscardChanges() {
  return window.confirm(
    "저장하지 않은 변경사항이 있습니다. 변경을 버리고 계속할까요?",
  );
}

function syncOperationsDateInHistory(date: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", "operations");
  url.searchParams.set("date", date);
  window.history.replaceState(window.history.state, "", url);
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}
