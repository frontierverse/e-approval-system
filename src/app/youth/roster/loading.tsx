import { PageTitle } from "@/components/page-title";
import { YouthRosterSkeleton } from "@/components/youth-roster-board";

export default function YouthRosterLoading() {
  return (
    <>
      <PageTitle
        title="청소년 명단"
        description="청소년 명단을 불러오는 중입니다."
      />

      <YouthRosterSkeleton />
    </>
  );
}
