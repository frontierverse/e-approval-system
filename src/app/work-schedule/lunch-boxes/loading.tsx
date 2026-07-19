import { LunchBoxManagementSkeleton } from "@/components/lunch-box-management-skeleton";
import { PageTitle } from "@/components/page-title";

export default function WorkScheduleLunchBoxesLoading() {
  return (
    <>
      <PageTitle
        title="도시락 현황"
        description="날짜별 도시락 수량과 학교 정보를 한곳에서 관리합니다."
      />
      <LunchBoxManagementSkeleton />
    </>
  );
}
