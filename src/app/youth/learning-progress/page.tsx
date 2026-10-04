import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { YouthSubjectProgressBoard } from "@/components/youth-subject-progress-board";
import { requireYouthBasicAccess } from "@/lib/youth-permissions";
import { getYouthLearningParents } from "@/lib/youth-mobile-learning";
import { getEffectiveYouthPermissions } from "@/lib/youth-permissions-core";
import {
  getYouthStudyConceptChecks,
  getYouthStudyConcepts,
} from "@/lib/youth-subject-progress";

export const metadata: Metadata = {
  title: "학습진도",
};

export default async function YouthLearningProgressPage() {
  const user = await requireYouthBasicAccess();
  const [youthProfiles, concepts, checks] = await Promise.all([
    getYouthLearningParents({ actorId: user.id, client: "web" }),
    getYouthStudyConcepts(),
    getYouthStudyConceptChecks(),
  ]);

  return (
    <>
      <PageTitle
        title="학습진도"
        description="과목별 소단원 개념을 학생마다 숙지했는지 체크리스트로 기록합니다."
      />

      <YouthSubjectProgressBoard
        actorId={user.id}
        canManage={getEffectiveYouthPermissions(user).canManageYouth}
        youths={youthProfiles.map((youth) => ({
          id: youth.id,
          name: youth.name,
          updatedAt: youth.updatedAt,
        }))}
        concepts={concepts}
        checks={checks}
      />
    </>
  );
}
