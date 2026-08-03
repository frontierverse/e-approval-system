import type { Metadata } from "next";
import Link from "next/link";
import {
  clearLunchBoxDailySchoolChecksAction,
  clearLunchBoxSchoolChecksAction,
  getLunchBoxCountGridAction,
  getLunchBoxCountMonthAction,
  getLunchBoxDailyCheckHistoryPageAction,
  getLunchBoxDailySchoolChecklistAction,
  getLunchBoxSchoolChecklistAction,
  saveLunchBoxCountsAction,
  setLunchBoxDailySchoolCheckAction,
  setLunchBoxSchoolCheckAction,
} from "@/app/work-schedule/lunch-boxes/actions";
import { LunchBoxChartBoard } from "@/components/lunch-box-chart-board";
import { LunchBoxCountCalendarBoard } from "@/components/lunch-box-count-calendar-board";
import { LunchBoxCountChangeLog } from "@/components/lunch-box-count-change-log";
import { LunchBoxDailySchoolChecklist } from "@/components/lunch-box-daily-school-checklist";
import { LunchBoxSchoolChecklist } from "@/components/lunch-box-school-checklist";
import { LunchBoxSchoolList } from "@/components/lunch-box-school-list";
import { PageTitle } from "@/components/page-title";
import { requireUser } from "@/lib/auth";
import {
  getLunchBoxCountChangeLogPage,
  getLunchBoxChartData,
  getLunchBoxCountMonth,
  getLunchBoxDailyCheckHistoryPage,
  getLunchBoxDailySchoolChecklist,
  getLunchBoxFixedCountList,
  getLunchBoxSchoolChecklist,
  getLunchBoxSchools,
} from "@/lib/lunch-box-counts";
import {
  getLunchBoxCountToday,
  isLunchBoxDate,
  normalizeLunchBoxCountChangeLogPage,
  normalizeLunchBoxDailyCheckHistoryPage,
  normalizeLunchBoxMonth,
} from "@/lib/lunch-box-counts-core";

export const metadata: Metadata = {
  title: "도시락 현황",
};

type LunchBoxManagementTab =
  | "counts"
  | "schoolList"
  | "dailySchoolList"
  | "charts"
  | "schools";

type LunchBoxManagementSearchParams = {
  checkLogPage?: string | string[];
  date?: string | string[];
  logPage?: string | string[];
  month?: string;
  tab?: string;
};

export default async function WorkScheduleLunchBoxesPage({
  searchParams,
}: {
  searchParams: Promise<LunchBoxManagementSearchParams>;
}) {
  await requireUser();

  const params = await searchParams;
  const activeTab = getSelectedLunchBoxTab(params.tab);
  const isCompactTab =
    activeTab === "schoolList" ||
    activeTab === "dailySchoolList" ||
    activeTab === "charts";

  return (
    <>
      {/* 체크 목록과 차트가 바로 보이도록 제목 영역을 압축한다. */}
      {isCompactTab ? (
        <PageTitle compact title="도시락 현황" />
      ) : (
        <PageTitle
          title="도시락 현황"
          description="날짜별 식단과 도시락·보존식·배송기사 수량, 학교별 보존식 배정을 관리합니다."
        />
      )}
      <LunchBoxManagementTabs activeTab={activeTab} />

      <div className={isCompactTab ? "mt-3" : "mt-4"}>
        {activeTab === "schools" ? (
          <LunchBoxSchoolPanel />
        ) : activeTab === "charts" ? (
          <LunchBoxChartPanel />
        ) : activeTab === "dailySchoolList" ? (
          <LunchBoxDailySchoolChecklistPanel
            checkLogPage={params.checkLogPage}
            date={params.date}
          />
        ) : activeTab === "schoolList" ? (
          <LunchBoxSchoolChecklistPanel />
        ) : (
          <LunchBoxCountPanel logPage={params.logPage} month={params.month} />
        )}
      </div>
    </>
  );
}

async function LunchBoxCountPanel({
  logPage,
  month,
}: {
  logPage: string | string[] | undefined;
  month: string | undefined;
}) {
  const today = getLunchBoxCountToday();
  const selectedMonth = normalizeLunchBoxMonth(month);
  const selectedLogPage = normalizeLunchBoxCountChangeLogPage(logPage);
  const [monthData, changeLogPage] = await Promise.all([
    getLunchBoxCountMonth({ month: selectedMonth }),
    getLunchBoxCountChangeLogPage({ page: selectedLogPage }),
  ]);

  return (
    <>
      <LunchBoxCountCalendarBoard
        loadGrid={getLunchBoxCountGridAction}
        loadMonth={getLunchBoxCountMonthAction}
        monthData={monthData}
        saveCounts={saveLunchBoxCountsAction}
        selectedMonth={selectedMonth}
        today={today}
      />
      <LunchBoxCountChangeLog
        changeLogPage={changeLogPage}
        selectedMonth={selectedMonth}
      />
    </>
  );
}

async function LunchBoxSchoolChecklistPanel() {
  const [fixedCountList, initialChecklist] = await Promise.all([
    getLunchBoxFixedCountList(),
    getLunchBoxSchoolChecklist(),
  ]);

  return (
    <LunchBoxSchoolChecklist
      clearChecks={clearLunchBoxSchoolChecksAction}
      fixedCountList={fixedCountList}
      initialChecklist={initialChecklist}
      loadChecklist={getLunchBoxSchoolChecklistAction}
      setSchoolCheck={setLunchBoxSchoolCheckAction}
    />
  );
}

async function LunchBoxDailySchoolChecklistPanel({
  checkLogPage,
  date,
}: {
  checkLogPage: string | string[] | undefined;
  date: string | string[] | undefined;
}) {
  const today = getLunchBoxCountToday();
  const requestedDate = Array.isArray(date) ? date[0] : date;
  const selectedDate =
    requestedDate && isLunchBoxDate(requestedDate) ? requestedDate : today;
  const selectedCheckLogPage =
    normalizeLunchBoxDailyCheckHistoryPage(checkLogPage);
  const [initialChecklist, initialCheckHistoryPage] = await Promise.all([
    getLunchBoxDailySchoolChecklist({
      date: selectedDate,
    }),
    getLunchBoxDailyCheckHistoryPage({
      date: selectedDate,
      page: selectedCheckLogPage,
    }),
  ]);

  return (
    <LunchBoxDailySchoolChecklist
      clearChecks={clearLunchBoxDailySchoolChecksAction}
      initialCheckHistoryPage={initialCheckHistoryPage}
      initialChecklist={initialChecklist}
      loadCheckHistory={getLunchBoxDailyCheckHistoryPageAction}
      loadChecklist={getLunchBoxDailySchoolChecklistAction}
      setSchoolCheck={setLunchBoxDailySchoolCheckAction}
      today={today}
    />
  );
}

async function LunchBoxSchoolPanel() {
  const schools = await getLunchBoxSchools({ activeOnly: false });

  return <LunchBoxSchoolList schools={schools} />;
}

async function LunchBoxChartPanel() {
  const chartData = await getLunchBoxChartData();

  return <LunchBoxChartBoard chartData={chartData} />;
}

function LunchBoxManagementTabs({
  activeTab,
}: {
  activeTab: LunchBoxManagementTab;
}) {
  return (
    <nav aria-label="도시락 현황 항목" className="border-b border-[#d9dee7]">
      <div className="flex gap-2 overflow-x-auto">
        <LunchBoxManagementTabLink
          active={activeTab === "counts"}
          href="/work-schedule/lunch-boxes"
          label="일자별 개수"
        />
        <LunchBoxManagementTabLink
          active={activeTab === "schoolList"}
          href="/work-schedule/lunch-boxes?tab=school-list"
          label="도시락 학교 목록"
        />
        <LunchBoxManagementTabLink
          active={activeTab === "dailySchoolList"}
          href="/work-schedule/lunch-boxes?tab=daily-school-list"
          label="날짜별 학교 목록"
        />
        <LunchBoxManagementTabLink
          active={activeTab === "charts"}
          href="/work-schedule/lunch-boxes?tab=charts"
          label="차트 관리"
        />
        <LunchBoxManagementTabLink
          active={activeTab === "schools"}
          href="/work-schedule/lunch-boxes?tab=schools"
          label="학교 관리"
        />
      </div>
    </nav>
  );
}

function LunchBoxManagementTabLink({
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
        "relative flex h-12 min-w-28 items-center justify-center rounded-t-md border border-transparent px-4 text-sm font-semibold transition-colors",
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

function getSelectedLunchBoxTab(
  value: string | undefined,
): LunchBoxManagementTab {
  if (value === "schools") {
    return "schools";
  }

  if (value === "daily-school-list") {
    return "dailySchoolList";
  }

  if (value === "charts") {
    return "charts";
  }

  return value === "school-list" ? "schoolList" : "counts";
}
