import { PageTitle } from "@/components/page-title";
import { YouthSubjectProgressBoard } from "@/components/youth-subject-progress-board";
import { requireUser } from "@/lib/auth";
import { getYouthProfiles } from "@/lib/youth-management";
import {
  getYouthStudyConceptChecks,
  getYouthStudyConcepts,
} from "@/lib/youth-subject-progress";

export default async function YouthLearningProgressPage() {
  await requireUser();
  const [youthProfiles, concepts, checks] = await Promise.all([
    getYouthProfiles(),
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
        youths={youthProfiles.map((youth) => ({
          id: youth.id,
          name: youth.name,
        }))}
        concepts={concepts}
        checks={checks}
      />
    </>
  );
}
