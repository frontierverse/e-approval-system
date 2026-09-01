import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { YouthSubjectProgressBoard } from "@/components/youth-subject-progress-board";
import { requireYouthBasicAccess } from "@/lib/youth-permissions";
import { getYouthDirectory } from "@/lib/youth-management";
import {
  getYouthStudyConceptChecks,
  getYouthStudyConcepts,
} from "@/lib/youth-subject-progress";

export const metadata: Metadata = {
  title: "학습진도",
};

export default async function YouthLearningProgressPage() {
  await requireYouthBasicAccess();
  const [youthProfiles, concepts, checks] = await Promise.all([
    getYouthDirectory(),
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
