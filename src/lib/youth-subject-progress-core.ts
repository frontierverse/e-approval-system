export const youthStudySubjects = [{ value: "math", label: "수학" }] as const;

export type YouthStudySubject = (typeof youthStudySubjects)[number]["value"];

export const youthStudyConceptMaxLength = 200;

export type YouthStudySubunit = {
  id: string;
  label: string;
};

export type YouthStudyUnit = {
  id: string;
  label: string;
  subunits: YouthStudySubunit[];
};

export type YouthStudySemester = {
  id: string;
  label: string;
  units: YouthStudyUnit[];
};

export type YouthStudyConcept = {
  id: string;
  subject: YouthStudySubject;
  subunitId: string;
  content: string;
  createdAt: string;
};

export type YouthStudyConceptCheck = {
  conceptId: string;
  youthId: string;
};

export type YouthStudyConceptFormState = {
  error?: string;
  resetKey?: string;
  success?: string;
  values?: {
    content: string;
  };
};

const mathCurriculum: YouthStudySemester[] = [
  {
    id: "semester-1",
    label: "1학기",
    units: [
      {
        id: "1",
        label: "1. 소인수분해",
        subunits: [
          { id: "1-1", label: "1-1. 소인수분해" },
          { id: "1-2", label: "1-2. 최대공약수와 최소공배수" },
        ],
      },
      {
        id: "2",
        label: "2. 정수와 유리수",
        subunits: [
          { id: "2-1", label: "2-1. 정수와 유리수" },
          { id: "2-2", label: "2-2. 정수와 유리수의 계산" },
        ],
      },
      {
        id: "3",
        label: "3. 문자와 식",
        subunits: [
          { id: "3-1", label: "3-1. 문자의 사용과 식의 계산" },
          { id: "3-2", label: "3-2. 일차방정식" },
          { id: "3-3", label: "3-3. 일차방정식의 활용" },
        ],
      },
      {
        id: "4",
        label: "4. 좌표평면과 그래프",
        subunits: [
          { id: "4-1", label: "4-1. 좌표와 그래프" },
          { id: "4-2", label: "4-2. 정비례와 반비례" },
        ],
      },
    ],
  },
  {
    id: "semester-2",
    label: "2학기",
    units: [
      {
        id: "5",
        label: "5. 기본 도형",
        subunits: [
          { id: "5-1", label: "5-1. 기본 도형" },
          { id: "5-2", label: "5-2. 평행선의 성질" },
          { id: "5-3", label: "5-3. 작도와 합동" },
        ],
      },
      {
        id: "6",
        label: "6. 평면도형의 성질",
        subunits: [
          { id: "6-1", label: "6-1. 다각형" },
          { id: "6-2", label: "6-2. 원과 부채꼴" },
        ],
      },
      {
        id: "7",
        label: "7. 입체도형의 성질",
        subunits: [
          { id: "7-1", label: "7-1. 다면체와 회전체" },
          { id: "7-2", label: "7-2. 입체도형의 겉넓이와 부피" },
        ],
      },
      {
        id: "8",
        label: "8. 통계",
        subunits: [
          { id: "8-1", label: "8-1. 자료의 정리와 해석" },
          { id: "8-2", label: "8-2. 상대도수" },
        ],
      },
    ],
  },
];

const curriculumsBySubject: Record<YouthStudySubject, YouthStudySemester[]> = {
  math: mathCurriculum,
};

export function isYouthStudySubject(value: string): value is YouthStudySubject {
  return youthStudySubjects.some((subject) => subject.value === value);
}

export function getYouthStudySubjectLabel(subject: string) {
  return (
    youthStudySubjects.find((candidate) => candidate.value === subject)?.label ??
    subject
  );
}

export function getYouthStudyCurriculum(subject: YouthStudySubject) {
  return curriculumsBySubject[subject];
}

export function getYouthStudySubunits(subject: YouthStudySubject) {
  return getYouthStudyCurriculum(subject).flatMap((semester) =>
    semester.units.flatMap((unit) => unit.subunits),
  );
}

export function isYouthStudySubunitId(subject: string, subunitId: string) {
  if (!isYouthStudySubject(subject)) {
    return false;
  }

  return getYouthStudySubunits(subject).some(
    (subunit) => subunit.id === subunitId,
  );
}

export function getYouthStudySubunitLabel(
  subject: YouthStudySubject,
  subunitId: string,
) {
  return (
    getYouthStudySubunits(subject).find((subunit) => subunit.id === subunitId)
      ?.label ?? subunitId
  );
}

export function normalizeYouthStudyConceptContent(value: unknown) {
  return String(value ?? "").trim();
}

export function validateYouthStudyConceptContent(content: string) {
  if (!content) {
    return "개념 내용을 입력하세요.";
  }

  if (content.length > youthStudyConceptMaxLength) {
    return `개념은 ${youthStudyConceptMaxLength}자 이하로 입력하세요.`;
  }

  return "";
}

export function createYouthStudyConceptCheckKey(
  conceptId: string,
  youthId: string,
) {
  return `${conceptId}:${youthId}`;
}
