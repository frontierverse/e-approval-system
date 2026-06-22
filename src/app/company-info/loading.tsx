import { CompanyInfoSkeleton } from "@/components/company-info-board";
import { PageTitle } from "@/components/page-title";

export default function CompanyInfoLoading() {
  return (
    <>
      <PageTitle
        title="회사 정보"
        description="사업자 정보와 현재 현황을 불러오는 중입니다."
      />

      <CompanyInfoSkeleton />
    </>
  );
}
