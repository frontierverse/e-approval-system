import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import { PDFDocument } from "pdf-lib";
import ts from "typescript";

// Exercise the real PDF stamp renderer and attachment orchestration. Only database,
// storage, request context, and source synchronization are replaced; no network is used.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const sourcePdf = await PDFDocument.create();
sourcePdf.addPage([595.28, 841.89]);
const sourceBuffer = Buffer.from(await sourcePdf.save());

const harness = {
  document: {} as Row,
  attachments: [] as Row[],
  audits: [] as Row[],
  files: new Map<string, Buffer>(),
  persistedKeys: [] as string[],
  removedKeys: [] as string[],
  sourceCalls: [] as string[][],
  currentSourceId: "source",
  locks: 0,
  creates: 0,
  rollbacks: 0,
  afterPersist: null as (() => Promise<void> | void) | null,
};

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((condition: Row) => matches(row, condition));
    if (value && typeof value === "object") {
      if ("in" in value) return value.in.includes(row[key]);
      if ("path" in value) {
        return value.path.reduce((nested: Row | undefined, part: string) => nested?.[part], row[key]) === value.equals;
      }
    }
    return row[key] === value;
  });
}

let transactionTail: Promise<unknown> = Promise.resolve();
const memoryPrisma = {
  approvalDocument: {
    async findUnique({ where }: Row) {
      return where.id === harness.document.id ? structuredClone(harness.document) : null;
    },
  },
  attachment: {
    async findFirst({ where, orderBy }: Row) {
      const rows = harness.attachments.filter((row) => matches(row, where));
      if (orderBy?.createdAt === "desc") rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      return rows[0] ? structuredClone(rows[0]) : null;
    },
    async update({ where, data }: Row) {
      const row = harness.attachments.find((attachment) => attachment.id === where.id);
      assert.ok(row, "updated stamped attachment must already exist");
      Object.assign(row, structuredClone(data));
      return { id: row.id };
    },
    async create({ data }: Row) {
      const row = { ...structuredClone(data), id: `new-stamp-${++harness.creates}`, createdAt: new Date() };
      harness.attachments.push(row);
      return { id: row.id };
    },
  },
  auditLog: {
    async findMany({ where }: Row) {
      return structuredClone(harness.audits.filter((row) => matches(row, where)));
    },
    async create({ data }: Row) {
      harness.audits.push(structuredClone(data));
    },
  },
  async $queryRaw(query: { text: string; values: unknown[] }) {
    assert.match(query.text, /ApprovalDocument.*FOR UPDATE/s);
    assert.deepEqual(query.values, [harness.document.id]);
    harness.locks++;
    return [{ id: harness.document.id }];
  },
  async $transaction(operation: (tx: Row) => Promise<unknown>) {
    const previous = transactionTail;
    let release!: () => void;
    transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const snapshot = structuredClone({ attachments: harness.attachments, audits: harness.audits });
    try {
      return await operation(memoryPrisma);
    } catch (error) {
      Object.assign(harness, snapshot);
      harness.rollbacks++;
      throw error;
    } finally {
      release();
    }
  },
};

const harnessKey = "__stampedApprovalPdfRefreshHarness";
(globalThis as Row)[harnessKey] = {
  prisma: memoryPrisma,
  async syncGeneratedApprovalPdf(documentId: string, actorId: string) {
    harness.sourceCalls.push([documentId, actorId]);
    return structuredClone(harness.attachments.find((row) => row.id === "source"));
  },
  async findCurrentGeneratedApprovalPdfAttachment(db: Row, documentId: string) {
    assert.equal(db, memoryPrisma);
    assert.equal(documentId, harness.document.id);
    return structuredClone(harness.attachments.find((row) => row.id === harness.currentSourceId) ?? null);
  },
  async readStoredAttachmentFile({ storageKey }: Row) {
    const buffer = harness.files.get(storageKey);
    assert.ok(buffer, "stamp source must exist in storage");
    return { body: new ReadableStream({ start(controller) { controller.enqueue(buffer); controller.close(); } }) };
  },
  async persistAttachmentFiles(files: Row[]) {
    for (const file of files) {
      harness.files.set(file.storageKey, Buffer.from(file.buffer));
      harness.persistedKeys.push(file.storageKey);
    }
    await harness.afterPersist?.();
  },
  async removeStoredAttachmentFiles(files: Row[]) {
    for (const file of files) {
      harness.files.delete(file.storageKey);
      harness.removedKeys.push(file.storageKey);
    }
  },
};

function moduleUrl(source: string) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const effects = moduleUrl(`
  const harness = globalThis.${harnessKey};
  export const prisma = harness.prisma;
  export const syncGeneratedApprovalPdf = harness.syncGeneratedApprovalPdf;
  export const findCurrentGeneratedApprovalPdfAttachment = harness.findCurrentGeneratedApprovalPdfAttachment;
  export const readStoredAttachmentFile = harness.readStoredAttachmentFile;
  export const persistAttachmentFiles = harness.persistAttachmentFiles;
  export const removeStoredAttachmentFiles = harness.removeStoredAttachmentFiles;
  export const generatedApprovalPdfStorageSegment = "generated-approval/";
  export function getAttachmentStorageConfig() { return { ok: true, provider: "LOCAL" }; }
  export function getAttachmentStorageKeyPrefix() { return "test/"; }
  export async function getCurrentAuditLogRequestData() { return {}; }
  export const ApprovalStepStatus = { APPROVED: "APPROVED" };
  export const AuditAction = { UPDATE_DRAFT: "UPDATE_DRAFT" };
  export const DocumentStatus = { SUBMITTED: "SUBMITTED", IN_PROGRESS: "IN_PROGRESS", APPROVED: "APPROVED" };
  export const Prisma = { sql: (strings, ...values) => ({ text: strings.join("?"), values }) };
`);
let source = readFileSync(new URL("../src/lib/generated-approval-pdf.ts", import.meta.url), "utf8");
const aliases = {
  "@/lib/attachment-storage": effects,
  "@/lib/attachment-storage-core": effects,
  "@/lib/audit-log-request": effects,
  "@/lib/prisma": effects,
  "@/lib/generated-approval-pdf-attachments": effects,
  "@/generated/prisma/client": effects,
  "@pdf-lib/fontkit": import.meta.resolve("@pdf-lib/fontkit"),
  "pdf-lib": import.meta.resolve("pdf-lib"),
};
for (const [specifier, replacement] of Object.entries(aliases)) source = source.replaceAll(`"${specifier}"`, JSON.stringify(replacement));
const { attachStampedApprovalPdfToDocument, createStampedApprovalPdfOriginalName } = await import(moduleUrl(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText));

function signedAttachment(id: string, originalName: string) {
  return {
    id, originalName, documentId: "document", signedSourceAttachmentId: "source",
    signedById: "previous-approver", signedAt: new Date("2026-09-12T01:00:00Z"),
    storageProvider: "LOCAL", storageKey: `${id}.pdf`, mimeType: "application/pdf", size: 7,
    createdAt: new Date(id === "manual" ? "2026-09-13T01:00:00Z" : "2026-09-12T01:00:00Z"),
  };
}

function addAttachment(attachment: Row) {
  harness.attachments.push(attachment);
  harness.files.set(attachment.storageKey, Buffer.from(`old:${attachment.id}`));
  return attachment;
}

function autoAudit(targetId: string, metadata: Row = { generatedApprovalPdfType: "IN_PROGRESS" }) {
  return { documentId: "document", action: "UPDATE_DRAFT", targetType: "Attachment", targetId, metadata };
}

function currentName() {
  return createStampedApprovalPdfOriginalName(harness.document.documentNo, harness.document.title, harness.document.status);
}

beforeEach(() => {
  Object.assign(harness, {
    document: {
      id: "document", documentNo: "2026-100", title: "재요청한 문서", status: "APPROVED",
      updatedAt: new Date("2026-09-14T01:00:00Z"), drafterId: "drafter", template: { name: "일반 기안" },
      approvalSteps: [{ order: 1, status: "APPROVED", approver: { name: "결재자" } }],
    },
    attachments: [{
      id: "source", documentId: "document", originalName: "전자결재_원본문서_이전제목.pdf",
      signedSourceAttachmentId: null, storageProvider: "LOCAL", storageKey: "source.pdf",
      createdAt: new Date("2026-09-10T01:00:00Z"),
    }],
    audits: [], files: new Map([["source.pdf", sourceBuffer]]), persistedKeys: [], removedKeys: [],
    sourceCalls: [], currentSourceId: "source", locks: 0, creates: 0, rollbacks: 0, afterPersist: null,
  });
  transactionTail = Promise.resolve();
});
after(() => { delete (globalThis as Row)[harnessKey]; });

describe("automatic stamped approval PDF refresh", () => {
  for (const identity of ["metadata", "legacy audit message"] as const) {
    test(`uses ${identity} target IDs across title changes and preserves a same-name manual signed file`, async () => {
      const previous = addAttachment(signedAttachment("automatic", "전자결재_결재본_2026-100_이전제목.pdf"));
      const manual = structuredClone(addAttachment(signedAttachment("manual", currentName())));
      harness.audits.push(identity === "metadata"
        ? autoAudit(previous.id)
        : { ...autoAudit(previous.id, {}), message: "결재본 PDF를 자동 갱신했습니다." });

      assert.deepEqual(await attachStampedApprovalPdfToDocument("document", "approver"), { id: previous.id });
      assert.equal(harness.attachments.length, 3);
      assert.equal(harness.creates, 0);
      assert.equal(harness.locks, 1);
      assert.deepEqual(harness.attachments.find((row) => row.id === "manual"), manual);
      assert.ok(harness.files.has(manual.storageKey));
      assert.deepEqual(harness.removedKeys, ["automatic.pdf"]);
      const refreshed = harness.attachments.find((row) => row.id === "automatic")!;
      assert.equal(refreshed.originalName, currentName());
      assert.equal(refreshed.signedById, "approver");
      const bytes = harness.files.get(refreshed.storageKey)!;
      assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
      assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
      assert.equal(harness.audits.at(-1)?.metadata.replacedAttachmentId, previous.id);
      assert.deepEqual(harness.sourceCalls, [["document", "approver"]]);
    });
  }

  test("creates an automatic copy when only an identically named manual signed file exists", async () => {
    const manual = structuredClone(addAttachment(signedAttachment("manual", currentName())));
    harness.audits.push(
      { ...autoAudit(manual.id), documentId: "another-document" },
      { ...autoAudit(manual.id), action: "UPLOAD_ATTACHMENT" },
    );

    assert.deepEqual(await attachStampedApprovalPdfToDocument("document", "approver"), { id: "new-stamp-1" });
    assert.deepEqual(harness.attachments.find((row) => row.id === "manual"), manual);
    assert.ok(harness.files.has(manual.storageKey));
    assert.deepEqual(harness.removedKeys, []);
    assert.equal(harness.attachments.filter((row) => row.signedSourceAttachmentId === "source").length, 2);
  });

  for (const change of ["source storage key", "active source ID", "document updatedAt"] as const) {
    test(`rejects a stale render after ${change} changes and preserves the previous stamped PDF`, async () => {
      const previous = structuredClone(addAttachment(signedAttachment("automatic", currentName())));
      harness.audits.push(autoAudit(previous.id));
      harness.afterPersist = () => {
        if (change === "source storage key") harness.attachments[0].storageKey = "refreshed-source.pdf";
        else if (change === "active source ID") {
          // An archived source may retain its ID and file key. Only the current
          // source is eligible even while that historical row still exists.
          harness.attachments.push({ ...harness.attachments[0], id: "replacement-source", storageKey: "replacement.pdf" });
          harness.currentSourceId = "replacement-source";
        } else harness.document.updatedAt = new Date("2026-09-14T01:00:01Z");
      };

      await assert.rejects(attachStampedApprovalPdfToDocument("document", "approver"), /PDF 생성 중 문서가 변경/);
      assert.deepEqual(harness.attachments.find((row) => row.id === "automatic"), previous);
      assert.ok(harness.files.has(previous.storageKey));
      assert.equal(harness.persistedKeys.length, 1);
      assert.deepEqual(harness.removedKeys, harness.persistedKeys);
      assert.ok(!harness.files.has(harness.persistedKeys[0]));
      assert.equal(harness.audits.length, 1);
      assert.equal(harness.rollbacks, 1);
    });
  }

  test("simultaneous stamping requests serialize and update the same automatically created attachment", async () => {
    let releaseBoth!: () => void;
    const bothRendered = new Promise<void>((resolve) => { releaseBoth = resolve; });
    harness.afterPersist = async () => {
      if (harness.persistedKeys.length === 2) releaseBoth();
      await bothRendered;
    };

    const results = await Promise.all([
      attachStampedApprovalPdfToDocument("document", "approver-1"),
      attachStampedApprovalPdfToDocument("document", "approver-2"),
    ]);
    assert.deepEqual(results, [{ id: "new-stamp-1" }, { id: "new-stamp-1" }]);
    assert.equal(harness.locks, 2);
    assert.equal(harness.creates, 1);
    const stamped = harness.attachments.filter((row) => row.signedSourceAttachmentId === "source");
    assert.equal(stamped.length, 1);
    assert.equal(harness.persistedKeys.length, 2);
    assert.equal(harness.removedKeys.length, 1);
    assert.notEqual(harness.removedKeys[0], stamped[0].storageKey);
    assert.ok(harness.files.has(stamped[0].storageKey));
    assert.equal(harness.audits.length, 2);
    assert.equal(harness.audits[1].metadata.replacedAttachmentId, stamped[0].id);
  });
});
