"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  formatLunchBoxDateLabel,
  formatLunchBoxShortDateLabel,
  getLunchBoxChartCount,
  type LunchBoxChartData,
} from "@/lib/lunch-box-counts-core";

type LunchBoxChartBoardProps = {
  chartData: LunchBoxChartData;
};

type ChartKind = "total" | "schools";
type ChartOrientation = "portrait" | "landscape";

type LineChartSeries = {
  className: string;
  dashArray?: string;
  id: string;
  label: string;
  values: number[];
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

export function LunchBoxChartBoard({
  chartData,
}: LunchBoxChartBoardProps) {
  const [includeTotalPreservation, setIncludeTotalPreservation] =
    useState(true);
  const [includeSchoolPreservation, setIncludeSchoolPreservation] =
    useState(true);
  const totalPreservationId = useId();
  const schoolPreservationId = useId();
  const rangeLabel = createChartRangeLabel(chartData);
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
  includePreservation: boolean;
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
  dates,
  series,
  showPointMarkers = false,
}: {
  ariaLabel: string;
  dates: readonly string[];
  series: readonly LineChartSeries[];
  showPointMarkers?: boolean;
}) {
  if (dates.length === 0) {
    return (
      <div
        className="px-4 py-6 text-center text-sm text-[var(--text-muted)]"
        role="status"
      >
        표시할 도시락 공급 데이터가 없습니다.
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
    ...series.flatMap((item) => item.values),
  );
  const axisMaximum = getChartAxisMaximum(maximumValue);
  const yTicks = Array.from(
    { length: 5 },
    (_, index) => (axisMaximum / 4) * index,
  ).reverse();
  const xPositions = dates.map((_, index) =>
    getChartX(index, dates.length, plotWidth),
  );

  return (
    <>
      <div
        aria-label={`${ariaLabel} 가로 스크롤 영역`}
        className="overflow-x-auto scrollbar-stable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"
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
            <desc>
              주말과 공급이 없는 날을 제외한 실제 공급일을 동일한 간격으로
              배치한 선 차트입니다.
            </desc>

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
                    {formatChartCount(tick)}
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
                    strokeWidth={series.length === 1 ? 2.5 : 1.6}
                    vectorEffect="non-scaling-stroke"
                  />
                  {showPointMarkers || dates.length === 1
                    ? item.values.map((value, index) => (
                        <g key={`${item.id}-${dates[index]}`}>
                          <circle
                            cx={xPositions[index]}
                            cy={getChartY(
                              value,
                              axisMaximum,
                              plotHeight,
                            )}
                            fill="var(--surface)"
                            r="3.5"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                          <title>{`${formatLunchBoxDateLabel(
                            dates[index],
                          )} ${value.toLocaleString("ko-KR")}개`}</title>
                        </g>
                      ))
                    : null}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <ChartLegend series={series} />
    </>
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
                strokeWidth="2"
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

function createChartPrintHref(
  chartKind: ChartKind,
  orientation: ChartOrientation,
  includePreservation: boolean,
) {
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

function createSeriesPath({
  axisMaximum,
  plotHeight,
  values,
  xPositions,
}: {
  axisMaximum: number;
  plotHeight: number;
  values: readonly number[];
  xPositions: readonly number[];
}) {
  return values
    .map((value, index) => {
      const command = index === 0 ? "M" : "L";

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
