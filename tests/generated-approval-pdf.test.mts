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
import { getMeetingMinutesDocumentTemplateSchema } from "../src/lib/document-template-schema.ts";
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

  test("renders meeting minutes with the paper form design", async () => {
    const schema = getMeetingMinutesDocumentTemplateSchema();
    const content = compileDocumentTemplateContent(schema, {
      meetingTitle: "주간 운영회의(시설 운영 및 생활지도 방향 논의)",
      meetingDate: "2026-07-13",
      location: "바자울청소년회복지원시설",
      attendees: "안윤숙, 박재숙, 심태호, 최윤서 (총 4명)",
      host: "안윤숙 시설장",
      agenda: "1. 시설 주간 일정 및 업무 운영 계획 공유\n2. 입소 청소년 프로그램 운영",
      discussion:
        "안건 1. 시설 주간 일정 및 업무 운영 계획 공유\n 논의 내용\n  - 7월 16일부터 아동돌봄도시락 사업 운영 시작 예정.",
      specialNotes: "무더위에 따른 급식 위생관리 강화.",
      followUpSchedule: "차기 주간회의 실시.(2026.07.20.)",
    });
    const buffer = await createApprovalDocumentPdfBuffer({
      documentNo: "EA-2026-0100",
      title: "7월 13일 회의록",
      category: "회의록",
      content,
      templateName: "회의록",
      templateSchema: schema,
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
      issuedAt: new Date("2026-07-13T18:00:00+09:00"),
    });
    const items = await extractPdfTextItems(buffer);
    const texts = items.map((item) => item.str);
    const joined = texts.join(" ");

    const title = items.find((item) => item.str === "회의록");
    assert.ok(title, "expected the centered 회의록 title");

    for (const label of [
      "회의제목",
      "일시",
      "장소",
      "참석자",
      "회의 주최자",
      "안건",
      "논의 내용",
      "특이사항",
      "추후 일정",
    ]) {
      assert.ok(
        texts.includes(label),
        `expected meeting minutes PDF to include the ${label} label`,
      );
    }

    assert.ok(
      joined.includes("2026.07.13.(월)"),
      "expected the meeting date formatted like the paper form",
    );
    assert.ok(
      joined.includes("작성자: 최윤서"),
      "expected the drafter as 작성자 below the table",
    );
    assert.ok(
      !joined.includes("사내 전자결재 문서") &&
        !joined.includes("문서 정보") &&
        !joined.includes("결재란"),
      "expected meeting minutes PDF to drop the electronic approval frame",
    );

    const agendaHeading = items.find((item) =>
      item.str.startsWith("안건 1. 시설 주간 일정"),
    );
    const normalLine = items.find((item) =>
      item.str.includes("7월 16일부터 아동돌봄도시락"),
    );

    assert.ok(agendaHeading, "expected the 안건 heading line in 논의 내용");
    assert.ok(normalLine, "expected a normal discussion line");
    assert.ok(
      agendaHeading.height > normalLine.height,
      `expected 안건 headings to use a larger font, got ${agendaHeading.height} vs ${normalLine.height}`,
    );
  });

  test("paginates long meeting minutes discussions", async () => {
    const schema = getMeetingMinutesDocumentTemplateSchema();
    const longDiscussion = Array.from(
      { length: 80 },
      (_, index) =>
        `안건 ${index + 1}. 논의 내용과 결정 사항이 길게 이어지는 회의 기록입니다.`,
    ).join("\n");
    const content = compileDocumentTemplateContent(schema, {
      meetingTitle: "장시간 운영회의",
      meetingDate: "2026-07-13",
      location: "바자울청소년회복지원시설",
      attendees: "안윤숙 외 3명",
      host: "안윤숙 시설장",
      agenda: "1. 장기 안건",
      discussion: longDiscussion,
      specialNotes: "",
      followUpSchedule: "",
    });
    const buffer = await createApprovalDocumentPdfBuffer({
      documentNo: "EA-2026-0101",
      title: "장시간 회의록",
      category: "회의록",
      content,
      templateName: "회의록",
      templateSchema: schema,
      drafter: {
        name: "최윤서",
        departmentName: "바자울",
        positionName: "주임",
      },
      approvers: [],
      issuedAt: new Date("2026-07-13T18:00:00+09:00"),
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
