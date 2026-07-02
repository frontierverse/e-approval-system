import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PageSizes,
  type PDFFont,
  type PDFPage,
  rgb,
} from "pdf-lib";
import type { QuestionWorksheetPdfData } from "@/lib/question-bank";
import {
  getQuestionBankDifficultyLabel,
  getQuestionBankProblemTypeLabel,
  parseQuestionBankChoices,
} from "@/lib/question-bank-core";

const pdfKoreanFontPath = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NanumGothic-Regular.ttf",
);
const pageSize: [number, number] = [PageSizes.A4[0], PageSizes.A4[1]];
const pageMargin = 42;
const titleFontSize = 20;
const metaFontSize = 9;
const bodyFontSize = 11;
const bodyLineHeight = 17;
const answerFontSize = 9;
const answerLineHeight = 14;
const problemGap = 18;
const bodyTextColor = rgb(0.09, 0.1, 0.13);
const mutedTextColor = rgb(0.39, 0.45, 0.53);
const borderColor = rgb(0.82, 0.85, 0.9);
const accentColor = rgb(0.09, 0.36, 0.5);
const answerBackgroundColor = rgb(0.95, 0.98, 0.98);

type PdfCursor = {
  page: PDFPage;
  y: number;
};

export async function createQuestionWorksheetPdf(
  worksheet: QuestionWorksheetPdfData,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(pdfKoreanFontPath), {
    subset: false,
  });
  const cursor = createPage(pdf, font, worksheet);

  for (const problem of worksheet.problems) {
    drawProblem(pdf, font, cursor, worksheet, problem);
  }

  drawFooter(cursor.page, font, pdf.getPageCount());

  return pdf.save();
}

function drawProblem(
  pdf: PDFDocument,
  font: PDFFont,
  cursor: PdfCursor,
  worksheet: QuestionWorksheetPdfData,
  problem: QuestionWorksheetPdfData["problems"][number],
) {
  const { width } = cursor.page.getSize();
  const maxWidth = width - pageMargin * 2;
  const typeLabel = getQuestionBankProblemTypeLabel(problem.problemType);
  const difficultyLabel = getQuestionBankDifficultyLabel(problem.difficulty);
  const bodyLines = wrapPdfText(
    font,
    `${problem.order}. ${problem.body}`,
    bodyFontSize,
    maxWidth,
  );
  const choiceLines = parseQuestionBankChoices(problem.choices).flatMap(
    (choice, index) =>
      wrapPdfText(
        font,
        `${formatChoicePrefix(index)} ${choice}`,
        bodyFontSize,
        maxWidth - 18,
      ),
  );
  const answerLines = worksheet.includeAnswers
    ? [
        ...wrapPdfText(
          font,
          `정답: ${problem.answer}`,
          answerFontSize,
          maxWidth - 18,
        ),
        ...wrapPdfText(
          font,
          problem.explanation ? `해설: ${problem.explanation}` : "해설: -",
          answerFontSize,
          maxWidth - 18,
        ),
      ]
    : [];
  const problemHeight =
    bodyLines.length * bodyLineHeight +
    choiceLines.length * bodyLineHeight +
    (answerLines.length > 0 ? answerLines.length * answerLineHeight + 18 : 0) +
    problemGap +
    16;

  ensureSpace(pdf, font, cursor, worksheet, Math.min(problemHeight, 340));

  cursor.page.drawText(`${typeLabel} · ${difficultyLabel}`, {
    x: pageMargin,
    y: cursor.y,
    size: metaFontSize,
    font,
    color: accentColor,
  });
  cursor.y -= 15;

  drawTextLines(cursor, font, bodyLines, {
    fontSize: bodyFontSize,
    lineHeight: bodyLineHeight,
    pagination: {
      pdf,
      worksheet,
    },
    x: pageMargin,
  });

  if (choiceLines.length > 0) {
    cursor.y -= 2;
    drawTextLines(cursor, font, choiceLines, {
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
      pagination: {
        pdf,
        worksheet,
      },
      x: pageMargin + 18,
    });
  }

  if (answerLines.length > 0) {
    ensureSpace(
      pdf,
      font,
      cursor,
      worksheet,
      answerLines.length * answerLineHeight + 18,
    );
    const answerTop = cursor.y + 7;
    const answerHeight = answerLines.length * answerLineHeight + 11;

    cursor.page.drawRectangle({
      x: pageMargin,
      y: answerTop - answerHeight,
      width: maxWidth,
      height: answerHeight,
      color: answerBackgroundColor,
      borderColor,
      borderWidth: 0.5,
    });
    cursor.y -= 6;
    drawTextLines(cursor, font, answerLines, {
      color: mutedTextColor,
      fontSize: answerFontSize,
      lineHeight: answerLineHeight,
      x: pageMargin + 9,
    });
  }

  cursor.y -= problemGap;
}

function createPage(
  pdf: PDFDocument,
  font: PDFFont,
  worksheet: QuestionWorksheetPdfData,
): PdfCursor {
  const page = pdf.addPage(pageSize);
  const { height, width } = page.getSize();
  const unitLabel = [
    worksheet.subject,
    worksheet.gradeLevel,
    worksheet.unitName,
  ]
    .filter(Boolean)
    .join(" · ");
  const createdAt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(worksheet.createdAt);

  page.drawText(worksheet.title, {
    x: pageMargin,
    y: height - pageMargin - titleFontSize,
    size: titleFontSize,
    font,
    color: bodyTextColor,
  });
  page.drawText(
    `${unitLabel} · ${worksheet.questionCount}문항 · 생성 ${createdAt}`,
    {
      x: pageMargin,
      y: height - pageMargin - titleFontSize - 18,
      size: metaFontSize,
      font,
      color: mutedTextColor,
    },
  );
  page.drawLine({
    start: {
      x: pageMargin,
      y: height - pageMargin - titleFontSize - 31,
    },
    end: {
      x: width - pageMargin,
      y: height - pageMargin - titleFontSize - 31,
    },
    thickness: 0.8,
    color: borderColor,
  });

  return {
    page,
    y: height - pageMargin - titleFontSize - 54,
  };
}

function createContinuationPage(
  pdf: PDFDocument,
  font: PDFFont,
  worksheet: QuestionWorksheetPdfData,
): PdfCursor {
  const page = pdf.addPage(pageSize);
  const { height, width } = page.getSize();

  page.drawText(worksheet.title, {
    x: pageMargin,
    y: height - pageMargin - 12,
    size: 12,
    font,
    color: mutedTextColor,
  });
  page.drawLine({
    start: {
      x: pageMargin,
      y: height - pageMargin - 24,
    },
    end: {
      x: width - pageMargin,
      y: height - pageMargin - 24,
    },
    thickness: 0.6,
    color: borderColor,
  });

  return {
    page,
    y: height - pageMargin - 44,
  };
}

function ensureSpace(
  pdf: PDFDocument,
  font: PDFFont,
  cursor: PdfCursor,
  worksheet: QuestionWorksheetPdfData,
  requiredHeight: number,
) {
  if (cursor.y - requiredHeight >= pageMargin) {
    return;
  }

  drawFooter(cursor.page, font, pdf.getPageCount());
  const nextCursor = createContinuationPage(pdf, font, worksheet);

  cursor.page = nextCursor.page;
  cursor.y = nextCursor.y;
}

function drawTextLines(
  cursor: PdfCursor,
  font: PDFFont,
  lines: string[],
  {
    color = bodyTextColor,
    fontSize,
    lineHeight,
    pagination,
    x,
  }: {
    color?: ReturnType<typeof rgb>;
    fontSize: number;
    lineHeight: number;
    pagination?: {
      pdf: PDFDocument;
      worksheet: QuestionWorksheetPdfData;
    };
    x: number;
  },
) {
  for (const line of lines) {
    if (pagination) {
      ensureSpace(
        pagination.pdf,
        font,
        cursor,
        pagination.worksheet,
        lineHeight + 4,
      );
    }

    cursor.page.drawText(line, {
      x,
      y: cursor.y,
      size: fontSize,
      font,
      color,
    });
    cursor.y -= lineHeight;
  }
}

function drawFooter(page: PDFPage, font: PDFFont, pageNumber: number) {
  const { width } = page.getSize();
  const text = `${pageNumber}`;
  const textWidth = font.widthOfTextAtSize(text, 9);

  page.drawText(text, {
    x: (width - textWidth) / 2,
    y: 22,
    size: 9,
    font,
    color: mutedTextColor,
  });
}

function wrapPdfText(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number,
) {
  const lines: string[] = [];
  const paragraphs = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    let currentLine = "";

    for (const character of Array.from(paragraph)) {
      const candidate = `${currentLine}${character}`;

      if (
        currentLine &&
        font.widthOfTextAtSize(candidate, fontSize) > maxWidth
      ) {
        lines.push(currentLine.trimEnd());
        currentLine = character.trimStart();
      } else {
        currentLine = candidate;
      }
    }

    lines.push(currentLine.trimEnd());
  }

  return lines.length > 0 ? lines : ["-"];
}

function formatChoicePrefix(index: number) {
  return `${index + 1})`;
}
