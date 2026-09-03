"use client";

import Link from "next/link";
import {
  type PointerEvent as ReactPointerEvent,
  useId,
  useMemo,
  useState,
} from "react";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  formatLunchBoxDateLabel,
  formatLunchBoxShortDateLabel,
  getLunchBoxChartCount,
  type LunchBoxChartData,
} from "@/lib/lunch-box-counts-core";
import {
  formatLunchBoxWorkMinutes,
  formatLunchBoxWon,
  type LunchBoxOperationsChartData,
} from "@/lib/lunch-box-operations-core";

type LunchBoxChartBoardProps = {
  chartData: LunchBoxChartData;
  operationsChartData: LunchBoxOperationsChartData;
};

type ChartKind = "operations" | "schools" | "total";
type ChartOrientation = "portrait" | "landscape";

type LineChartSeries = {
  className: string;
  dashArray?: string;
  id: string;
  label: string;
  pointLabels?: Array<string | null>;
  strokeWidth?: number;
  values: Array<number | null>;
};

type ActiveLineChartPoint = {
  pointIndex: number;
  seriesId: string;
};

const chartHeight = 320;
const chartMargin = {
  bottom: 58,
  left: 62,
  right: 24,
  top: 20,
};
const chartMinimumWidth = 760;
const chartDateSpacing = 46;
const printLinkClassName = buttonClass(
  buttonStyles.base,
  buttonStyles.neutral,
  "h-11 shrink-0 px-3 text-xs whitespace-nowrap",
);
const totalSeriesClassName =
  "text-[var(--brand)]";
const schoolSeriesColorClassNames = [
  "text-[#0f6b69] dark:text-[#58a6ff]",
  "text-[#3b5f7f] dark:text-[#79c0ff]",
  "text-[#8a4b08] dark:text-[#d29922]",
  "text-[#6d3fb5] dark:text-[#bc8cff]",
  "text-[#b42318] dark:text-[#ff7b72]",
  "text-[#1d6a45] dark:text-[#56d364]",
  "text-[#9f2f73] dark:text-[#f778ba]",
  "text-[#1d5f78] dark:text-[#56d4dd]",
  "text-[#7a5200] dark:text-[#e3b341]",
  "text-[#4f46e5] dark:text-[#a5a0ff]",
  "text-[#8f3f18] dark:text-[#ffa657]",
  "text-[#4f5d2f] dark:text-[#7ee787]",
] as const;
const schoolSeriesDashArrays = [
  undefined,
  "7 3",
  "2 3",
  "9 3 2 3",
] as const;
const hiredWorkerSeriesDashArrays = [
  "7 3",
  "2 3",
  "9 3 2 3",
] as const;

export function LunchBoxChartBoard({
  chartData,
  operationsChartData,
}: LunchBoxChartBoardProps) {
  const [includeTotalPreservation, setIncludeTotalPreservation] =
    useState(true);
  const [includeSchoolPreservation, setIncludeSchoolPreservation] =
    useState(true);
  const totalPreservationId = useId();
  const schoolPreservationId = useId();
  const operationsTitleId = useId();
  const rangeLabel = createChartRangeLabel(chartData);
  const operationsRangeLabel = createOperationsChartRangeLabel(
    operationsChartData,
  );
  const totalSeries = useMemo<LineChartSeries[]>(
    () => [
      {
        className: totalSeriesClassName,
        id: "daily-total",
        label: "날짜별 총 개수",
        values: chartData.dailySeries.map((point) =>
          getLunchBoxChartCount(point, includeTotalPreservation),
        ),
      },
    ],
    [chartData.dailySeries, includeTotalPreservation],
  );
  const schoolSeries = useMemo<LineChartSeries[]>(
    () =>
      chartData.schoolSeries.map((series, index) => {
        const style = getSchoolSeriesStyle(index);

        return {
          ...style,
          id: series.schoolId,
          label: series.schoolName,
          values: series.points.map((point) =>
            getLunchBoxChartCount(point, includeSchoolPreservation),
          ),
        };
      }),
    [chartData.schoolSeries, includeSchoolPreservation],
  );
  const hiredWorkerSeries = useMemo<LineChartSeries[]>(
    () => [
      {
        className: totalSeriesClassName,
        id: "daily-hired-labor-total",
        label: "일별 고용비 합계",
        pointLabels: operationsChartData.points.map((point) =>
          createHiredWorkerPointLabel({
            date: point.date,
            label: "일별 고용비 합계",
            laborCost: point.laborCost,
            totalMinutes: point.totalMinutes,
          }),
        ),
        strokeWidth: 2.75,
        values: operationsChartData.points.map((point) => point.laborCost),
      },
      ...operationsChartData.workerNames.map((workerName, index) => {
        const style = getHiredWorkerSeriesStyle(index);

        return {
          ...style,
          id: `hired-worker-${index}`,
          label: workerName,
          pointLabels: operationsChartData.points.map((point) => {
            const worker = point.hiredWorkers.find(
              (item) => item.workerName === workerName,
            );

            return worker
              ? createHiredWorkerPointLabel({
                  date: point.date,
                  label: workerName,
                  laborCost: worker.laborCost,
                  totalMinutes: worker.totalMinutes,
                })
              : null;
          }),
          strokeWidth: 1.75,
          values: operationsChartData.points.map((point) =>
            point.hiredWorkers.find(
              (item) => item.workerName === workerName,
            )?.laborCost ?? null,
          ),
        };
      }),
    ],
    [operationsChartData.points, operationsChartData.workerNames],
  );
  const operationDates = operationsChartData.points.map(
    (point) => point.date,
  );

  return (
    <div className="space-y-4">
      <LunchBoxChartPanel
        chartKind="total"
        description={`${rangeLabel} · 실제 공급일만 빈 날짜 없이 연속 표시합니다.`}
        includePreservation={includeTotalPreservation}
        preservationId={totalPreservationId}
        title="날짜별 총 개수"
        onIncludePreservationChange={setIncludeTotalPreservation}
      >
        <LunchBoxLineChart
          ariaLabel={`날짜별 총 개수 선 차트, ${
            includeTotalPreservation ? "보존식 포함" : "보존식 제외"
          }`}
          dates={chartData.serviceDates}
          series={totalSeries}
          showPointMarkers
        />
      </LunchBoxChartPanel>

      <section
        aria-labelledby={operationsTitleId}
        className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-sm"
      >
        <div className="flex min-w-0 flex-col gap-2 border-b border-[var(--border)] px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2
              className="text-base font-semibold text-[var(--foreground)]"
              id={operationsTitleId}
            >
              별도 고용 인력 추이
            </h2>
            <p className="mt-0.5 text-xs leading-5 tabular-nums text-[var(--text-muted)]">
              {operationsRangeLabel} · 별도 고용 인력의 지급액만 집계합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ChartPrintLink
              chartKind="operations"
              orientation="portrait"
              title="별도 고용 인력 추이"
            />
            <ChartPrintLink
              chartKind="operations"
              orientation="landscape"
              title="별도 고용 인력 추이"
            />
          </div>
        </div>

        <HiredWorkerSummaryMetrics chartData={operationsChartData} />

        <LunchBoxLineChart
          ariaLabel="날짜별 별도 고용비 선 차트"
          axisValueFormatter={formatWonAxisValue}
          chartDescription="별도 고용 인력별 지급액과 일별 고용비 합계를 같은 날짜 축에서 비교한 선 차트입니다. 정확한 근무시간과 지급액은 아래 내역에서 확인할 수 있습니다."
          dates={operationDates}
          emptyMessage="표시할 별도 고용 근무 기록이 없습니다."
          pointValueFormatter={formatLunchBoxWon}
          series={hiredWorkerSeries}
          showPointMarkers
        />

        {operationsChartData.points.length > 0 ? (
          <>
            <HiredWorkerTotals chartData={operationsChartData} />
            <HiredWorkerDailyDetails chartData={operationsChartData} />
          </>
        ) : null}
      </section>

      <LunchBoxChartPanel
        chartKind="schools"
        description={`${rangeLabel} · 모든 학교를 같은 실제 공급일 축에서 비교합니다.`}
        includePreservation={includeSchoolPreservation}
        preservationId={schoolPreservationId}
        title="학교별 총 개수"
        onIncludePreservationChange={setIncludeSchoolPreservation}
      >
        <LunchBoxLineChart
          ariaLabel={`학교별 총 개수 선 차트, ${
            includeSchoolPreservation ? "보존식 포함" : "보존식 제외"
          }`}
          dates={chartData.serviceDates}
          series={schoolSeries}
        />
      </LunchBoxChartPanel>
    </div>
  );
}

function HiredWorkerSummaryMetrics({
  chartData,
}: {
  chartData: LunchBoxOperationsChartData;
}) {
  const metrics = [
    {
      label: "전체 고용비",
      value: formatLunchBoxWon(chartData.totalLaborCost),
    },
    {
      label: "고용 인력",
      value: `${chartData.workerNames.length.toLocaleString("ko-KR")}명`,
    },
    {
      label: "고용 기록일",
      value: `${chartData.points.length.toLocaleString("ko-KR")}일`,
    },
    {
      label: "총 근무시간",
      value: formatLunchBoxWorkMinutes(chartData.totalMinutes),
    },
  ];

  return (
    <dl
      aria-label="별도 고용 전체 요약"
      className="grid grid-cols-2 border-b border-[var(--border)] bg-[var(--surface-muted)] sm:grid-cols-4"
    >
      {metrics.map((metric, index) => (
        <div
          className="min-w-0 border-r border-b border-[var(--border)] px-3 py-2.5 last:border-r-0 sm:border-b-0 sm:px-4"
          key={metric.label}
        >
          <dt className="text-[11px] font-semibold text-[var(--text-muted)]">
            {metric.label}
          </dt>
          <dd
            className={`mt-0.5 truncate tabular-nums text-[var(--foreground)] ${
              index === 0 ? "text-base font-bold" : "text-sm font-semibold"
            }`}
            title={metric.value}
          >
            {metric.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function HiredWorkerTotals({
  chartData,
}: {
  chartData: LunchBoxOperationsChartData;
}) {
  return (
    <section
      aria-label="별도 고용 인력별 누계"
      className="border-t border-[var(--border)]"
    >
      <div className="px-3 py-2.5 sm:px-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          인력별 누계
        </h3>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          같은 이름의 근무 기록을 전체 기간 기준으로 합산합니다.
        </p>
      </div>

      <div
        aria-hidden="true"
        className="hidden grid-cols-[minmax(8rem,1fr)_6rem_9rem_9rem] gap-3 border-t border-[var(--border)] bg-[var(--surface-muted)] px-4 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] sm:grid"
      >
        <span>고용 인력</span>
        <span className="text-right">근무일</span>
        <span className="text-right">총 근무시간</span>
        <span className="text-right">총 지급액</span>
      </div>

      <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)] sm:border-t-0">
        {chartData.workerSummaries.map((worker) => (
          <li
            className="grid grid-cols-3 gap-x-3 gap-y-1 px-3 py-2.5 text-sm sm:grid-cols-[minmax(8rem,1fr)_6rem_9rem_9rem] sm:items-center sm:px-4"
            key={worker.workerName}
          >
            <span className="col-span-3 min-w-0 truncate font-semibold text-[var(--foreground)] sm:col-span-1">
              {worker.workerName}
            </span>
            <HiredWorkerTotalValue
              label="근무일"
              value={`${worker.workdayCount.toLocaleString("ko-KR")}일`}
            />
            <HiredWorkerTotalValue
              label="총 근무시간"
              value={formatLunchBoxWorkMinutes(worker.totalMinutes)}
            />
            <HiredWorkerTotalValue
              label="총 지급액"
              value={formatLunchBoxWon(worker.laborCost)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function HiredWorkerTotalValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span className="min-w-0 text-right tabular-nums text-[var(--foreground)]">
      <span className="block text-[10px] font-medium text-[var(--text-muted)] sm:sr-only">
        {label}
      </span>
      <span className="block truncate" title={value}>
        {value}
      </span>
    </span>
  );
}

function HiredWorkerDailyDetails({
  chartData,
}: {
  chartData: LunchBoxOperationsChartData;
}) {
  return (
    <section
      aria-label="별도 고용 근무·지급 내역"
      className="border-t border-[var(--border)]"
    >
      <div className="px-3 py-2.5 sm:px-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          날짜별 고용 내역
        </h3>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          사람별 근무 시간대·합산 시간·지급액과 그날의 합계를 확인합니다.
        </p>
      </div>

      <div
        aria-hidden="true"
        className="hidden grid-cols-[8rem_minmax(18rem,1fr)_8rem_9rem] gap-3 border-t border-[var(--border)] bg-[var(--surface-muted)] px-4 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] lg:grid"
      >
        <span>날짜</span>
        <span>고용 인력 · 근무시간 · 지급액</span>
        <span className="text-right">일 총시간</span>
        <span className="text-right">일 고용비 합계</span>
      </div>

      <ol className="divide-y divide-[var(--border)] border-t border-[var(--border)] lg:border-t-0">
        {chartData.points.map((point) => (
          <li
            className="grid gap-2 px-3 py-3 lg:grid-cols-[8rem_minmax(18rem,1fr)_8rem_9rem] lg:items-start lg:gap-3 lg:px-4"
            key={point.date}
          >
            <time
              className="text-sm font-semibold tabular-nums text-[var(--foreground)]"
              dateTime={point.date}
            >
              {formatLunchBoxDateLabel(point.date)}
            </time>

            <ul className="space-y-1.5">
              {point.hiredWorkers.map((worker) => (
                <li
                  className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-0.5 rounded bg-[var(--surface-muted)] px-2 py-1.5 text-xs"
                  key={worker.workerName}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-[var(--foreground)]">
                      {worker.workerName}
                    </span>
                    <span className="block tabular-nums text-[var(--text-muted)]">
                      {formatWorkerShiftRanges(worker.shifts)}
                    </span>
                  </span>
                  <span className="ml-auto flex shrink-0 flex-wrap justify-end gap-x-3 tabular-nums text-[var(--foreground)]">
                    <span>
                      <span className="sr-only">근무시간 </span>
                      {formatLunchBoxWorkMinutes(worker.totalMinutes)}
                    </span>
                    <span className="font-semibold">
                      <span className="sr-only">지급액 </span>
                      {formatLunchBoxWon(worker.laborCost)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <DailyTotalValue
              label="일 총시간"
              value={formatLunchBoxWorkMinutes(point.totalMinutes)}
            />
            <DailyTotalValue
              emphasis
              label="일 고용비 합계"
              value={formatLunchBoxWon(point.laborCost)}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function DailyTotalValue({
  emphasis = false,
  label,
  value,
}: {
  emphasis?: boolean;
  label: string;
  value: string;
}) {
  return (
    <span className="flex items-baseline justify-between gap-3 text-sm tabular-nums lg:block lg:text-right">
      <span className="text-[11px] font-semibold text-[var(--text-muted)] lg:sr-only">
        {label}
      </span>
      <span
        className={
          emphasis
            ? "font-bold text-[var(--brand-strong)]"
            : "font-medium text-[var(--foreground)]"
        }
      >
        {value}
      </span>
    </span>
  );
}

function LunchBoxChartPanel({
  chartKind,
  children,
  description,
  includePreservation,
  onIncludePreservationChange,
  preservationId,
  title,
}: {
  chartKind: ChartKind;
  children: React.ReactNode;
  description: string;
  includePreservation: boolean;
  onIncludePreservationChange: (value: boolean) => void;
  preservationId: string;
  title: string;
}) {
  return (
    <section
      aria-labelledby={`${preservationId}-title`}
      className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-sm"
    >
      <div className="flex min-w-0 flex-col gap-2 border-b border-[var(--border)] px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2
            className="text-base font-semibold text-[var(--foreground)]"
            id={`${preservationId}-title`}
          >
            {title}
          </h2>
          <p className="mt-0.5 text-xs leading-5 tabular-nums text-[var(--text-muted)]">
            {description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--foreground)]"
            htmlFor={preservationId}
          >
            <input
              aria-label={`${title} 보존식 포함`}
              checked={includePreservation}
              className="size-5 shrink-0 cursor-pointer accent-[var(--brand)]"
              id={preservationId}
              onChange={(event) =>
                onIncludePreservationChange(event.target.checked)
              }
              type="checkbox"
            />
            보존식 포함
          </label>
          <ChartPrintLink
            chartKind={chartKind}
            includePreservation={includePreservation}
            orientation="portrait"
            title={title}
          />
          <ChartPrintLink
            chartKind={chartKind}
            includePreservation={includePreservation}
            orientation="landscape"
            title={title}
          />
        </div>
      </div>

      {children}
    </section>
  );
}

function ChartPrintLink({
  chartKind,
  includePreservation,
  orientation,
  title,
}: {
  chartKind: ChartKind;
  includePreservation?: boolean;
  orientation: ChartOrientation;
  title: string;
}) {
  const orientationLabel =
    orientation === "portrait" ? "세로 인쇄" : "가로 인쇄";

  return (
    <Link
      aria-label={`${title} ${orientationLabel} PDF`}
      className={printLinkClassName}
      href={createChartPrintHref(
        chartKind,
        orientation,
        includePreservation,
      )}
      rel="noreferrer"
      target="_blank"
    >
      {orientationLabel}
    </Link>
  );
}

function LunchBoxLineChart({
  ariaLabel,
  axisValueFormatter = formatChartCount,
  chartDescription =
    "주말과 공급이 없는 날을 제외한 실제 공급일을 동일한 간격으로 배치한 선 차트입니다.",
  dates,
  emptyMessage = "표시할 도시락 공급 데이터가 없습니다.",
  pointValueFormatter = formatChartPointCount,
  series,
  showPointMarkers = false,
}: {
  ariaLabel: string;
  axisValueFormatter?: (value: number) => string;
  chartDescription?: string;
  dates: readonly string[];
  emptyMessage?: string;
  pointValueFormatter?: (value: number) => string;
  series: readonly LineChartSeries[];
  showPointMarkers?: boolean;
}) {
  const [activeChartPoint, setActiveChartPoint] =
    useState<ActiveLineChartPoint | null>(null);

  if (dates.length === 0) {
    return (
      <div
        className="px-4 py-6 text-center text-sm text-[var(--text-muted)]"
        role="status"
      >
        {emptyMessage}
      </div>
    );
  }

  const width = Math.max(
    chartMinimumWidth,
    chartMargin.left +
      chartMargin.right +
      Math.max(1, dates.length - 1) * chartDateSpacing,
  );
  const plotWidth = width - chartMargin.left - chartMargin.right;
  const plotHeight = chartHeight - chartMargin.top - chartMargin.bottom;
  const maximumValue = Math.max(
    0,
    ...series.flatMap((item) =>
      item.values.filter((value): value is number => value !== null),
    ),
  );
  const axisMaximum = getChartAxisMaximum(maximumValue);
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => (axisMaximum / 4) * index,
  ).reverse();
  const xPositions = dates.map((_, index) =>
    getChartX(index, dates.length, plotWidth),
  );
  const activeSeries = activeChartPoint
    ? series.find((item) => item.id === activeChartPoint.seriesId)
    : undefined;
  const activeValue =
    activeSeries && activeChartPoint
      ? activeSeries.values[activeChartPoint.pointIndex]
      : null;
  const activeTooltip =
    activeSeries &&
    activeChartPoint &&
    typeof activeValue === "number" &&
    dates[activeChartPoint.pointIndex]
      ? {
          className: activeSeries.className,
          label: createLineChartPointLabel({
            date: dates[activeChartPoint.pointIndex],
            pointIndex: activeChartPoint.pointIndex,
            pointValueFormatter,
            series: activeSeries,
            value: activeValue,
          }),
          x: xPositions[activeChartPoint.pointIndex],
          y: getChartY(activeValue, axisMaximum, plotHeight),
        }
      : null;

  function updateActiveChartPoint(
    event: ReactPointerEvent<SVGRectElement>,
  ) {
    if (event.pointerType === "touch") {
      return;
    }

    const svg = event.currentTarget.ownerSVGElement;
    const bounds = svg?.getBoundingClientRect();

    if (!bounds || bounds.width === 0 || bounds.height === 0) {
      return;
    }

    const nextPoint = getClosestLineChartPoint({
      axisMaximum,
      plotHeight,
      pointerX: ((event.clientX - bounds.left) / bounds.width) * width,
      pointerY:
        ((event.clientY - bounds.top) / bounds.height) * chartHeight,
      series,
      xPositions,
    });

    setActiveChartPoint((currentPoint) => {
      if (
        currentPoint?.pointIndex === nextPoint?.pointIndex &&
        currentPoint?.seriesId === nextPoint?.seriesId
      ) {
        return currentPoint;
      }

      return nextPoint;
    });
  }

  return (
    <>
      <div
        aria-label={`${ariaLabel} 가로 스크롤 영역`}
        className="overflow-x-auto scrollbar-stable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"
        onScroll={() => setActiveChartPoint(null)}
        tabIndex={0}
      >
        <div className="min-w-full" style={{ width }}>
          <svg
            aria-label={ariaLabel}
            className="block h-80 w-full"
            role="img"
            viewBox={`0 0 ${width} ${chartHeight}`}
          >
            <title>{ariaLabel}</title>
            <desc>{chartDescription}</desc>

            {yTicks.map((tick) => {
              const y = getChartY(tick, axisMaximum, plotHeight);

              return (
                <g aria-hidden="true" key={tick}>
                  <line
                    stroke="var(--border)"
                    strokeWidth="1"
                    x1={chartMargin.left}
                    x2={width - chartMargin.right}
                    y1={y}
                    y2={y}
                  />
                  <text
                    fill="var(--text-muted)"
                    fontSize="11"
                    textAnchor="end"
                    x={chartMargin.left - 10}
                    y={y + 4}
                  >
                    {axisValueFormatter(tick)}
                  </text>
                </g>
              );
            })}

            {dates.map((date, index) => {
              const x = xPositions[index];

              return (
                <g aria-hidden="true" key={date}>
                  <line
                    stroke="var(--border)"
                    strokeDasharray="2 4"
                    strokeWidth="0.75"
                    x1={x}
                    x2={x}
                    y1={chartMargin.top}
                    y2={chartHeight - chartMargin.bottom}
                  />
                  <text
                    fill="var(--text-muted)"
                    fontSize="11"
                    textAnchor="end"
                    transform={`rotate(-40 ${x} ${
                      chartHeight - chartMargin.bottom + 17
                    })`}
                    x={x}
                    y={chartHeight - chartMargin.bottom + 17}
                  >
                    {formatLunchBoxShortDateLabel(date)}
                  </text>
                </g>
              );
            })}

            {series.map((item) => {
              const path = createSeriesPath({
                axisMaximum,
                plotHeight,
                values: item.values,
                xPositions,
              });

              return (
                <g className={item.className} key={item.id}>
                  <path
                    aria-hidden="true"
                    d={path}
                    fill="none"
                    stroke="currentColor"
                    strokeDasharray={item.dashArray}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={
                      item.strokeWidth ?? (series.length === 1 ? 2.5 : 1.6)
                    }
                    vectorEffect="non-scaling-stroke"
                  />
                  {showPointMarkers || dates.length === 1
                    ? item.values.map((value, index) => {
                        if (value === null) {
                          return null;
                        }

                        return (
                          <circle
                            aria-label={createLineChartPointLabel({
                              date: dates[index],
                              pointIndex: index,
                              pointValueFormatter,
                              series: item,
                              value,
                            })}
                            cx={xPositions[index]}
                            cy={getChartY(
                              value,
                              axisMaximum,
                              plotHeight,
                            )}
                            data-chart-point-marker="true"
                            fill="var(--surface)"
                            key={`${item.id}-${dates[index]}`}
                            pointerEvents="none"
                            r="3.5"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                        );
                      })
                    : null}
                </g>
              );
            })}

            <rect
              aria-hidden="true"
              className="cursor-crosshair"
              data-chart-hover-zone="true"
              fill="transparent"
              height={plotHeight}
              onPointerEnter={updateActiveChartPoint}
              onPointerLeave={() => setActiveChartPoint(null)}
              onPointerMove={updateActiveChartPoint}
              pointerEvents="all"
              width={plotWidth}
              x={chartMargin.left}
              y={chartMargin.top}
            />

            {activeTooltip ? (
              <LineChartTooltip
                chartWidth={width}
                className={activeTooltip.className}
                label={activeTooltip.label}
                x={activeTooltip.x}
                y={activeTooltip.y}
              />
            ) : null}
          </svg>
        </div>
      </div>

      <ChartLegend series={series} />
    </>
  );
}

function LineChartTooltip({
  chartWidth,
  className,
  label,
  x,
  y,
}: {
  chartWidth: number;
  className: string;
  label: string;
  x: number;
  y: number;
}) {
  const lines = wrapLineChartTooltipLabel(label);
  const boxWidth = Math.min(
    chartWidth - 8,
    Math.max(
      140,
      ...lines.map((line) => estimateLineChartTooltipTextWidth(line) + 24),
    ),
  );
  const boxHeight = 18 + lines.length * 16;
  const boxX = Math.min(
    chartWidth - boxWidth - 4,
    Math.max(4, x - boxWidth / 2),
  );
  const boxY =
    y - boxHeight - 10 >= 4
      ? y - boxHeight - 10
      : Math.min(chartHeight - boxHeight - 4, y + 10);
  const connectorY = boxY < y ? boxY + boxHeight : boxY;

  return (
    <g
      aria-label={label}
      className={className}
      data-chart-tooltip="true"
      pointerEvents="none"
      role="tooltip"
    >
      <line
        aria-hidden="true"
        stroke="var(--border-strong)"
        strokeDasharray="3 3"
        strokeWidth="1"
        x1={x}
        x2={x}
        y1={chartMargin.top}
        y2={chartHeight - chartMargin.bottom}
      />
      <line
        aria-hidden="true"
        stroke="var(--border-strong)"
        strokeWidth="1"
        x1={x}
        x2={x}
        y1={y}
        y2={connectorY}
      />
      <circle
        aria-hidden="true"
        cx={x}
        cy={y}
        fill="var(--surface)"
        r="5"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <rect
        fill="var(--surface)"
        height={boxHeight}
        rx="5"
        stroke="var(--border-strong)"
        strokeWidth="1"
        width={boxWidth}
        x={boxX}
        y={boxY}
      />
      <text
        fill="var(--foreground)"
        fontSize="12"
        fontWeight="600"
        x={boxX + 12}
        y={boxY + 20}
      >
        {lines.map((line, index) => (
          <tspan
            dy={index === 0 ? 0 : 16}
            key={`${line}-${index}`}
            x={boxX + 12}
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function ChartLegend({ series }: { series: readonly LineChartSeries[] }) {
  if (series.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-[var(--border)] px-3 py-2 sm:px-4">
      <p className="text-[11px] font-semibold text-[var(--text-muted)]">
        범례
      </p>
      <ul
        aria-label="차트 선 범례"
        className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6"
      >
        {series.map((item) => (
          <li
            className="flex min-h-7 min-w-0 items-center gap-2 text-xs text-[var(--foreground)]"
            key={item.id}
          >
            <svg
              aria-hidden="true"
              className={`h-3 w-7 shrink-0 ${item.className}`}
              viewBox="0 0 28 12"
            >
              <line
                stroke="currentColor"
                strokeDasharray={item.dashArray}
                strokeLinecap="round"
                strokeWidth={item.strokeWidth ?? 2}
                x1="1"
                x2="27"
                y1="6"
                y2="6"
              />
            </svg>
            <span className="truncate" title={item.label}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function createChartRangeLabel(chartData: LunchBoxChartData) {
  if (!chartData.startDate || !chartData.endDate) {
    return "공급 기간 없음";
  }

  return `${formatLunchBoxDateLabel(
    chartData.startDate,
  )} ~ ${formatLunchBoxDateLabel(chartData.endDate)} · 공급일 ${
    chartData.serviceDates.length
  }일`;
}

function createOperationsChartRangeLabel(
  chartData: LunchBoxOperationsChartData,
) {
  if (!chartData.startDate || !chartData.endDate) {
    return "고용 기록 기간 없음";
  }

  return `${formatLunchBoxDateLabel(
    chartData.startDate,
  )} ~ ${formatLunchBoxDateLabel(chartData.endDate)} · 고용 기록일 ${
    chartData.points.length
  }일`;
}

function createChartPrintHref(
  chartKind: ChartKind,
  orientation: ChartOrientation,
  includePreservation?: boolean,
) {
  if (chartKind === "operations") {
    return `/work-schedule/lunch-boxes/chart-print?chart=${chartKind}&orientation=${orientation}`;
  }

  return `/work-schedule/lunch-boxes/chart-print?chart=${chartKind}&orientation=${orientation}&preservation=${
    includePreservation ? "include" : "exclude"
  }`;
}

function getSchoolSeriesStyle(index: number) {
  const colorIndex = index % schoolSeriesColorClassNames.length;
  const dashIndex =
    Math.floor(index / schoolSeriesColorClassNames.length) %
    schoolSeriesDashArrays.length;

  return {
    className: schoolSeriesColorClassNames[colorIndex],
    dashArray: schoolSeriesDashArrays[dashIndex],
  };
}

function getHiredWorkerSeriesStyle(index: number) {
  return {
    className:
      schoolSeriesColorClassNames[
        index % schoolSeriesColorClassNames.length
      ],
    dashArray:
      hiredWorkerSeriesDashArrays[index % hiredWorkerSeriesDashArrays.length],
  };
}

function getChartAxisMaximum(maximumValue: number) {
  if (maximumValue <= 4) {
    return 4;
  }

  const roughStep = maximumValue / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const niceStep =
    normalizedStep <= 1
      ? 1
      : normalizedStep <= 2
        ? 2
        : normalizedStep <= 2.5
          ? 2.5
          : normalizedStep <= 5
            ? 5
            : 10;

  return niceStep * magnitude * 4;
}

function getChartX(index: number, count: number, plotWidth: number) {
  if (count === 1) {
    return chartMargin.left + plotWidth / 2;
  }

  return chartMargin.left + (plotWidth * index) / (count - 1);
}

function getChartY(value: number, axisMaximum: number, plotHeight: number) {
  return (
    chartMargin.top +
    plotHeight -
    (Math.max(0, value) / axisMaximum) * plotHeight
  );
}

function createLineChartPointLabel({
  date,
  pointIndex,
  pointValueFormatter,
  series,
  value,
}: {
  date: string;
  pointIndex: number;
  pointValueFormatter: (value: number) => string;
  series: LineChartSeries;
  value: number;
}) {
  return (
    series.pointLabels?.[pointIndex] ??
    `${formatLunchBoxDateLabel(date)} ${series.label} ${pointValueFormatter(
      value,
    )}`
  );
}

function getClosestLineChartPoint({
  axisMaximum,
  plotHeight,
  pointerX,
  pointerY,
  series,
  xPositions,
}: {
  axisMaximum: number;
  plotHeight: number;
  pointerX: number;
  pointerY: number;
  series: readonly LineChartSeries[];
  xPositions: readonly number[];
}): ActiveLineChartPoint | null {
  let closestPointIndex: number | null = null;
  let closestHorizontalDistance = Number.POSITIVE_INFINITY;

  xPositions.forEach((xPosition, pointIndex) => {
    const hasValue = series.some(
      (item) => typeof item.values[pointIndex] === "number",
    );

    if (!hasValue) {
      return;
    }

    const horizontalDistance = Math.abs(pointerX - xPosition);

    if (horizontalDistance < closestHorizontalDistance) {
      closestHorizontalDistance = horizontalDistance;
      closestPointIndex = pointIndex;
    }
  });

  if (closestPointIndex === null) {
    return null;
  }

  let closestSeriesId: string | null = null;
  let closestVerticalDistance = Number.POSITIVE_INFINITY;

  series.forEach((item) => {
    const value = item.values[closestPointIndex as number];

    if (typeof value !== "number") {
      return;
    }

    const verticalDistance = Math.abs(
      pointerY - getChartY(value, axisMaximum, plotHeight),
    );

    if (verticalDistance < closestVerticalDistance) {
      closestVerticalDistance = verticalDistance;
      closestSeriesId = item.id;
    }
  });

  return closestSeriesId
    ? { pointIndex: closestPointIndex, seriesId: closestSeriesId }
    : null;
}

function wrapLineChartTooltipLabel(label: string) {
  const maximumTextWidth = 320;
  const lines: string[] = [];
  let currentLine = "";
  let currentWidth = 0;

  Array.from(label).forEach((character) => {
    const characterWidth = estimateLineChartTooltipCharacterWidth(character);

    if (currentLine && currentWidth + characterWidth > maximumTextWidth) {
      lines.push(currentLine.trimEnd());
      currentLine = character.trimStart();
      currentWidth = currentLine
        ? estimateLineChartTooltipCharacterWidth(character)
        : 0;
      return;
    }

    currentLine += character;
    currentWidth += characterWidth;
  });

  if (currentLine) {
    lines.push(currentLine.trimEnd());
  }

  return lines.length > 0 ? lines : [label];
}

function estimateLineChartTooltipTextWidth(value: string) {
  return Array.from(value).reduce(
    (width, character) =>
      width + estimateLineChartTooltipCharacterWidth(character),
    0,
  );
}

function estimateLineChartTooltipCharacterWidth(character: string) {
  return character.charCodeAt(0) > 127 ? 12 : 6.5;
}

function createSeriesPath({
  axisMaximum,
  plotHeight,
  values,
  xPositions,
}: {
  axisMaximum: number;
  plotHeight: number;
  values: readonly (number | null)[];
  xPositions: readonly number[];
}) {
  let beginsNewSegment = true;

  return values
    .flatMap((value, index) => {
      if (value === null) {
        beginsNewSegment = true;
        return [];
      }

      const command = beginsNewSegment ? "M" : "L";
      beginsNewSegment = false;

      return `${command}${xPositions[index].toFixed(2)} ${getChartY(
        value,
        axisMaximum,
        plotHeight,
      ).toFixed(2)}`;
    })
    .join(" ");
}

function formatChartCount(value: number) {
  return Number.isInteger(value)
    ? value.toLocaleString("ko-KR")
    : value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
}

function formatChartPointCount(value: number) {
  return `${formatChartCount(value)}개`;
}

function formatWonAxisValue(value: number) {
  const roundedValue = Math.max(0, Math.round(value));

  if (roundedValue >= 100_000_000) {
    return `${formatCompactNumber(roundedValue / 100_000_000)}억원`;
  }

  if (roundedValue >= 10_000) {
    return `${formatCompactNumber(roundedValue / 10_000)}만원`;
  }

  return formatLunchBoxWon(roundedValue);
}

function formatCompactNumber(value: number) {
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: 1,
  });
}

function createHiredWorkerPointLabel({
  date,
  label,
  laborCost,
  totalMinutes,
}: {
  date: string;
  label: string;
  laborCost: number;
  totalMinutes: number;
}) {
  return `${formatLunchBoxDateLabel(date)} ${label} ${formatLunchBoxWorkMinutes(
    totalMinutes,
  )} · ${formatLunchBoxWon(laborCost)}`;
}

function formatWorkerShiftRanges(
  shifts: LunchBoxOperationsChartData["points"][number]["hiredWorkers"][number]["shifts"],
) {
  return shifts
    .map((shift) => `${shift.startTime}~${shift.endTime}`)
    .join(", ");
}
