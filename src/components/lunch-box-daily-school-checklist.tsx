"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { DatePickerInput } from "@/components/date-picker-input";
import { LunchBoxDailyCheckHistory } from "@/components/lunch-box-daily-check-history";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  createLunchBoxDailyChecklistView,
  formatLunchBoxDateLabel,
  formatLunchBoxPreservationCellTitle,
  formatLunchBoxPreservationChipLabel,
  getLunchBoxCountTotal,
  getLunchBoxSchoolTypeLabel,
  lunchBoxCountFieldLabels,
  lunchBoxDailyChecklistShortFieldLabels,
  lunchBoxServingCountFields,
  normalizeLunchBoxChecklistIds,
  resolveLunchBoxDisplayedChecklistIds,
  setLunchBoxChecklistIdChecked,
  shiftLunchBoxDate,
  type LunchBoxActionResult,
  type LunchBoxCountRow,
  type LunchBoxDailyCheckHistoryPage,
  type LunchBoxDailySchoolChecklistData,
  type LunchBoxServingCountField,
} from "@/lib/lunch-box-counts-core";
import {
  createLunchBoxRealtimeSyncCoordinator,
  requestLunchBoxRealtimeSync,
  type LunchBoxRealtimeSyncCoordinator,
} from "@/lib/lunch-box-realtime-sync";

type LunchBoxDailySchoolChecklistProps = {
  clearChecks: (
    date: string,
  ) => Promise<
    LunchBoxActionResult<{ checkedSchoolIds: string[]; date: string }>
  >;
  initialCheckHistoryPage: LunchBoxDailyCheckHistoryPage;
  initialChecklist: LunchBoxDailySchoolChecklistData;
  loadCheckHistory: (
    date: string,
    page: number,
  ) => Promise<LunchBoxActionResult<LunchBoxDailyCheckHistoryPage>>;
  loadChecklist: (
    date: string,
  ) => Promise<LunchBoxActionResult<LunchBoxDailySchoolChecklistData>>;
  setSchoolCheck: (
    date: string,
    schoolId: string,
    isChecked: boolean,
  ) => Promise<
    LunchBoxActionResult<{
      date: string;
      schoolId: string;
      isChecked: boolean;
    }>
  >;
  today: string;
};

type ToggleHandler = (schoolId: string) => void;
type RealtimeConnectionStatus =
  | "connected"
  | "connecting"
  | "offline"
  | "paused"
  | "reconnecting";

const realtimeChangeDebounceMs = 75;
const realtimeFallbackSyncIntervalMs = 5_000;
const realtimeSyncRetryMs = 3_000;
const realtimeStatusLabels: Record<RealtimeConnectionStatus, string> = {
  connected: "실시간 연결됨",
  connecting: "실시간 연결 중",
  offline: "오프라인 · 연결 복구 대기 중",
  paused: "탭 복귀 시 실시간 동기화",
  reconnecting: "실시간 재연결 중",
};
const navButtonClassName = buttonClass(
  buttonStyles.base,
  buttonStyles.neutral,
  "h-11 shrink-0 px-3 text-sm",
);
const secondaryButtonClassName = buttonClass(
  buttonStyles.base,
  buttonStyles.cancel,
  "h-11 shrink-0 px-3 text-xs",
);
const pdfButtonClassName = buttonClass(
  buttonStyles.base,
  buttonStyles.save,
  "h-11 shrink-0 px-3 text-xs",
);
const checkedRowClassName = [
  "hover:bg-[#eef7f6]",
  "has-[:checked]:bg-[#e8f5ed] has-[:checked]:hover:bg-[#e8f5ed]",
  "dark:has-[:checked]:bg-[rgb(35_134_54_/_0.16)] dark:has-[:checked]:hover:bg-[rgb(35_134_54_/_0.16)]",
].join(" ");
const chipRowClassName = [
  "flex min-h-11 items-center gap-2 px-3 py-1.5 transition-colors sm:px-4",
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
const numericCellClassName =
  "px-1 text-right text-[13px] leading-4 tabular-nums text-[#16181d]";
const chipClassName =
  "inline-flex shrink-0 items-center gap-1 rounded-md bg-[#eef1f5] px-1.5 py-0.5 text-xs leading-5 tabular-nums text-[#394150] sm:text-sm";

export function LunchBoxDailySchoolChecklist(
  props: LunchBoxDailySchoolChecklistProps,
) {
  return (
    <LunchBoxDailySchoolChecklistContent
      key={props.initialChecklist.grid.date}
      {...props}
    />
  );
}

function LunchBoxDailySchoolChecklistContent({
  clearChecks,
  initialCheckHistoryPage,
  initialChecklist,
  loadCheckHistory,
  loadChecklist,
  setSchoolCheck,
  today,
}: LunchBoxDailySchoolChecklistProps) {
  const [grid, setGrid] = useState(initialChecklist.grid);
  const [canonicalCheckedSchoolIds, setCanonicalCheckedSchoolIds] = useState(
    initialChecklist.checkedSchoolIds,
  );
  const [checkHistoryPage, setCheckHistoryPage] = useState(
    initialCheckHistoryPage,
  );
  const [checkHistoryError, setCheckHistoryError] = useState("");
  const [isCheckHistoryPending, setIsCheckHistoryPending] = useState(false);
  const [error, setError] = useState("");
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [pendingCheckStates, setPendingCheckStates] = useState<
    Map<string, boolean>
  >(
    () => new Map(),
  );
  const [isClearPending, setIsClearPending] = useState(false);
  const [realtimeConnectionStatus, setRealtimeConnectionStatus] =
    useState<RealtimeConnectionStatus>("connecting");
  const [realtimeSyncFailed, setRealtimeSyncFailed] = useState(false);
  const [isLoadPending, startLoadTransition] = useTransition();
  const activeDateRef = useRef(initialChecklist.grid.date);
  const checkHistoryPageRef = useRef(initialCheckHistoryPage.page);
  const checkHistoryRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const pendingDateRef = useRef<string | null>(null);
  const pendingCheckStatesRef = useRef(new Map<string, boolean>());
  const isClearPendingRef = useRef(false);
  const syncCoordinatorRef = useRef<LunchBoxRealtimeSyncCoordinator>(
    createLunchBoxRealtimeSyncCoordinator(initialChecklist.grid.date),
  );

  const canonicalChecklistView = useMemo(
    () =>
      createLunchBoxDailyChecklistView({
        checkedSchoolIds: canonicalCheckedSchoolIds,
        grid,
      }),
    [canonicalCheckedSchoolIds, grid],
  );
  const checkedIds = useMemo(
    () =>
      resolveLunchBoxDisplayedChecklistIds({
        canonicalCheckedIds: canonicalChecklistView.checkedSchoolIds,
        clearPending: isClearPending,
        pendingChecks: pendingCheckStates,
        rows: canonicalChecklistView.rows,
      }),
    [
      canonicalChecklistView,
      isClearPending,
      pendingCheckStates,
    ],
  );
  const checklistView = useMemo(
    () =>
      createLunchBoxDailyChecklistView({
        checkedSchoolIds: checkedIds,
        grid,
      }),
    [checkedIds, grid],
  );
  const {
    checkedCount,
    columns,
    dateLabel,
    hasDeliveryDriver,
    progressLabel,
    rows,
    summaryLabel,
    visibleServingFields,
  } = checklistView;
  const checkedIdSet = useMemo(() => new Set(checkedIds), [checkedIds]);
  const pendingSchoolIds = useMemo(
    () => new Set(pendingCheckStates.keys()),
    [pendingCheckStates],
  );
  const isLoading = isLoadPending || pendingDate !== null;
  const hasCheckSavePending = pendingCheckStates.size > 0;
  const hasInteractionPending =
    isLoading || hasCheckSavePending || isClearPending;
  const interactionStatusLabel = pendingDate
    ? `${formatLunchBoxDateLabel(pendingDate)} 불러오는 중`
    : isClearPending
      ? "이 날짜의 체크를 해제하는 중"
      : hasCheckSavePending
        ? `체크 상태 ${pendingSchoolIds.size}건 저장 중`
        : "";
  const realtimeStatusLabel = realtimeSyncFailed
    ? "최신 상태 동기화 재시도 중"
    : realtimeStatusLabels[realtimeConnectionStatus];
  const realtimeStatusClassName =
    realtimeConnectionStatus === "connected" && !realtimeSyncFailed
      ? "text-[#196b69]"
      : realtimeConnectionStatus === "connecting" ||
          realtimeConnectionStatus === "paused"
        ? "text-[#697386]"
        : "text-[#8a5a12]";

  const requestCanonicalSync = useCallback(
    async (date: string) => {
      const coordinator = syncCoordinatorRef.current;

      if (
        !isMountedRef.current ||
        pendingDateRef.current !== null ||
        activeDateRef.current !== date ||
        coordinator.date !== date
      ) {
        return false;
      }

      return requestLunchBoxRealtimeSync<LunchBoxDailySchoolChecklistData>({
        coordinator,
        isActive: () =>
          isMountedRef.current &&
          pendingDateRef.current === null &&
          activeDateRef.current === coordinator.date,
        load: async (activeDate) => {
          const result = await loadChecklist(activeDate);

          return result.ok
            ? { data: result.data, ok: true as const }
            : { ok: false as const };
        },
        apply: (data) => {
          const nextRows = data.grid.rows.filter(
            (row) => getLunchBoxCountTotal(row) > 0,
          );

          setGrid(data.grid);
          setCanonicalCheckedSchoolIds(
            normalizeLunchBoxChecklistIds(
              data.checkedSchoolIds,
              nextRows,
            ),
          );
          setRealtimeSyncFailed(false);
        },
        onFailure: () => setRealtimeSyncFailed(true),
      });
    },
    [loadChecklist],
  );

  const requestCheckHistoryPage = useCallback(
    async ({
      date,
      page,
      showPending = false,
    }: {
      date: string;
      page: number;
      showPending?: boolean;
    }) => {
      if (
        !isMountedRef.current ||
        pendingDateRef.current !== null ||
        activeDateRef.current !== date
      ) {
        return false;
      }

      const requestId = ++checkHistoryRequestIdRef.current;

      if (showPending) {
        setCheckHistoryError("");
        setIsCheckHistoryPending(true);
      }

      try {
        const result = await loadCheckHistory(date, page);

        if (
          !isMountedRef.current ||
          activeDateRef.current !== date ||
          requestId !== checkHistoryRequestIdRef.current
        ) {
          return false;
        }

        if (!result.ok) {
          setCheckHistoryError(result.error);
          return false;
        }

        checkHistoryPageRef.current = result.data.page;
        setCheckHistoryPage(result.data);
        setCheckHistoryError("");
        return true;
      } catch {
        if (
          isMountedRef.current &&
          activeDateRef.current === date &&
          requestId === checkHistoryRequestIdRef.current
        ) {
          setCheckHistoryError(
            "체크 변경 기록을 불러오지 못했습니다. 다시 시도하세요.",
          );
        }

        return false;
      } finally {
        if (
          isMountedRef.current &&
          requestId === checkHistoryRequestIdRef.current
        ) {
          setIsCheckHistoryPending(false);
        }
      }
    },
    [loadCheckHistory],
  );

  const requestCheckHistorySync = useCallback(
    (date: string) =>
      requestCheckHistoryPage({
        date,
        page: checkHistoryPageRef.current,
      }),
    [requestCheckHistoryPage],
  );

  useEffect(() => {
    syncDailyChecklistStateInHistory(
      grid.date,
      checkHistoryPage.page,
    );
  }, [checkHistoryPage.page, grid.date]);

  useEffect(() => {
    isMountedRef.current = true;
    activeDateRef.current = syncCoordinatorRef.current.date;

    return () => {
      isMountedRef.current = false;
      activeDateRef.current = "";
      checkHistoryRequestIdRef.current += 1;
      loadRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!realtimeSyncFailed) {
      return;
    }

    let disposed = false;
    let retryTimer: number | undefined;

    async function retryCanonicalSync() {
      if (disposed) {
        return;
      }

      if (
        document.visibilityState === "hidden" ||
        !navigator.onLine
      ) {
        retryTimer = window.setTimeout(
          () => void retryCanonicalSync(),
          realtimeSyncRetryMs,
        );
        return;
      }

      let succeeded = false;

      try {
        succeeded = await requestCanonicalSync(grid.date);
      } catch {
        // Keep retrying below; mutation cleanup must not depend on sync success.
      }

      if (!disposed && !succeeded) {
        retryTimer = window.setTimeout(
          () => void retryCanonicalSync(),
          realtimeSyncRetryMs,
        );
      }
    }

    retryTimer = window.setTimeout(
      () => void retryCanonicalSync(),
      realtimeSyncRetryMs,
    );

    return () => {
      disposed = true;

      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [grid.date, realtimeSyncFailed, requestCanonicalSync]);

  useEffect(() => {
    const date = grid.date;
    let changeDebounceTimer: number | undefined;
    let disposed = false;
    let eventSource: EventSource | null = null;
    let isRealtimeReady = false;

    function scheduleCanonicalSync(delay = realtimeChangeDebounceMs) {
      if (changeDebounceTimer) {
        window.clearTimeout(changeDebounceTimer);
      }

      changeDebounceTimer = window.setTimeout(() => {
        changeDebounceTimer = undefined;
        void requestCanonicalSync(date);
        void requestCheckHistorySync(date);
      }, delay);
    }

    function closeEventSource() {
      isRealtimeReady = false;
      eventSource?.close();
      eventSource = null;
    }

    function connect() {
      if (disposed || eventSource) {
        return;
      }

      if (document.visibilityState === "hidden") {
        setRealtimeConnectionStatus("paused");
        return;
      }

      if (!navigator.onLine) {
        setRealtimeConnectionStatus("offline");
        return;
      }

      setRealtimeConnectionStatus("connecting");

      const source = new EventSource(
        `/api/lunch-boxes/checks/stream?date=${encodeURIComponent(date)}`,
      );
      eventSource = source;

      source.addEventListener("ready", () => {
        if (disposed || eventSource !== source) {
          return;
        }

        setRealtimeConnectionStatus("connected");
        isRealtimeReady = true;
        scheduleCanonicalSync(0);
      });
      source.addEventListener("change", () => {
        if (!disposed && eventSource === source) {
          scheduleCanonicalSync();
        }
      });
      source.addEventListener("reconnect", () => {
        if (!disposed && eventSource === source) {
          isRealtimeReady = false;
          setRealtimeConnectionStatus("reconnecting");
        }
      });
      source.onerror = () => {
        if (!disposed && eventSource === source) {
          isRealtimeReady = false;
          const isOnline = navigator.onLine;
          setRealtimeConnectionStatus(
            isOnline ? "reconnecting" : "offline",
          );
        }
      };
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        closeEventSource();
        setRealtimeConnectionStatus("paused");
        return;
      }

      connect();
      scheduleCanonicalSync(0);
    }

    function handleOnline() {
      closeEventSource();
      connect();
      scheduleCanonicalSync(0);
    }

    function handleOffline() {
      closeEventSource();
      setRealtimeConnectionStatus("offline");
    }

    connect();
    const fallbackSyncTimer = window.setInterval(() => {
      if (
        !isRealtimeReady &&
        document.visibilityState !== "hidden" &&
        navigator.onLine
      ) {
        scheduleCanonicalSync(0);
      }
    }, realtimeFallbackSyncIntervalMs);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      closeEventSource();

      if (changeDebounceTimer) {
        window.clearTimeout(changeDebounceTimer);
      }

      window.clearInterval(fallbackSyncTimer);

      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, [grid.date, requestCanonicalSync, requestCheckHistorySync]);

  function loadDate(nextDate: string) {
    if (
      pendingDateRef.current !== null ||
      isLoadPending ||
      pendingCheckStatesRef.current.size > 0 ||
      isClearPendingRef.current ||
      nextDate === grid.date
    ) {
      return;
    }

    setError("");
    pendingDateRef.current = nextDate;
    setPendingDate(nextDate);
    const requestId = ++loadRequestIdRef.current;
    const historyRequestId = ++checkHistoryRequestIdRef.current;

    setCheckHistoryError("");
    setIsCheckHistoryPending(true);

    startLoadTransition(async () => {
      let loadedNextDate = false;

      try {
        const [checklistResult, historyResult] = await Promise.allSettled([
          loadChecklist(nextDate),
          loadCheckHistory(nextDate, 1),
        ]);

        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        if (checklistResult.status === "rejected") {
          setError("학교 목록을 불러오지 못했습니다. 다시 시도하세요.");
          return;
        }

        const result = checklistResult.value;

        if (!result.ok) {
          setError(result.error);
          return;
        }

        activeDateRef.current = nextDate;
        syncCoordinatorRef.current =
          createLunchBoxRealtimeSyncCoordinator(nextDate);
        setGrid(result.data.grid);
        setCanonicalCheckedSchoolIds(
          normalizeLunchBoxChecklistIds(
            result.data.checkedSchoolIds,
            result.data.grid.rows.filter(
              (row) => getLunchBoxCountTotal(row) > 0,
            ),
          ),
        );
        setRealtimeConnectionStatus("connecting");
        setRealtimeSyncFailed(false);

        if (historyRequestId === checkHistoryRequestIdRef.current) {
          if (historyResult.status === "fulfilled") {
            if (historyResult.value.ok) {
              checkHistoryPageRef.current = historyResult.value.data.page;
              setCheckHistoryPage(historyResult.value.data);
              setCheckHistoryError("");
            } else {
              checkHistoryPageRef.current = 1;
              setCheckHistoryPage({
                logs: [],
                page: 1,
                pageSize: checkHistoryPage.pageSize,
                total: 0,
                totalPages: 1,
              });
              setCheckHistoryError(historyResult.value.error);
            }
          } else {
            checkHistoryPageRef.current = 1;
            setCheckHistoryPage({
              logs: [],
              page: 1,
              pageSize: checkHistoryPage.pageSize,
              total: 0,
              totalPages: 1,
            });
            setCheckHistoryError(
              "체크 변경 기록을 불러오지 못했습니다. 다시 시도하세요.",
            );
          }
        }

        loadedNextDate = true;
      } catch {
        if (requestId === loadRequestIdRef.current) {
          setError("학교 목록을 불러오지 못했습니다. 다시 시도하세요.");
        }
      } finally {
        if (requestId === loadRequestIdRef.current) {
          pendingDateRef.current = null;
          setPendingDate(null);

          if (!loadedNextDate) {
            void requestCanonicalSync(activeDateRef.current);
          }
        }

        if (
          isMountedRef.current &&
          historyRequestId === checkHistoryRequestIdRef.current
        ) {
          setIsCheckHistoryPending(false);
        }
      }
    });
  }

  async function handleToggle(schoolId: string) {
    if (
      pendingDateRef.current !== null ||
      isLoadPending ||
      isClearPendingRef.current ||
      pendingCheckStatesRef.current.has(schoolId)
    ) {
      return;
    }

    const activeDate = grid.date;
    const schoolName =
      rows.find((row) => row.schoolId === schoolId)?.schoolName ?? "학교";
    const nextChecked = !checkedIdSet.has(schoolId);

    setError("");
    pendingCheckStatesRef.current.set(schoolId, nextChecked);
    setPendingCheckStates(new Map(pendingCheckStatesRef.current));

    try {
      const result = await setSchoolCheck(
        activeDate,
        schoolId,
        nextChecked,
      );

      if (!result.ok) {
        setError(
          `${schoolName} 체크 상태를 저장하지 못했습니다. ${result.error}`,
        );
      } else if (activeDateRef.current === activeDate) {
        setCanonicalCheckedSchoolIds((current) =>
          setLunchBoxChecklistIdChecked(
            current,
            result.data.schoolId,
            result.data.isChecked,
          ),
        );
      }
    } catch {
      setError(
        `${schoolName} 체크 상태를 저장하지 못했습니다. 다시 선택하세요.`,
      );
    } finally {
      try {
        await requestCanonicalSync(activeDate);
      } catch {
        setRealtimeSyncFailed(true);
      }

      void requestCheckHistorySync(activeDate);
      pendingCheckStatesRef.current.delete(schoolId);
      setPendingCheckStates(new Map(pendingCheckStatesRef.current));
    }
  }

  async function handleClearChecks() {
    if (
      pendingDateRef.current !== null ||
      isLoadPending ||
      isClearPendingRef.current ||
      pendingCheckStatesRef.current.size > 0 ||
      checkedIds.length === 0
    ) {
      return;
    }

    if (
      !window.confirm(
        `${dateLabel} 준비 완료 체크 ${checkedIds.length}건을 모두 해제할까요?`,
      )
    ) {
      return;
    }

    const activeDate = grid.date;

    setError("");
    isClearPendingRef.current = true;
    setIsClearPending(true);

    try {
      const result = await clearChecks(activeDate);

      if (!result.ok) {
        setError(`체크를 모두 해제하지 못했습니다. ${result.error}`);
      } else if (activeDateRef.current === activeDate) {
        setCanonicalCheckedSchoolIds(result.data.checkedSchoolIds);
      }
    } catch {
      setError("체크를 모두 해제하지 못했습니다. 다시 시도하세요.");
    } finally {
      try {
        await requestCanonicalSync(activeDate);
      } catch {
        setRealtimeSyncFailed(true);
      }

      void requestCheckHistorySync(activeDate);
      isClearPendingRef.current = false;
      setIsClearPending(false);
    }
  }

  function handleCheckHistoryPageChange(nextPage: number) {
    if (
      nextPage < 1 ||
      nextPage > checkHistoryPage.totalPages ||
      nextPage === checkHistoryPage.page
    ) {
      return;
    }

    void requestCheckHistoryPage({
      date: grid.date,
      page: nextPage,
      showPending: true,
    });
  }

  function handleCheckHistoryRetry() {
    void requestCheckHistoryPage({
      date: grid.date,
      page: checkHistoryPage.page,
      showPending: true,
    });
  }

  return (
    <>
      <section
        aria-busy={isLoading || isClearPending || undefined}
        aria-label={`${dateLabel} 날짜별 학교 체크 목록`}
        className="overflow-hidden rounded-md border border-[#d9dee7] bg-white shadow-sm"
      >
        <div className="flex flex-col gap-2 border-b border-[#eef1f5] px-3 py-2 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h2 className="text-sm font-semibold text-[#16181d]">
                날짜별 학교 목록
              </h2>
              <p className="text-xs leading-5 tabular-nums text-[#697386]">
                {summaryLabel}
              </p>
              {progressLabel ? (
                <p
                  aria-live="polite"
                  className="text-xs font-semibold tabular-nums text-[#196b69]"
                >
                  {progressLabel}
                </p>
              ) : null}
              <p
                aria-live="polite"
                className={`text-xs font-medium ${realtimeStatusClassName}`}
              >
                {realtimeStatusLabel}
              </p>
            </div>
            <p className="mt-0.5 text-xs leading-5 text-[#697386]">
              수량이 등록된 학교만 표시하며 체크·해제는 접속 중인 모든
              직원 화면에 실시간 반영됩니다.
            </p>
          </div>

          <div className="flex w-full flex-col gap-1.5 lg:w-auto">
            <div className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-2 sm:grid-cols-[auto_10.5rem_auto]">
              <button
                type="button"
                disabled={hasInteractionPending}
                onClick={() => loadDate(shiftLunchBoxDate(grid.date, -1))}
                className={navButtonClassName}
              >
                전날
              </button>
              <DatePickerInput
                aria-label="학교 목록 날짜"
                value={grid.date}
                disabled={hasInteractionPending}
                onChange={(event) => {
                  if (event.target.value) {
                    loadDate(event.target.value);
                  }
                }}
                className="h-11 w-full min-w-0 rounded-md border border-[#cfd6e3] bg-white px-2 text-sm tabular-nums outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] sm:px-3"
              />
              <button
                type="button"
                disabled={hasInteractionPending}
                onClick={() => loadDate(shiftLunchBoxDate(grid.date, 1))}
                className={navButtonClassName}
              >
                다음날
              </button>
            </div>

            <div className="flex min-h-5 flex-wrap items-center justify-end gap-2">
              {interactionStatusLabel ? (
                <p
                  aria-live="polite"
                  className="mr-auto min-w-0 basis-full text-xs font-medium tabular-nums text-[#697386] sm:basis-auto"
                >
                  {interactionStatusLabel}
                </p>
              ) : null}
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                {hasInteractionPending ? (
                  <>
                    <button
                      type="button"
                      disabled
                      title="최신 체크 상태 저장 후 인쇄할 수 있습니다."
                      className={pdfButtonClassName}
                    >
                      세로 인쇄
                    </button>
                    <button
                      type="button"
                      disabled
                      title="최신 체크 상태 저장 후 인쇄할 수 있습니다."
                      className={pdfButtonClassName}
                    >
                      가로 인쇄
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      aria-label={`${dateLabel} 날짜별 학교 목록 세로 인쇄 PDF`}
                      href={`/work-schedule/lunch-boxes/daily-school-print?date=${grid.date}&orientation=portrait`}
                      prefetch={false}
                      target="_blank"
                      rel="noreferrer"
                      className={pdfButtonClassName}
                    >
                      세로 인쇄
                    </Link>
                    <Link
                      aria-label={`${dateLabel} 날짜별 학교 목록 가로 인쇄 PDF`}
                      href={`/work-schedule/lunch-boxes/daily-school-print?date=${grid.date}&orientation=landscape`}
                      prefetch={false}
                      target="_blank"
                      rel="noreferrer"
                      className={pdfButtonClassName}
                    >
                      가로 인쇄
                    </Link>
                  </>
                )}
                {grid.date !== today ? (
                  <button
                    type="button"
                    disabled={hasInteractionPending}
                    onClick={() => loadDate(today)}
                    className={secondaryButtonClassName}
                  >
                    오늘
                  </button>
                ) : null}
                {rows.length > 0 ? (
                  <button
                    type="button"
                    disabled={hasInteractionPending || checkedCount === 0}
                    onClick={handleClearChecks}
                    className={secondaryButtonClassName}
                  >
                    {isClearPending ? "해제 중" : "이 날짜 체크 해제"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="border-b border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f] sm:px-4"
          >
            {error}
          </p>
        ) : null}

        {rows.length === 0 ? (
          <LunchBoxDailyChecklistEmptyState dateLabel={dateLabel} />
        ) : (
          <>
            <ul
              className={[
                "divide-y divide-[#eef1f5] xl:hidden",
                isLoading || isClearPending ? "opacity-60" : "",
              ].join(" ")}
            >
              {rows.map((row) => (
                <LunchBoxDailyChecklistChipRow
                  dateLabel={dateLabel}
                  disabled={
                    isLoading ||
                    isClearPending ||
                    pendingSchoolIds.has(row.schoolId)
                  }
                  isChecked={checkedIdSet.has(row.schoolId)}
                  key={row.schoolId}
                  onToggle={handleToggle}
                  row={row}
                />
              ))}
            </ul>

            <LunchBoxDailyChecklistColumns
              checkedIdSet={checkedIdSet}
              columns={columns}
              dateLabel={dateLabel}
              disabled={isLoading || isClearPending}
              hasDeliveryDriver={hasDeliveryDriver}
              onToggle={handleToggle}
              pendingSchoolIds={pendingSchoolIds}
              visibleServingFields={visibleServingFields}
            />
          </>
        )}
      </section>

      <LunchBoxDailyCheckHistory
        error={checkHistoryError}
        historyPage={checkHistoryPage}
        isPending={isCheckHistoryPending}
        onPageChange={handleCheckHistoryPageChange}
        onRetry={handleCheckHistoryRetry}
      />
    </>
  );
}

function LunchBoxDailyChecklistColumns({
  checkedIdSet,
  columns,
  dateLabel,
  disabled,
  hasDeliveryDriver,
  onToggle,
  pendingSchoolIds,
  visibleServingFields,
}: {
  checkedIdSet: Set<string>;
  columns: LunchBoxCountRow[][];
  dateLabel: string;
  disabled: boolean;
  hasDeliveryDriver: boolean;
  onToggle: ToggleHandler;
  pendingSchoolIds: Set<string>;
  visibleServingFields: LunchBoxServingCountField[];
}) {
  return (
    <div
      className={[
        "hidden gap-x-4 px-3 pb-2 xl:grid xl:grid-cols-3",
        disabled ? "opacity-60" : "",
      ].join(" ")}
    >
      {columns.map((columnRows, columnIndex) => (
        <table
          aria-label={`${dateLabel} 학교 목록 ${columnIndex + 1}단`}
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
              {visibleServingFields.map((field) => (
                <th
                  className={`${tableHeadClassName} w-9 pl-1 text-right`}
                  key={field}
                  scope="col"
                  title={lunchBoxCountFieldLabels[field]}
                >
                  {lunchBoxDailyChecklistShortFieldLabels[field]}
                </th>
              ))}
              {hasDeliveryDriver ? (
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
            </tr>
          </thead>
          <tbody>
            {columnRows.map((row) => {
              const isRowPending = pendingSchoolIds.has(row.schoolId);

              return (
                <tr
                  aria-busy={isRowPending || undefined}
                  className={tableRowClassName}
                  key={row.schoolId}
                >
                  <td className="py-0.5">
                    <label
                      className={[
                        "flex min-h-11 items-center justify-center",
                        disabled || isRowPending
                          ? "cursor-not-allowed"
                          : "cursor-pointer",
                      ].join(" ")}
                    >
                      <input
                        aria-label={`${row.schoolName} ${dateLabel} 준비 완료`}
                        checked={checkedIdSet.has(row.schoolId)}
                        className={[
                          "size-4 accent-[#196b69]",
                          disabled || isRowPending
                            ? "cursor-not-allowed"
                            : "cursor-pointer",
                        ].join(" ")}
                        disabled={disabled || isRowPending}
                        onChange={() => onToggle(row.schoolId)}
                        type="checkbox"
                      />
                    </label>
                  </td>
                  <th
                    className="max-w-[7rem] truncate pl-1 text-left text-[13px] leading-4 font-semibold text-[#16181d]"
                    scope="row"
                    title={`${row.schoolName} (${getLunchBoxSchoolTypeLabel(row.schoolType)})`}
                  >
                    {row.schoolName}
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
                  {visibleServingFields.map((field) => (
                    <td className={numericCellClassName} key={field}>
                      {row[field] > 0 ? (
                        row[field]
                      ) : (
                        <span className="text-[#9aa4b2]">-</span>
                      )}
                    </td>
                  ))}
                  {hasDeliveryDriver ? (
                    <td className={numericCellClassName}>
                      {row.deliveryDriverCount > 0 ? (
                        row.deliveryDriverCount
                      ) : (
                        <span className="text-[#9aa4b2]">-</span>
                      )}
                    </td>
                  ) : null}
                  <td className={`${numericCellClassName} font-semibold`}>
                    {getLunchBoxCountTotal(row)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </div>
  );
}

function LunchBoxDailyChecklistChipRow({
  dateLabel,
  disabled,
  isChecked,
  onToggle,
  row,
}: {
  dateLabel: string;
  disabled: boolean;
  isChecked: boolean;
  onToggle: ToggleHandler;
  row: LunchBoxCountRow;
}) {
  const preservationLabel = formatLunchBoxPreservationChipLabel(
    row.preservationCount,
    row.preservationClass,
  );

  return (
    <li aria-busy={disabled || undefined}>
      <label
        className={[
          chipRowClassName,
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
      >
        <input
          aria-label={`${row.schoolName} ${dateLabel} 준비 완료`}
          checked={isChecked}
          className={[
            "size-5 shrink-0 accent-[#196b69]",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          ].join(" ")}
          disabled={disabled}
          onChange={() => onToggle(row.schoolId)}
          type="checkbox"
        />
        <span
          className="w-28 shrink-0 truncate text-sm font-semibold text-[#16181d] sm:w-32 sm:text-[0.9375rem]"
          title={`${row.schoolName} (${getLunchBoxSchoolTypeLabel(row.schoolType)})`}
        >
          {row.schoolName}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          {preservationLabel ? (
            <span className="inline-flex shrink-0 items-center rounded-md border border-[#b8d9d7] bg-[#eef7f6] px-1.5 py-0.5 text-xs leading-5 font-semibold tabular-nums text-[#0f5553] sm:text-sm">
              {preservationLabel}
            </span>
          ) : null}
          {lunchBoxServingCountFields.flatMap((field) =>
            row[field] > 0
              ? [
                  <span className={chipClassName} key={field}>
                    <span className="text-[#697386]">
                      {lunchBoxCountFieldLabels[field]}
                    </span>
                    <span className="font-semibold text-[#16181d]">
                      {row[field]}
                    </span>
                  </span>,
                ]
              : [],
          )}
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
            <span className="font-semibold text-[#16181d]">
              {getLunchBoxCountTotal(row)}
            </span>
          </span>
        </span>
      </label>
    </li>
  );
}

function LunchBoxDailyChecklistEmptyState({
  dateLabel,
}: {
  dateLabel: string;
}) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center px-4 py-5 text-center">
      <h3 className="text-sm font-semibold text-[#16181d]">
        이 날짜에 배정된 학교가 없습니다
      </h3>
      <p className="mt-1 text-sm leading-5 text-[#697386]">
        {dateLabel}에는 등록된 도시락 수량이 없습니다. 전날이나 다음날을
        확인하세요.
      </p>
    </div>
  );
}

function syncDailyChecklistStateInHistory(date: string, checkLogPage: number) {
  const url = new URL(window.location.href);

  url.searchParams.set("tab", "daily-school-list");
  url.searchParams.set("date", date);

  if (checkLogPage > 1) {
    url.searchParams.set("checkLogPage", String(checkLogPage));
  } else {
    url.searchParams.delete("checkLogPage");
  }

  window.history.replaceState(
    null,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}
