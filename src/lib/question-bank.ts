import "server-only";

import { prisma } from "@/lib/prisma";
import {
  getQuestionBankDifficultyLabel,
  getQuestionBankProblemTypeLabel,
  normalizeQuestionBankDifficultyFilter,
  normalizeQuestionBankProblemType,
  normalizeQuestionBankProblemTypeFilter,
  type QuestionBankDifficultyFilter,
  type QuestionBankProblemTypeFilter,
} from "@/lib/question-bank-core";

export type QuestionBankUnitListItem = {
  id: string;
  subject: string;
  gradeLevel: string | null;
  name: string;
  parentId: string | null;
  pdfCount: number;
  problemCount: number;
};

export type QuestionBankProblemListItem = {
  id: string;
  subject: string;
  gradeLevel: string | null;
  unitName: string;
  body: string;
  choices: string | null;
  answer: string;
  explanation: string | null;
  difficulty: number;
  difficultyLabel: string;
  problemType: string;
  problemTypeLabel: string;
  createdAt: string;
};

export type QuestionBankWorksheetListItem = {
  id: string;
  title: string;
  subject: string;
  gradeLevel: string | null;
  unitName: string;
  questionCount: number;
  includeAnswers: boolean;
  createdAt: string;
  createdByName: string | null;
};

export type QuestionBankPdfListItem = {
  id: string;
  title: string;
  description: string | null;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  unitId: string;
  unitName: string;
  parentUnitName: string | null;
  subject: string;
  gradeLevel: string | null;
  uploadedByName: string | null;
};

export type QuestionBankPdfFileRecord = {
  id: string;
  title: string;
  originalName: string;
  storageProvider: string;
  storageKey: string;
  mimeType: string;
  size: number;
};

export type QuestionWorksheetPdfData = {
  id: string;
  title: string;
  subject: string;
  gradeLevel: string | null;
  unitName: string;
  questionCount: number;
  includeAnswers: boolean;
  createdAt: Date;
  problems: QuestionWorksheetPdfProblem[];
};

export type QuestionWorksheetPdfProblem = {
  order: number;
  body: string;
  choices: string | null;
  answer: string;
  explanation: string | null;
  difficulty: number;
  problemType: string;
};

export async function getQuestionBankDashboard() {
  const [units, recentPdfs] = await Promise.all([
    getQuestionBankUnits(),
    getRecentQuestionBankPdfs(),
  ]);

  return {
    recentPdfs,
    units,
  };
}

export async function getQuestionBankUnits(): Promise<
  QuestionBankUnitListItem[]
> {
  const units = await prisma.problemUnit.findMany({
    orderBy: [
      {
        subject: "asc",
      },
      {
        gradeLevel: "asc",
      },
      {
        sortOrder: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
    select: {
      id: true,
      subject: true,
      gradeLevel: true,
      name: true,
      parentId: true,
      _count: {
        select: {
          problems: true,
          pdfs: true,
        },
      },
    },
  });

  return units.map((unit) => ({
    id: unit.id,
    subject: unit.subject,
    gradeLevel: unit.gradeLevel,
    name: unit.name,
    parentId: unit.parentId,
    pdfCount: unit._count.pdfs,
    problemCount: unit._count.problems,
  }));
}

export async function getRecentQuestionBankPdfs(): Promise<
  QuestionBankPdfListItem[]
> {
  const pdfs = await prisma.questionBankPdf.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 30,
    select: {
      id: true,
      title: true,
      description: true,
      originalName: true,
      mimeType: true,
      size: true,
      createdAt: true,
      unit: {
        select: {
          id: true,
          name: true,
          subject: true,
          gradeLevel: true,
          parent: {
            select: {
              name: true,
            },
          },
        },
      },
      uploadedBy: {
        select: {
          name: true,
        },
      },
    },
  });

  return pdfs.map((pdf) => ({
    id: pdf.id,
    title: pdf.title,
    description: pdf.description,
    originalName: pdf.originalName,
    mimeType: pdf.mimeType,
    size: pdf.size,
    createdAt: pdf.createdAt.toISOString(),
    unitId: pdf.unit.id,
    unitName: pdf.unit.name,
    parentUnitName: pdf.unit.parent?.name ?? null,
    subject: pdf.unit.subject,
    gradeLevel: pdf.unit.gradeLevel,
    uploadedByName: pdf.uploadedBy?.name ?? null,
  }));
}

export async function findQuestionBankPdfFile(
  pdfId: string,
): Promise<QuestionBankPdfFileRecord | null> {
  return prisma.questionBankPdf.findUnique({
    where: {
      id: pdfId,
    },
    select: {
      id: true,
      title: true,
      originalName: true,
      storageProvider: true,
      storageKey: true,
      mimeType: true,
      size: true,
    },
  });
}

export async function getRecentQuestionBankProblems(): Promise<
  QuestionBankProblemListItem[]
> {
  const problems = await prisma.questionBankProblem.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 12,
    select: {
      id: true,
      subject: true,
      gradeLevel: true,
      body: true,
      choices: true,
      answer: true,
      explanation: true,
      difficulty: true,
      problemType: true,
      createdAt: true,
      unit: {
        select: {
          name: true,
        },
      },
    },
  });

  return problems.map((problem) => ({
    id: problem.id,
    subject: problem.subject,
    gradeLevel: problem.gradeLevel,
    unitName: problem.unit.name,
    body: problem.body,
    choices: problem.choices,
    answer: problem.answer,
    explanation: problem.explanation,
    difficulty: problem.difficulty,
    difficultyLabel: getQuestionBankDifficultyLabel(problem.difficulty),
    problemType: problem.problemType,
    problemTypeLabel: getQuestionBankProblemTypeLabel(problem.problemType),
    createdAt: problem.createdAt.toISOString(),
  }));
}

export async function getRecentQuestionBankWorksheets(): Promise<
  QuestionBankWorksheetListItem[]
> {
  const worksheets = await prisma.worksheetGeneration.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 10,
    select: {
      id: true,
      title: true,
      subject: true,
      gradeLevel: true,
      questionCount: true,
      includeAnswers: true,
      createdAt: true,
      unit: {
        select: {
          name: true,
        },
      },
      createdBy: {
        select: {
          name: true,
        },
      },
    },
  });

  return worksheets.map((worksheet) => ({
    id: worksheet.id,
    title: worksheet.title,
    subject: worksheet.subject,
    gradeLevel: worksheet.gradeLevel,
    unitName: worksheet.unit.name,
    questionCount: worksheet.questionCount,
    includeAnswers: worksheet.includeAnswers,
    createdAt: worksheet.createdAt.toISOString(),
    createdByName: worksheet.createdBy?.name ?? null,
  }));
}

export async function findQuestionWorksheetPdfData(
  worksheetId: string,
): Promise<QuestionWorksheetPdfData | null> {
  const worksheet = await prisma.worksheetGeneration.findUnique({
    where: {
      id: worksheetId,
    },
    select: {
      id: true,
      title: true,
      subject: true,
      gradeLevel: true,
      questionCount: true,
      includeAnswers: true,
      createdAt: true,
      unit: {
        select: {
          name: true,
        },
      },
      items: {
        orderBy: {
          order: "asc",
        },
        select: {
          order: true,
          problem: {
            select: {
              body: true,
              choices: true,
              answer: true,
              explanation: true,
              difficulty: true,
              problemType: true,
            },
          },
        },
      },
    },
  });

  if (!worksheet) {
    return null;
  }

  return {
    id: worksheet.id,
    title: worksheet.title,
    subject: worksheet.subject,
    gradeLevel: worksheet.gradeLevel,
    unitName: worksheet.unit.name,
    questionCount: worksheet.questionCount,
    includeAnswers: worksheet.includeAnswers,
    createdAt: worksheet.createdAt,
    problems: worksheet.items.map((item) => ({
      order: item.order,
      body: item.problem.body,
      choices: item.problem.choices,
      answer: item.problem.answer,
      explanation: item.problem.explanation,
      difficulty: item.problem.difficulty,
      problemType: item.problem.problemType,
    })),
  };
}

export function createQuestionBankProblemWhere({
  difficulty,
  problemType,
  unitId,
}: {
  difficulty: QuestionBankDifficultyFilter | unknown;
  problemType: QuestionBankProblemTypeFilter | unknown;
  unitId: string;
}) {
  const normalizedDifficulty = normalizeQuestionBankDifficultyFilter(difficulty);
  const normalizedProblemType =
    normalizeQuestionBankProblemTypeFilter(problemType);

  return {
    unitId,
    isActive: true,
    ...(normalizedDifficulty === "all"
      ? {}
      : {
          difficulty: normalizedDifficulty,
        }),
    ...(normalizedProblemType === "all"
      ? {}
      : {
          problemType: normalizeQuestionBankProblemType(normalizedProblemType),
        }),
  };
}
