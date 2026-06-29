import { PageTitle } from "@/components/page-title";
import { RefrigeratorManagementBoard } from "@/components/refrigerator-management-board";
import { requireUser } from "@/lib/auth";

export default async function WorkScheduleRefrigeratorPage() {
  await requireUser();

  return (
    <>
      <PageTitle
        title="냉장고 관리"
        description="냉장고 보관 물품과 점검 상태를 관리합니다."
      />

      <RefrigeratorManagementBoard />
    </>
  );
}
