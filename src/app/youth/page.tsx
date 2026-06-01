import { PageTitle } from "@/components/page-title";
import { YouthManagementBoard } from "@/components/youth-management-board";
import {
  createYouthAction,
  deleteYouthNoteAction,
  updateYouthNoteAction,
} from "@/app/youth/actions";
import { requireUser } from "@/lib/auth";
import { getYouthProfiles } from "@/lib/youth-management";

export default async function YouthPage() {
  await requireUser();
  const youthProfiles = await getYouthProfiles();

  return (
    <>
      <PageTitle
        title="청소년 관리"
        description="청소년 이름 탭을 선택해 해당 청소년의 특이사항 카드를 확인합니다."
      />

      <YouthManagementBoard
        createYouth={createYouthAction}
        deleteYouthNote={deleteYouthNoteAction}
        initialYouths={youthProfiles}
        updateYouthNote={updateYouthNoteAction}
      />
    </>
  );
}
