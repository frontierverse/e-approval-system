import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFRawStream,
} from "pdf-lib";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { compileDocumentTemplateContent } from "../src/lib/draft-template-content.ts";
import { createApprovalDocumentPdfBuffer } from "../src/lib/generated-approval-pdf.ts";

GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

const templates = [
  { name: "일반 기안서", header: "사내 전자결재 문서" },
  { name: "지출결의서", header: "지출결의 전자문서" },
  { name: "휴가신청서", header: "휴가신청 전자문서" },
  { name: "구매요청서", header: "구매요청 전자문서" },
  { name: "회의록", header: "회의록" },
];

const baseInput = {
  documentNo: "PRINT-001",
  title: "흑백 인쇄 확인 문서",
  category: "일반 기안서",
  content: "본문과 결재 정보를 흰 종이에 선명하게 인쇄합니다.",
  drafter: { name: "김기안", departmentName: "운영팀", positionName: "담당" },
  approvers: [
    { name: "이결재", departmentName: "운영팀", positionName: "팀장" },
    { name: "박승인", departmentName: "지원팀", positionName: "시설장" },
  ],
  issuedAt: new Date("2026-09-14T09:30:00+09:00"),
};

describe("generated approval PDF print output", () => {
  for (const template of templates) {
    test(`${template.name} uses white surfaces and visible black text without color ink`, async () => {
      const buffer = await createApprovalDocumentPdfBuffer({
        ...baseInput,
        templateName: template.name,
      });
      const pages = await inspectPrintOutput(buffer);

      assert.equal(pages.length, 1);
      assert.ok(pages[0].includes(template.header), "the header must remain readable");
      assert.ok(pages[0].includes(baseInput.documentNo), "the document number must remain readable");
      assert.ok(pages[0].includes(baseInput.title), "the document title must remain readable");
      assert.ok(pages[0].includes("김기안"), "the drafter must remain readable");
      assert.ok(pages[0].includes("이결재"), "the approval line must remain readable");
    });
  }

  for (const template of templates) {
    test(`${template.name} keeps structured table continuation pages print friendly`, async () => {
      const schema = {
        version: 1,
        fields: [
          { name: "title", label: "제목", type: "text", required: true },
          { name: "content", label: "상세 내용", type: "textarea", required: true },
        ],
      };
      const longContent = [
        ...Array.from({ length: 80 }, (_, index) => `인쇄 점검 ${index + 1}번째 줄입니다. 표의 배경과 글자를 확인합니다.`),
        "마지막 본문 확인 완료",
      ].join("\n");
      const documentNo = "EA-2026-0123";
      const buffer = await createApprovalDocumentPdfBuffer({
        ...baseInput,
        documentNo,
        templateName: template.name,
        templateSchema: schema,
        content: compileDocumentTemplateContent(schema, {
          title: baseInput.title,
          content: longContent,
        }),
      });
      const pages = await inspectPrintOutput(buffer, template.name === "회의록" ? undefined : documentNo);

      assert.ok(pages.length > 1, "the fixture must exercise continuation pages");
      assert.ok(pages[0].includes(template.header), "the first-page header must remain readable");
      assert.ok(pages[0].includes("상세 내용"), "the table label must remain readable");
      assert.ok(pages.at(-1)?.includes("마지막 본문 확인 완료"), "the final content must survive pagination");

      if (template.name !== "회의록") {
        for (const [index, text] of pages.entries()) {
          assert.ok(text.includes(documentNo), `page ${index + 1} must show the document number`);
          if (index > 0) {
            assert.ok(text.includes(`${template.header} 계속`), `page ${index + 1} must show the continuation header`);
          }
        }
      }
    });
  }
});

async function inspectPrintOutput(buffer: Uint8Array, headerDocumentNo?: string) {
  const pdf = await PDFDocument.load(buffer);
  for (const [index, page] of pdf.getPages().entries()) {
    const contents = page.node.Contents();
    assert.ok(contents, `page ${index + 1} must have content`);
    const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
    const operators = streams.map((entry) => {
      const stream = pdf.context.lookup(entry);
      assert.ok(stream instanceof PDFRawStream, "expected a generated PDF content stream");
      return Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
    }).join("\n");
    assertPrintOperators(operators, index + 1);
  }

  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  try {
    const readablePdf = await loadingTask.promise;
    const pages: string[] = [];
    for (let number = 1; number <= readablePdf.numPages; number++) {
      const page = await readablePdf.getPage(number);
      const content = await page.getTextContent();
      pages.push(content.items.flatMap((item) => "str" in item ? [item.str] : []).join(" "));
      if (headerDocumentNo) {
        const labels = content.items.filter((item) => "str" in item && item.str === "문서번호");
        const label = labels.filter((item) => "transform" in item)
          .sort((left, right) => right.transform[5] - left.transform[5])[0];
        assert.ok(label, `page ${number} must have a document number label`);
        const value = content.items.find((item) =>
          "str" in item && item.str.includes(headerDocumentNo) &&
          Math.abs(item.transform[5] - label.transform[5]) < 1,
        );
        assert.ok(value && "transform" in value, `page ${number} must have a readable document number in its header`);
        const gap = value.transform[4] - (label.transform[4] + label.width);
        assert.ok(gap >= 4, `page ${number}: header label and value need a visible gap, got ${gap.toFixed(2)}pt`);
      }
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

function assertPrintOperators(content: string, pageNumber: number) {
  // pdf-lib writes one operator per line. Follow PDF graphics-state scopes so
  // white background fills cannot mask white-on-white text regressions.
  const colorOperators = new Set(["rg", "RG", "k", "K", "cs", "CS", "sc", "SC", "scn", "SCN"]);
  const fillOperators = new Set(["f", "F", "f*", "B", "B*", "b", "b*"]);
  const grayStack: number[] = [];
  let fillGray = 0;
  let textCount = 0;

  for (const line of content.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    const operator = parts.at(-1);
    if (!operator) continue;

    assert.ok(!colorOperators.has(operator), `page ${pageNumber}: ${operator} must use DeviceGray instead`);
    if (operator === "q") grayStack.push(fillGray);
    if (operator === "Q") {
      assert.ok(grayStack.length > 0, "graphics-state restore must have a matching save");
      fillGray = grayStack.pop()!;
    }
    if (operator === "g") fillGray = Number(parts[0]);
    if (fillOperators.has(operator)) {
      assert.equal(fillGray, 1, `page ${pageNumber}: filled backgrounds must be white`);
    }
    if (operator === "Tj" || operator === "TJ" || operator === "'" || operator === '"') {
      assert.equal(fillGray, 0, `page ${pageNumber}: text must print in black, including header metadata`);
      textCount++;
    }
  }

  assert.equal(grayStack.length, 0, "graphics-state scopes must be balanced");
  assert.ok(textCount > 0, `page ${pageNumber} must contain visible text`);
}
