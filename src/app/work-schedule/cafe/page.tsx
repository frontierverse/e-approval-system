import { CafeItemChangeLogTable } from "@/components/cafe-item-change-log-table";
import { CafeItemList } from "@/components/cafe-item-list";
import { CafeItemRegistrationForm } from "@/components/cafe-item-registration-form";
import { PageTitle } from "@/components/page-title";
import { requireUser } from "@/lib/auth";
import {
  getCafeItemToday,
  normalizeCafeItemChangeLogAction,
  normalizeCafeItemCategory,
  normalizeCafeItemDeadlineFilter,
  normalizeCafeItemPage,
  normalizeCafeItemSort,
} from "@/lib/cafe-items-core";
import { getCafeItemChangeLogPage, getCafeItemPage } from "@/lib/cafe-items";

type CafeManagementSearchParams = {
  category?: string;
  deadline?: string;
  logAction?: string;
  logPage?: string;
  logQ?: string;
  logStaff?: string;
  page?: string;
  q?: string;
  sort?: string;
};

const cafeItemPageSize = 8;
const cafeItemChangeLogPageSize = 5;

export default async function WorkScheduleCafePage({
  searchParams,
}: {
  searchParams: Promise<CafeManagementSearchParams>;
}) {
  await requireUser();

  const params = await searchParams;
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
  const changeLogPage = await getCafeItemChangeLogPage({
    action: normalizeCafeItemChangeLogAction(params.logAction),
    actorId: String(params.logStaff ?? "all"),
    page: normalizeCafeItemPage(params.logPage),
    pageSize: cafeItemChangeLogPageSize,
    query: String(params.logQ ?? "").trim(),
  });

  return (
    <>
      <PageTitle
        title="카페 관리"
        description="카페 물품을 등록하고 구매일과 유통기한 기준 사용 기한을 확인합니다."
      />

      <div className="space-y-5">
        <CafeItemRegistrationForm today={today} />
        <CafeItemList itemPage={itemPage} today={today} />
        <CafeItemChangeLogTable
          itemFilters={itemPage.filters}
          logPage={changeLogPage}
        />
      </div>
    </>
  );
}
