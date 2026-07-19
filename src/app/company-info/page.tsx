import type { Metadata } from "next";
import { CompanyInfoBoard } from "@/components/company-info-board";
import { PageTitle } from "@/components/page-title";
import { getCompanyInfo } from "@/lib/company-info";

export const metadata: Metadata = {
  title: "회사 정보",
};

export default async function CompanyInfoPage() {
  const companyInfo = await getCompanyInfo();

  return (
    <>
      <PageTitle
        title="회사 정보"
        description="사업자 정보와 현재 직원, 입소중 청소년 현황을 확인합니다."
      />

      <CompanyInfoBoard data={companyInfo} />
    </>
  );
}
