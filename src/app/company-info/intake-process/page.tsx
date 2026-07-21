import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { BajaulIntakeFlowchart } from "@/components/bajaul-intake-flowchart";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "입소 절차 안내",
};

export default async function BajaulIntakeProcessPage() {
  await requireUser();

  return (
    <>
      <PageTitle
        title="입소 절차 안내"
        description="소년보호 1호처분에 따라 청소년이 바자울에 위탁되기까지의 절차와 이후 보호 흐름입니다. 신규 입사자가 전체 흐름을 빠르게 파악할 수 있도록 정리했습니다."
      />
      <BajaulIntakeFlowchart />
    </>
  );
}
