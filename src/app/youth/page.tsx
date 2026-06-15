import { PageTitle } from "@/components/page-title";
import { YouthManagementReauthForm } from "@/components/youth-management-reauth-form";
import { YouthManagementBoard } from "@/components/youth-management-board";
import {
  createYouthAction,
  deleteYouthNoteAction,
  updateYouthAction,
  updateYouthNoteAction,
} from "@/app/youth/actions";
import { requireUser } from "@/lib/auth";
import {
  createYouthManagementAccessValue,
  hasYouthManagementAccess,
} from "@/lib/youth-management-access";
import { getYouthProfiles } from "@/lib/youth-management";

export default async function YouthPage() {
  const user = await requireUser();
  const hasAccess = await hasYouthManagementAccess(user.id);

  if (!hasAccess) {
    return (
      <>
        <PageTitle
          title="청소년 관리"
          description="민감한 청소년 정보 보호를 위해 본인 계정 비밀번호를 다시 확인합니다."
        />

        <YouthManagementReauthForm userName={user.name} />
      </>
    );
  }

  const youthProfiles = await getYouthProfiles();
  const actionAccessToken = createYouthManagementAccessValue(user.id);

  async function createYouthWithAccess(
    values: Parameters<typeof createYouthAction>[1],
  ) {
    "use server";

    return createYouthAction(actionAccessToken, values);
  }

  async function deleteYouthNoteWithAccess(
    noteId: Parameters<typeof deleteYouthNoteAction>[1],
  ) {
    "use server";

    return deleteYouthNoteAction(actionAccessToken, noteId);
  }

  async function updateYouthWithAccess(
    youthId: Parameters<typeof updateYouthAction>[1],
    values: Parameters<typeof updateYouthAction>[2],
  ) {
    "use server";

    return updateYouthAction(actionAccessToken, youthId, values);
  }

  async function updateYouthNoteWithAccess(
    noteId: Parameters<typeof updateYouthNoteAction>[1],
    values: Parameters<typeof updateYouthNoteAction>[2],
  ) {
    "use server";

    return updateYouthNoteAction(actionAccessToken, noteId, values);
  }

  return (
    <>
      <PageTitle
        title="청소년 관리"
        description="청소년 이름 탭을 선택해 해당 청소년의 특이사항 카드를 확인합니다."
      />

      <YouthManagementBoard
        createYouth={createYouthWithAccess}
        deleteYouthNote={deleteYouthNoteWithAccess}
        initialYouths={youthProfiles}
        updateYouth={updateYouthWithAccess}
        updateYouthNote={updateYouthNoteWithAccess}
      />
    </>
  );
}
