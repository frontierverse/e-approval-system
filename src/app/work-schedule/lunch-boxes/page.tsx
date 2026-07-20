import type { Metadata } from "next";
import Link from "next/link";
import {
  getLunchBoxCountGridAction,
  saveLunchBoxCountsAction,
} from "@/app/work-schedule/lunch-boxes/actions";
import { LunchBoxCountCalendarBoard } from "@/components/lunch-box-count-calendar-board";
import { LunchBoxCountChangeLog } from "@/components/lunch-box-count-change-log";
import { LunchBoxSchoolList } from "@/components/lunch-box-school-list";
import { PageTitle } from "@/components/page-title";
import { requireUser } from "@/lib/auth";
import {
  getLunchBoxCountChangeLogPage,
  getLunchBoxCountMonth,
  getLunchBoxSchools,
} from "@/lib/lunch-box-counts";
import {
  getLunchBoxCountToday,
  normalizeLunchBoxCountChangeLogPage,
  normalizeLunchBoxMonth,
} from "@/lib/lunch-box-counts-core";

export const metadata: Metadata = {
  title: "도시락 현황",
};

type LunchBoxManagementTab = "counts" | "schools";

type LunchBoxManagementSearchParams = {
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

  return (
    <>
      <PageTitle
        title="도시락 현황"
        description="날짜별 도시락·보존식·배송기사 수량과 학교별 보존식 배정을 관리합니다."
      />
      <LunchBoxManagementTabs activeTab={activeTab} />

      <div className="mt-6">
        {activeTab === "schools" ? (
          <LunchBoxSchoolPanel />
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

async function LunchBoxSchoolPanel() {
  const schools = await getLunchBoxSchools({ activeOnly: false });

  return <LunchBoxSchoolList schools={schools} />;
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
  return value === "schools" ? "schools" : "counts";
}
