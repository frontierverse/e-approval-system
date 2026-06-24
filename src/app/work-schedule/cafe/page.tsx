import { CafeItemList } from "@/components/cafe-item-list";
import { CafeItemRegistrationForm } from "@/components/cafe-item-registration-form";
import { PageTitle } from "@/components/page-title";
import { requireUser } from "@/lib/auth";
import {
  getCafeItemToday,
  normalizeCafeItemCategory,
  normalizeCafeItemDeadlineFilter,
  normalizeCafeItemPage,
} from "@/lib/cafe-items-core";
import { getCafeItemPage } from "@/lib/cafe-items";

type CafeManagementSearchParams = {
  category?: string;
  deadline?: string;
  page?: string;
  q?: string;
};

const cafeItemPageSize = 8;

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
  };
  const itemPage = await getCafeItemPage({
    ...filters,
    pageSize: cafeItemPageSize,
    today,
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
      </div>
    </>
  );
}
