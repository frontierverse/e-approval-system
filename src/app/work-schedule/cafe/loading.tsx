import { CafeManagementSkeleton } from "@/components/cafe-management-skeleton";
import { PageTitle } from "@/components/page-title";

export default function WorkScheduleCafeLoading() {
  return (
    <>
      <PageTitle
        title="카페 관리"
        description="카페 물품을 등록하고 구매일과 유통기한 기준 사용 기한을 확인합니다."
      />
      <CafeManagementSkeleton />
    </>
  );
}
