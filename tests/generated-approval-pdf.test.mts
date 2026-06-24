import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument } from "pdf-lib";
import {
  getApprovalStampColumnIndex,
  getApprovalStampRowIndex,
  getFinalApprovalStampSource,
  getStampedApprovalPdfTypeLabel,
  getVisibleApprovalColumnCount,
  getVisibleApprovalRowCount,
} from "../src/lib/approval-pdf-stamp-source.ts";
import { compileDocumentTemplateContent } from "../src/lib/draft-template-content.ts";
import { createApprovalDocumentPdfBuffer } from "../src/lib/generated-approval-pdf.ts";

GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.worker.mjs",
  ),
).href;

describe("generated approval pdf", () => {
  test("uses the approval-line approver stamp for final approval PDFs", () => {
    const source = getFinalApprovalStampSource({
      approver: {
        name: "안윤숙",
        signatureImageStorageProvider: "supabase",
        signatureImageStorageKey: "signature-images/facility-head.png",
      },
    });

    assert.equal(source.name, "안윤숙");
    assert.equal(
      source.signatureImageStorageKey,
      "signature-images/facility-head.png",
    );
  });

  test("labels in-progress stamped PDFs separately from final approvals", () => {
    assert.equal(getStampedApprovalPdfTypeLabel("IN_PROGRESS"), "결재본");
    assert.equal(getStampedApprovalPdfTypeLabel("SUBMITTED"), "결재본");
    assert.equal(getStampedApprovalPdfTypeLabel("APPROVED"), "승인본");
  });

  test("places stamps by approval-line rows and columns", () => {
    const columnCount = getVisibleApprovalColumnCount(5);

    assert.equal(columnCount, 5);
    assert.equal(getApprovalStampColumnIndex(1, columnCount), 0);
    assert.equal(getApprovalStampColumnIndex(2, columnCount), 1);
    assert.equal(getApprovalStampColumnIndex(3, columnCount), 2);
    assert.equal(getApprovalStampColumnIndex(4, columnCount), 3);
    assert.equal(getApprovalStampColumnIndex(5, columnCount), 4);
    assert.equal(getApprovalStampColumnIndex(6, columnCount), 0);
    assert.equal(getApprovalStampRowIndex(1, columnCount), 0);
    assert.equal(getApprovalStampRowIndex(5, columnCount), 0);
    assert.equal(getApprovalStampRowIndex(6, columnCount), 1);
  });

  test("wraps long approval lines instead of hiding approvers", () => {
    assert.equal(getVisibleApprovalColumnCount(1), 1);
    assert.equal(getVisibleApprovalColumnCount(5), 5);
    assert.equal(getVisibleApprovalColumnCount(6), 5);
    assert.equal(getVisibleApprovalColumnCount(12), 5);
    assert.equal(getVisibleApprovalRowCount(1), 1);
    assert.equal(getVisibleApprovalRowCount(5), 1);
    assert.equal(getVisibleApprovalRowCount(6), 2);
    assert.equal(getVisibleApprovalRowCount(12), 3);
  });

  test("creates readable approval document PDF buffers", async () => {
    const buffer = await createApprovalDocumentPdfBuffer({
      documentNo: "DOC-2026-0001",
      title: "구매요청서",
      category: "구매요청서",
      content: "구매 목적과 품목을 검토해 주세요.",
      templateName: "구매요청서",
      drafter: {
        name: "김민준",
        departmentName: "운영지원팀",
        positionName: "팀장",
      },
      approvers: [
        {
          name: "박서연",
          departmentName: "운영지원팀",
          positionName: "1차 결재자",
        },
      ],
      issuedAt: new Date("2026-06-04T09:30:00+09:00"),
    });
    const pdf = await PDFDocument.load(buffer);

    assert.equal(pdf.getPageCount(), 1);
    assert.ok(buffer.byteLength > 0);
  });

  test("keeps long document titles clear of the summary section headers", async () => {
    const buffer = await createApprovalDocumentPdfBuffer({
      documentNo: "EA-2026-0006",
      title:
        "어린이급식소 3차 순회방문지도 공문 검토 요청드립니다. 관련 자료와 확인 의견을 함께 검토 부탁드립니다.",
      category: "일반 기안서",
      content:
        "대표님, 어린이급식소 3차 순회방문지도 관련 공문 이메일 수신되어 첨부하여 상신드립니다.",
      templateName: "일반 기안서",
      drafter: {
        name: "최윤서",
        departmentName: "바자울",
        positionName: "주임",
      },
      approvers: [
        {
          name: "안윤숙",
          departmentName: "바자울",
          positionName: "시설장",
        },
      ],
      issuedAt: new Date("2026-06-22T10:34:00+09:00"),
    });
    const items = await extractPdfTextItems(buffer);
    const summaryHeader = items.find((item) => item.str === "문서 정보");

    assert.ok(summaryHeader, "expected generated PDF to include 문서 정보");

    const summaryHeaderTop = summaryHeader.y + summaryHeader.height;
    const heroTitleItems = items.filter(
      (item) =>
        item.x > 70 &&
        item.x < 300 &&
        item.y > summaryHeaderTop &&
        item.y < 690,
    );
    const lowestHeroTitleBaseline = Math.min(
      ...heroTitleItems.map((item) => item.y),
    );

    assert.ok(
      heroTitleItems.length >= 2,
      "expected the long document title to wrap onto multiple lines",
    );
    assert.ok(
      lowestHeroTitleBaseline - summaryHeaderTop > 2,
      `expected title and summary header to have vertical gap, got ${
        lowestHeroTitleBaseline - summaryHeaderTop
      }`,
    );
  });

  test("keeps email request titles clear of the document info header", async () => {
    const buffer = await createApprovalDocumentPdfBuffer({
      documentNo: "EA-2026-0010",
      title: "금융결제원 안내 메일 확인 요청",
      category: "일반 기안서",
      content:
        "금융결제원 안내 메일이 수신되어 공유드립니다. 첨부된 메일 내용 확인 부탁드립니다.",
      templateName: "일반 기안서",
      drafter: {
        name: "최윤서",
        departmentName: "바자울",
        positionName: "주임",
      },
      approvers: [
        {
          name: "안윤숙",
          departmentName: "바자울",
          positionName: "시설장",
        },
      ],
      issuedAt: new Date("2026-06-24T12:09:00+09:00"),
    });
    const items = await extractPdfTextItems(buffer);
    const summaryHeader = items.find((item) => item.str === "문서 정보");
    const titleItems = items.filter((item) =>
      item.str.includes("금융결제원 안내 메일 확인 요청"),
    );

    assert.ok(summaryHeader, "expected generated PDF to include 문서 정보");
    assert.ok(titleItems.length > 0, "expected generated PDF to include title");

    const summaryHeaderTop = summaryHeader.y + summaryHeader.height;
    const lowestTitleBaseline = Math.min(...titleItems.map((item) => item.y));

    assert.ok(
      lowestTitleBaseline - summaryHeaderTop > 12,
      `expected title and document info header to have clear vertical gap, got ${
        lowestTitleBaseline - summaryHeaderTop
      }`,
    );
  });

  test("paginates long schema table values", async () => {
    const schema = {
      version: 1,
      fields: [
        {
          name: "title",
          label: "제목",
          type: "text",
          required: true,
        },
        {
          name: "content",
          label: "상세 내용",
          type: "textarea",
          required: true,
        },
      ],
    };
    const longContent = Array.from(
      { length: 90 },
      (_, index) =>
        `긴본문 ${index + 1}번째 줄입니다. PDF 표 안에서 줄바꿈과 페이지 넘김이 안정적으로 처리되어야 합니다.`,
    ).join("\n");
    const content = compileDocumentTemplateContent(schema, {
      title: "장문 문서",
      content: longContent,
    });
    const buffer = await createApprovalDocumentPdfBuffer({
      documentNo: "DOC-2026-LONG",
      title: "장문 schema 문서",
      category: "일반 기안서",
      content,
      templateName: "일반 기안서",
      templateSchema: schema,
      drafter: {
        name: "김민준",
        departmentName: "운영지원팀",
        positionName: "팀장",
      },
      approvers: [
        {
          name: "박서연",
          departmentName: "운영지원팀",
          positionName: "1차 결재자",
        },
        {
          name: "이도윤",
          departmentName: "경영지원실",
          positionName: "최종 결재자",
        },
      ],
      issuedAt: new Date("2026-06-04T09:30:00+09:00"),
    });
    const pdf = await PDFDocument.load(buffer);

    assert.ok(pdf.getPageCount() > 1);
    assert.ok(buffer.byteLength > 0);
  });
});

async function extractPdfTextItems(buffer: Uint8Array) {
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const items: Array<{
    height: number;
    str: string;
    width: number;
    x: number;
    y: number;
  }> = [];

  try {
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();

    for (const item of content.items) {
      if (!("str" in item) || !item.str) {
        continue;
      }

      items.push({
        height: item.height,
        str: item.str,
        width: item.width,
        x: item.transform[4],
        y: item.transform[5],
      });
    }
  } finally {
    await loadingTask.destroy();
  }

  return items;
}
