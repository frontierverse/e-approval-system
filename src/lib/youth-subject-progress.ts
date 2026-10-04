import { youthOperationalWhere } from "@/lib/youth-retention-core";
import { getYouthLearningScheduleToday } from "@/lib/youth-management-core";
import { prisma } from "@/lib/prisma";
import {
  isYouthStudySubject,
  type YouthStudyConcept,
  type YouthStudyConceptCheck,
} from "@/lib/youth-subject-progress-core";

export async function getYouthStudyConcepts(): Promise<YouthStudyConcept[]> {
  const concepts = await prisma.studyConcept.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      subject: true,
      subunitId: true,
      content: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return concepts.flatMap((concept) =>
    isYouthStudySubject(concept.subject)
      ? [
          {
            id: concept.id,
            subject: concept.subject,
            subunitId: concept.subunitId,
            content: concept.content,
            createdAt: concept.createdAt.toISOString(),
            updatedAt: concept.updatedAt.toISOString(),
          },
        ]
      : [],
  );
}

export async function getYouthStudyConceptChecks(): Promise<
  YouthStudyConceptCheck[]
> {
  const checks = await prisma.studyConceptCheck.findMany({
    where: { youth: { is: youthOperationalWhere(getYouthLearningScheduleToday()) } },
    select: {
      conceptId: true,
      youthId: true,
    },
  });

  return checks;
}
