import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: getDatabaseUrl(),
  }),
});

const subject = "중학수학";
const gradeLevel = "1학년";

const majorUnits = [
  {
    id: "problem-unit-middle-math-g1-v2-01",
    semester: "1학기",
    name: "I. 소인수분해",
    sortOrder: 10,
    children: [
      {
        id: "problem-unit-middle-math-g1-v2-01-01",
        name: "소인수분해",
        sortOrder: 11,
      },
      {
        id: "problem-unit-middle-math-g1-v2-01-02",
        name: "최대공약수와 최소공배수",
        sortOrder: 12,
      },
    ],
  },
  {
    id: "problem-unit-middle-math-g1-v2-02",
    semester: "1학기",
    name: "II. 정수와 유리수",
    sortOrder: 20,
    children: [
      {
        id: "problem-unit-middle-math-g1-v2-02-01",
        name: "정수와 유리수",
        sortOrder: 21,
      },
      {
        id: "problem-unit-middle-math-g1-v2-02-02",
        name: "정수와 유리수의 계산",
        sortOrder: 22,
      },
    ],
  },
  {
    id: "problem-unit-middle-math-g1-v2-03",
    semester: "1학기",
    name: "III. 문자와 식",
    sortOrder: 30,
    children: [
      {
        id: "problem-unit-middle-math-g1-v2-03-01",
        name: "문자의 사용과 식의 계산",
        sortOrder: 31,
      },
      {
        id: "problem-unit-middle-math-g1-v2-03-02",
        name: "일차방정식",
        sortOrder: 32,
      },
    ],
  },
  {
    id: "problem-unit-middle-math-g1-v2-04",
    semester: "1학기",
    name: "IV. 좌표평면과 그래프",
    sortOrder: 40,
    children: [
      {
        id: "problem-unit-middle-math-g1-v2-04-01",
        name: "좌표와 그래프",
        sortOrder: 41,
      },
      {
        id: "problem-unit-middle-math-g1-v2-04-02",
        name: "정비례와 반비례",
        sortOrder: 42,
      },
    ],
  },
  {
    id: "problem-unit-middle-math-g1-v2-05",
    semester: "2학기",
    name: "V. 기본 도형",
    sortOrder: 50,
    children: [
      {
        id: "problem-unit-middle-math-g1-v2-05-01",
        name: "점, 선, 면, 각",
        sortOrder: 51,
      },
      {
        id: "problem-unit-middle-math-g1-v2-05-02",
        name: "위치 관계",
        sortOrder: 52,
      },
      {
        id: "problem-unit-middle-math-g1-v2-05-03",
        name: "작도와 합동",
        sortOrder: 53,
      },
    ],
  },
  {
    id: "problem-unit-middle-math-g1-v2-06",
    semester: "2학기",
    name: "VI. 평면도형의 성질",
    sortOrder: 60,
    children: [
      {
        id: "problem-unit-middle-math-g1-v2-06-01",
        name: "다각형",
        sortOrder: 61,
      },
      {
        id: "problem-unit-middle-math-g1-v2-06-02",
        name: "원과 부채꼴",
        sortOrder: 62,
      },
    ],
  },
  {
    id: "problem-unit-middle-math-g1-v2-07",
    semester: "2학기",
    name: "VII. 입체도형의 성질",
    sortOrder: 70,
    children: [
      {
        id: "problem-unit-middle-math-g1-v2-07-01",
        name: "다면체와 회전체",
        sortOrder: 71,
      },
      {
        id: "problem-unit-middle-math-g1-v2-07-02",
        name: "입체도형의 겉넓이와 부피",
        sortOrder: 72,
      },
    ],
  },
  {
    id: "problem-unit-middle-math-g1-v2-08",
    semester: "2학기",
    name: "VIII. 자료의 정리와 해석",
    sortOrder: 80,
    children: [
      {
        id: "problem-unit-middle-math-g1-v2-08-01",
        name: "대푯값",
        sortOrder: 81,
      },
      {
        id: "problem-unit-middle-math-g1-v2-08-02",
        name: "도수분포표와 그래프",
        sortOrder: 82,
      },
      {
        id: "problem-unit-middle-math-g1-v2-08-03",
        name: "상대도수",
        sortOrder: 83,
      },
    ],
  },
] as const;

type UnitInput = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};

type EnsureUnitResult = {
  id: string;
  created: boolean;
};

const explicitLegacyUnitTargetNames = new Map([
  ["수와 연산", "소인수분해"],
  ["소인수분해", "소인수분해"],
  ["정수와 유리수", "정수와 유리수"],
  ["변화와 관계", "문자의 사용과 식의 계산"],
  ["문자와 식", "문자의 사용과 식의 계산"],
  ["일차방정식", "일차방정식"],
  ["좌표평면과 그래프", "좌표와 그래프"],
  ["정비례와 반비례", "정비례와 반비례"],
  ["도형과 측정", "점, 선, 면, 각"],
  ["기본 도형", "점, 선, 면, 각"],
  ["작도와 합동", "작도와 합동"],
  ["평면도형", "다각형"],
  ["입체도형", "다면체와 회전체"],
  ["자료와 가능성", "도수분포표와 그래프"],
  ["자료의 정리와 해석", "도수분포표와 그래프"],
  ["대푯값", "대푯값"],
  ["도수분포와 상대도수", "상대도수"],
]);

async function main() {
  const desiredIds = getDesiredUnitIds();
  const desiredChildIdsByName = new Map(
    majorUnits.flatMap((majorUnit) =>
      majorUnit.children.map((childUnit) => [childUnit.name, childUnit.id]),
    ),
  );
  let createdCount = 0;
  let updatedCount = 0;

  for (const majorUnit of majorUnits) {
    const majorResult = await ensureUnit({
      id: majorUnit.id,
      name: majorUnit.name,
      parentId: null,
      sortOrder: majorUnit.sortOrder,
    });

    createdCount += majorResult.created ? 1 : 0;
    updatedCount += majorResult.created ? 0 : 1;

    for (const childUnit of majorUnit.children) {
      const childResult = await ensureUnit({
        id: childUnit.id,
        name: childUnit.name,
        parentId: majorResult.id,
        sortOrder: childUnit.sortOrder,
      });

      createdCount += childResult.created ? 1 : 0;
      updatedCount += childResult.created ? 0 : 1;
    }
  }

  const moveResult = await moveLegacyRelations({
    desiredChildIdsByName,
    desiredIds,
  });
  const deleteResult = await deleteObsoleteUnits(desiredIds);
  const [totalCount, majorCount, subunitCount] = await Promise.all([
    prisma.problemUnit.count({
      where: {
        subject,
        gradeLevel,
      },
    }),
    prisma.problemUnit.count({
      where: {
        subject,
        gradeLevel,
        parentId: null,
      },
    }),
    prisma.problemUnit.count({
      where: {
        subject,
        gradeLevel,
        parentId: {
          not: null,
        },
      },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        createdCount,
        deletedObsoleteCount: deleteResult.count,
        gradeLevel,
        majorCount,
        movedPdfCount: moveResult.movedPdfCount,
        movedProblemCount: moveResult.movedProblemCount,
        movedWorksheetCount: moveResult.movedWorksheetCount,
        subject,
        subunitCount,
        totalCount,
        updatedCount,
      },
      null,
      2,
    ),
  );
}

async function ensureUnit({
  id,
  name,
  parentId,
  sortOrder,
}: UnitInput): Promise<EnsureUnitResult> {
  const existing = await prisma.problemUnit.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    const unit = await prisma.problemUnit.update({
      where: {
        id: existing.id,
      },
      data: {
        subject,
        gradeLevel,
        name,
        parentId,
        sortOrder,
      },
      select: {
        id: true,
      },
    });

    return {
      ...unit,
      created: false,
    };
  }

  const unit = await prisma.problemUnit.create({
    data: {
      id,
      subject,
      gradeLevel,
      name,
      parentId,
      sortOrder,
    },
    select: {
      id: true,
    },
  });

  return {
    ...unit,
    created: true,
  };
}

async function moveLegacyRelations({
  desiredChildIdsByName,
  desiredIds,
}: {
  desiredChildIdsByName: Map<string, string>;
  desiredIds: Set<string>;
}) {
  const legacyUnits = await prisma.problemUnit.findMany({
    where: {
      subject,
      gradeLevel,
      id: {
        notIn: Array.from(desiredIds),
      },
    },
    select: {
      id: true,
      name: true,
    },
  });
  let movedPdfCount = 0;
  let movedProblemCount = 0;
  let movedWorksheetCount = 0;

  for (const legacyUnit of legacyUnits) {
    const targetName = getLegacyTargetName(legacyUnit.name);
    const targetUnitId = targetName
      ? desiredChildIdsByName.get(targetName)
      : undefined;

    if (!targetUnitId) {
      continue;
    }

    const [pdfResult, problemResult, worksheetResult] = await Promise.all([
      prisma.questionBankPdf.updateMany({
        where: {
          unitId: legacyUnit.id,
        },
        data: {
          unitId: targetUnitId,
        },
      }),
      prisma.questionBankProblem.updateMany({
        where: {
          unitId: legacyUnit.id,
        },
        data: {
          unitId: targetUnitId,
        },
      }),
      prisma.worksheetGeneration.updateMany({
        where: {
          unitId: legacyUnit.id,
        },
        data: {
          unitId: targetUnitId,
        },
      }),
    ]);

    movedPdfCount += pdfResult.count;
    movedProblemCount += problemResult.count;
    movedWorksheetCount += worksheetResult.count;
  }

  return {
    movedPdfCount,
    movedProblemCount,
    movedWorksheetCount,
  };
}

async function deleteObsoleteUnits(desiredIds: Set<string>) {
  const obsoleteUnits = await prisma.problemUnit.findMany({
    where: {
      subject,
      gradeLevel,
      id: {
        notIn: Array.from(desiredIds),
      },
    },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          pdfs: true,
          problems: true,
          worksheetGenerations: true,
        },
      },
    },
  });
  const blockedUnits = obsoleteUnits.filter(
    (unit) =>
      unit._count.pdfs > 0 ||
      unit._count.problems > 0 ||
      unit._count.worksheetGenerations > 0,
  );

  if (blockedUnits.length > 0) {
    throw new Error(
      `Cannot delete obsolete units with attached data: ${blockedUnits
        .map((unit) => unit.name)
        .join(", ")}`,
    );
  }

  if (obsoleteUnits.length === 0) {
    return {
      count: 0,
    };
  }

  return prisma.problemUnit.deleteMany({
    where: {
      id: {
        in: obsoleteUnits.map((unit) => unit.id),
      },
    },
  });
}

function getDesiredUnitIds() {
  return new Set([
    ...majorUnits.map((majorUnit) => majorUnit.id),
    ...majorUnits.flatMap((majorUnit) =>
      majorUnit.children.map((childUnit) => childUnit.id),
    ),
  ]);
}

function getLegacyTargetName(name: string) {
  const normalizedName = normalizeUnitName(name);

  return explicitLegacyUnitTargetNames.get(normalizedName) ?? normalizedName;
}

function normalizeUnitName(name: string) {
  return name
    .replace(/^(?:[IVX]+)\.\s*/i, "")
    .replace(/^\d+\.\s*/, "")
    .trim();
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  return databaseUrl;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
