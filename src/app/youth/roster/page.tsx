import { PageTitle } from "@/components/page-title";
import { YouthRosterBoard } from "@/components/youth-roster-board";
import { requireUser } from "@/lib/auth";
import { getYouthRoster } from "@/lib/youth-roster";
import {
  createYouthAction,
  deleteYouthAction,
  updateYouthAction,
} from "@/app/youth/actions";

export default async function YouthRosterPage() {
  await requireUser();
  const roster = await getYouthRoster();

  return (
    <>
      <PageTitle
        title="청소년 명단"
        description="입소중인 청소년과 퇴소 청소년 현황을 확인합니다."
      />

      <YouthRosterBoard
        createYouth={createYouthAction}
        data={roster}
        deleteYouth={deleteYouthAction}
        updateYouth={updateYouthAction}
      />
    </>
  );
}
