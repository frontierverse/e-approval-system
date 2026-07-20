import { CafeManagementSkeleton } from "@/components/cafe-management-skeleton";
import { PageTitle } from "@/components/page-title";

export default function WorkScheduleCafeLoading() {
  return (
    <>
      <PageTitle
        title="카페 관리"
        description="카페 물품을 등록하고 구매일과 유통기한 기준 사용 기한을 확인합니다."
        action={
          <span
            aria-hidden="true"
            className="block h-11 w-48 justify-self-start animate-pulse rounded-md bg-[var(--surface-muted)] motion-reduce:animate-none"
          />
        }
      />
      <CafeManagementSkeleton />
    </>
  );
}
