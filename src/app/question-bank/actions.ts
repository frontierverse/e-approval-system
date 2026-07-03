"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import {
  persistAttachmentFiles,
  prepareAttachmentFiles,
  removeStoredAttachmentFiles,
} from "@/lib/attachment-storage";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createQuestionBankProblemWhere,
} from "@/lib/question-bank";
import {
  createWorksheetTitle,
  normalizeQuestionBankDifficulty,
  normalizeQuestionBankProblemType,
  normalizeQuestionBankQuestionCount,
  normalizeQuestionBankText,
  parseQuestionBankChoices,
  questionBankChoicesMaxLength,
  questionBankProblemBodyMaxLength,
  questionBankProblemExplanationMaxLength,
  questionBankUnitNameMaxLength,
  shuffleQuestionBankItems,
} from "@/lib/question-bank-core";

const questionBankPath = "/question-bank";
const questionBankPdfUploadPolicy = {
  maxFileCount: 20,
  maxFileSizeMb: 50,
  allowedExtensions: [".pdf"],
};

export async function createQuestionBankUnitAction(formData: FormData) {
  await requireUser();

  const subject = normalizeQuestionBankText(formData.get("subject"));
  const gradeLevel = nullableText(formData.get("gradeLevel"));
  const name = normalizeQuestionBankText(formData.get("name"));
  const parentId = nullableText(formData.get("parentId"));

  if (!subject) {
    redirectWithQuestionBankError("unitError", "과목을 입력하세요.");
  }

  if (!name) {
    redirectWithQuestionBankError("unitError", "단원명을 입력하세요.");
  }

  if (name.length > questionBankUnitNameMaxLength) {
    redirectWithQuestionBankError(
      "unitError",
      `단원명은 ${questionBankUnitNameMaxLength}자 이내로 입력하세요.`,
    );
  }

  const parent = parentId
    ? await prisma.problemUnit.findUnique({
        where: {
          id: parentId,
        },
        select: {
          id: true,
        },
      })
    : null;

  if (parentId && !parent) {
    redirectWithQuestionBankError("unitError", "상위 단원을 다시 선택하세요.");
  }

  const existingUnit = await prisma.problemUnit.findFirst({
    where: {
      subject,
      gradeLevel,
      name,
      parentId,
    },
    select: {
      id: true,
    },
  });

  if (existingUnit) {
    redirectWithQuestionBankError("unitError", "이미 등록된 단원입니다.");
  }

  await prisma.problemUnit.create({
    data: {
      subject,
      gradeLevel,
      name,
      parentId,
    },
  });

  revalidatePath(questionBankPath);
  redirect(questionBankPath);
}

export async function createQuestionBankProblemAction(formData: FormData) {
  await requireUser();

  const unitId = normalizeQuestionBankText(formData.get("unitId"));
  const body = normalizeQuestionBankText(formData.get("body"));
  const choices = normalizeQuestionBankText(formData.get("choices"));
  const answer = normalizeQuestionBankText(formData.get("answer"));
  const explanation = normalizeQuestionBankText(formData.get("explanation"));
  const difficulty = normalizeQuestionBankDifficulty(formData.get("difficulty"));
  const problemType = normalizeQuestionBankProblemType(
    formData.get("problemType"),
  );

  const unit = unitId
    ? await prisma.problemUnit.findUnique({
        where: {
          id: unitId,
        },
        select: {
          id: true,
          subject: true,
          gradeLevel: true,
        },
      })
    : null;

  if (!unit) {
    redirectWithQuestionBankError("problemError", "단원을 선택하세요.");
  }

  if (!body) {
    redirectWithQuestionBankError("problemError", "문제 내용을 입력하세요.");
  }

  if (body.length > questionBankProblemBodyMaxLength) {
    redirectWithQuestionBankError(
      "problemError",
      `문제 내용은 ${questionBankProblemBodyMaxLength}자 이내로 입력하세요.`,
    );
  }

  if (problemType === "multiple-choice" && parseQuestionBankChoices(choices).length < 2) {
    redirectWithQuestionBankError(
      "problemError",
      "객관식 문제는 보기를 2개 이상 입력하세요.",
    );
  }

  if (choices.length > questionBankChoicesMaxLength) {
    redirectWithQuestionBankError(
      "problemError",
      `보기는 ${questionBankChoicesMaxLength}자 이내로 입력하세요.`,
    );
  }

  if (!answer) {
    redirectWithQuestionBankError("problemError", "정답을 입력하세요.");
  }

  if (explanation.length > questionBankProblemExplanationMaxLength) {
    redirectWithQuestionBankError(
      "problemError",
      `해설은 ${questionBankProblemExplanationMaxLength}자 이내로 입력하세요.`,
    );
  }

  await prisma.questionBankProblem.create({
    data: {
      subject: unit.subject,
      gradeLevel: unit.gradeLevel,
      unitId: unit.id,
      body,
      choices: choices || null,
      answer,
      explanation: explanation || null,
      difficulty,
      problemType,
    },
  });

  revalidatePath(questionBankPath);
  redirect(questionBankPath);
}

export async function uploadQuestionBankPdfAction(formData: FormData) {
  const user = await requireUser();
  const unitId = normalizeQuestionBankText(formData.get("unitId"));
  const title = normalizeQuestionBankText(formData.get("title"));
  const description = normalizeQuestionBankText(formData.get("description"));
  const unit = unitId
    ? await prisma.problemUnit.findUnique({
        where: {
          id: unitId,
        },
        select: {
          id: true,
          parentId: true,
        },
      })
    : null;

  if (!unit) {
    redirectWithQuestionBankError("pdfError", "중단원을 선택하세요.");
  }

  if (!unit.parentId) {
    redirectWithQuestionBankError(
      "pdfError",
      "PDF 문제지는 대단원이 아니라 중단원에 업로드하세요.",
    );
  }

  const attachmentResult = await prepareAttachmentFiles(
    formData.getAll("pdfFiles"),
    questionBankPdfUploadPolicy,
    {
      storageKeyPrefix: "question-bank/",
    },
  );

  if (attachmentResult.error) {
    redirectWithQuestionBankError("pdfError", attachmentResult.error);
  }

  if (attachmentResult.files.length === 0) {
    redirectWithQuestionBankError("pdfError", "업로드할 PDF 파일을 선택하세요.");
  }

  try {
    await persistAttachmentFiles(attachmentResult.files);

    await prisma.questionBankPdf.createMany({
      data: attachmentResult.files.map((file) => ({
        title: title || createTitleFromFileName(file.originalName),
        description: description || null,
        originalName: file.originalName,
        storageProvider: file.storageProvider,
        storageKey: file.storageKey,
        mimeType: file.mimeType || "application/pdf",
        size: file.size,
        unitId: unit.id,
        uploadedById: user.id,
      })),
    });
  } catch {
    await removeStoredAttachmentFiles(
      attachmentResult.files.map((file) => ({
        storageProvider: file.storageProvider,
        storageKey: file.storageKey,
      })),
    ).catch(() => undefined);

    redirectWithQuestionBankError(
      "pdfError",
      "PDF 업로드 중 문제가 발생했습니다. 다시 시도하세요.",
    );
  }

  revalidatePath(questionBankPath);
  redirect(questionBankPath);
}

export async function deleteQuestionBankPdfAction(pdfId: string) {
  const user = await requireUser();
  const pdf = await prisma.questionBankPdf.findUnique({
    where: {
      id: pdfId,
    },
    select: {
      id: true,
      storageProvider: true,
      storageKey: true,
      uploadedById: true,
    },
  });

  if (!pdf) {
    redirectWithQuestionBankError("pdfError", "삭제할 PDF를 찾을 수 없습니다.");
  }

  if (pdf.uploadedById !== user.id && user.role !== UserRole.ADMIN) {
    redirectWithQuestionBankError("pdfError", "PDF를 삭제할 권한이 없습니다.");
  }

  await prisma.questionBankPdf.delete({
    where: {
      id: pdf.id,
    },
  });
  await removeStoredAttachmentFiles([
    {
      storageProvider: pdf.storageProvider,
      storageKey: pdf.storageKey,
    },
  ]).catch(() => undefined);

  revalidatePath(questionBankPath);
  redirect(`${questionBankPath}?tab=archive`);
}

export async function createQuestionWorksheetAction(formData: FormData) {
  const user = await requireUser();
  const unitId = normalizeQuestionBankText(formData.get("unitId"));
  const questionCount = normalizeQuestionBankQuestionCount(
    formData.get("questionCount"),
  );
  const difficulty = formData.get("difficulty");
  const problemType = formData.get("problemType");
  const includeAnswers = formData.get("includeAnswers") === "on";

  const unit = unitId
    ? await prisma.problemUnit.findUnique({
        where: {
          id: unitId,
        },
        select: {
          id: true,
          subject: true,
          gradeLevel: true,
          name: true,
        },
      })
    : null;

  if (!unit) {
    redirectWithQuestionBankError("worksheetError", "단원을 선택하세요.");
  }

  const problems = await prisma.questionBankProblem.findMany({
    where: createQuestionBankProblemWhere({
      difficulty,
      problemType,
      unitId: unit.id,
    }),
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
    },
  });

  if (problems.length < questionCount) {
    redirectWithQuestionBankError(
      "worksheetError",
      `조건에 맞는 문제가 ${problems.length}개입니다. 문제 수를 줄이거나 조건을 바꿔주세요.`,
    );
  }

  const seed = randomUUID();
  const selectedProblems = shuffleQuestionBankItems(problems, seed).slice(
    0,
    questionCount,
  );
  const worksheet = await prisma.worksheetGeneration.create({
    data: {
      title: createWorksheetTitle({
        title: normalizeQuestionBankText(formData.get("title")),
        unitName: unit.name,
      }),
      subject: unit.subject,
      gradeLevel: unit.gradeLevel,
      unitId: unit.id,
      questionCount: selectedProblems.length,
      seed,
      includeAnswers,
      createdById: user.id,
      items: {
        create: selectedProblems.map((problem, index) => ({
          order: index + 1,
          problemId: problem.id,
        })),
      },
    },
    select: {
      id: true,
    },
  });

  revalidatePath(questionBankPath);
  redirect(`/question-bank/worksheets/${worksheet.id}/print`);
}

function nullableText(value: FormDataEntryValue | null) {
  return normalizeQuestionBankText(value) || null;
}

function createTitleFromFileName(fileName: string) {
  const title = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();

  return title || "PDF 문제지";
}

function redirectWithQuestionBankError(name: string, message: string): never {
  redirect(`${questionBankPath}?${name}=${encodeURIComponent(message)}`);
}
