import Link from "next/link";
import { CafeItemChangeLogTable } from "@/components/cafe-item-change-log-table";
import { CafeItemList } from "@/components/cafe-item-list";
import { CafeItemRegistrationForm } from "@/components/cafe-item-registration-form";
import {
  CafeComplianceNoteForm,
  CafeComplianceNoteList,
} from "@/components/cafe-compliance-board";
import { PageTitle } from "@/components/page-title";
import { requireUser } from "@/lib/auth";
import { getCafeComplianceNotePage } from "@/lib/cafe-compliance-notes";
import { normalizeCafeComplianceNotePage } from "@/lib/cafe-compliance-notes-core";
import {
  getCafeItemToday,
  normalizeCafeItemChangeLogAction,
  normalizeCafeItemCategory,
  normalizeCafeItemDeadlineFilter,
  normalizeCafeItemPage,
  normalizeCafeItemSort,
} from "@/lib/cafe-items-core";
import { getCafeItemChangeLogPage, getCafeItemPage } from "@/lib/cafe-items";
import {
  getCafeItemChangeLogPageAction,
  getCafeItemPageAction,
} from "@/app/work-schedule/cafe/actions";

type CafeManagementTab = "items" | "compliance";

type CafeManagementSearchParams = {
  category?: string;
  deadline?: string;
  logAction?: string;
  logPage?: string;
  logQ?: string;
  logStaff?: string;
  notePage?: string;
  page?: string;
  q?: string;
  sort?: string;
  tab?: string;
};

const cafeItemPageSize = 7;
const cafeItemChangeLogPageSize = 5;
const cafeComplianceNotePageSize = 7;

export default async function WorkScheduleCafePage({
  searchParams,
}: {
  searchParams: Promise<CafeManagementSearchParams>;
}) {
  await requireUser();

  const params = await searchParams;
  const activeTab = getSelectedCafeTab(params.tab);

  return (
    <>
      <PageTitle
        title="카페 관리"
        description={
          activeTab === "compliance"
            ? "카페 운영 시 함께 지켜야 할 준수사항을 기록하고 공유합니다."
            : "카페 물품을 등록하고 구매일과 유통기한 기준 사용 기한을 확인합니다."
        }
      />

      <CafeManagementTabs activeTab={activeTab} />

      <div className="mt-6">
        {activeTab === "compliance" ? (
          <CafeCompliancePanel params={params} />
        ) : (
          <CafeItemPanel params={params} />
        )}
      </div>
    </>
  );
}

async function CafeItemPanel({
  params,
}: {
  params: CafeManagementSearchParams;
}) {
  const today = getCafeItemToday();
  const filters = {
    category: normalizeCafeItemCategory(params.category),
    deadline: normalizeCafeItemDeadlineFilter(params.deadline),
    page: normalizeCafeItemPage(params.page),
    query: String(params.q ?? "").trim(),
    sort: normalizeCafeItemSort(params.sort),
  };
  const itemPage = await getCafeItemPage({
    ...filters,
    pageSize: cafeItemPageSize,
    today,
  });
  const cafeItemListKey = [
    filters.category,
    filters.deadline,
    filters.page,
    filters.query,
    filters.sort,
    today,
  ].join(":");
  const changeLogPage = await getCafeItemChangeLogPage({
    action: normalizeCafeItemChangeLogAction(params.logAction),
    actorId: String(params.logStaff ?? "all"),
    page: normalizeCafeItemPage(params.logPage),
    pageSize: cafeItemChangeLogPageSize,
    query: String(params.logQ ?? "").trim(),
  });

  return (
    <div className="space-y-5">
      <CafeItemRegistrationForm today={today} />
      <CafeItemList
        key={cafeItemListKey}
        itemPage={itemPage}
        loadItemPage={getCafeItemPageAction}
        today={today}
      />
      <CafeItemChangeLogTable
        itemFilters={itemPage.filters}
        loadLogPage={getCafeItemChangeLogPageAction}
        logPage={changeLogPage}
      />
    </div>
  );
}

async function CafeCompliancePanel({
  params,
}: {
  params: CafeManagementSearchParams;
}) {
  const notePage = await getCafeComplianceNotePage({
    page: normalizeCafeComplianceNotePage(params.notePage),
    pageSize: cafeComplianceNotePageSize,
  });

  return (
    <div className="space-y-5">
      <CafeComplianceNoteForm />
      <CafeComplianceNoteList notePage={notePage} />
    </div>
  );
}

function CafeManagementTabs({ activeTab }: { activeTab: CafeManagementTab }) {
  return (
    <nav aria-label="카페 관리 항목" className="border-b border-[#d9dee7]">
      <div className="flex gap-2 overflow-x-auto">
        <CafeManagementTabLink
          active={activeTab === "items"}
          href="/work-schedule/cafe"
          label="물품 등록"
        />
        <CafeManagementTabLink
          active={activeTab === "compliance"}
          href="/work-schedule/cafe?tab=compliance"
          label="준수사항"
        />
      </div>
    </nav>
  );
}

function CafeManagementTabLink({
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

function getSelectedCafeTab(value: string | undefined): CafeManagementTab {
  return value === "compliance" ? "compliance" : "items";
}
