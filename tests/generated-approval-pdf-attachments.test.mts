import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";

// Run the real synchronization and content parser; replace only the database,
// audit request context, object storage, and PDF rendering effects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const documentId = "approval-document";
const harness = {
  document: null as Row | null,
  attachments: [] as Row[],
  audits: [] as Row[],
  renderInputs: [] as Row[],
  files: new Map<string, string>(),
  removedKeys: [] as string[],
  failStorage: false,
  failTransaction: false,
  rollbacks: 0,
  locks: 0,
  nextAttachmentId: 0,
  nextFileId: 0,
};
let transactionQueue: Promise<unknown> = Promise.resolve();

function selected(row: Row, select?: Row) {
  return structuredClone(select
    ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]))
    : row);
}

const memoryPrisma = {
  approvalDocument: {
    async findUnique({ where, select }: Row) {
      assert.equal(where.id, documentId);
      assert.equal(select.content, true);
      assert.equal(select.updatedAt, true);
      assert.deepEqual(select.approvalSteps.orderBy, { order: "asc" });
      return harness.document?.id === where.id ? structuredClone(harness.document) : null;
    },
  },
  attachment: {
    async findMany({ where, orderBy, select }: Row) {
      assert.deepEqual(where, { documentId });
      assert.deepEqual(orderBy, [{ createdAt: "asc" }, { id: "asc" }]);
      return harness.attachments
        .filter((row) => row.documentId === where.documentId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
        .map((row) => selected(row, select));
    },
    async create({ data, select }: Row) {
      assert.equal(data.documentId, documentId);
      const row = {
        id: `created-source-${++harness.nextAttachmentId}`,
        createdAt: new Date(), signedSourceAttachmentId: null,
        convertedSourceAttachmentId: null, ...structuredClone(data),
      };
      harness.attachments.push(row);
      return selected(row, select);
    },
    async update({ where, data, select }: Row) {
      const row = harness.attachments.find((attachment) => attachment.id === where.id);
      assert.ok(row, "the attachment being updated exists");
      Object.assign(row, structuredClone(data));
      return selected(row, select);
    },
    async deleteMany({ where }: Row) {
      assert.equal(where.documentId, documentId);
      const removed = new Set(where.id.in);
      const previousCount = harness.attachments.length;
      harness.attachments = harness.attachments.filter((row) =>
        row.documentId !== where.documentId || !removed.has(row.id));
      // Model the schema's SetNull behavior, so leaving a descendant behind
      // would make it look like an original and fail the regression assertions.
      for (const row of harness.attachments) {
        if (removed.has(row.signedSourceAttachmentId)) row.signedSourceAttachmentId = null;
        if (removed.has(row.convertedSourceAttachmentId)) row.convertedSourceAttachmentId = null;
      }
      return { count: previousCount - harness.attachments.length };
    },
  },
  auditLog: {
    async findMany({ where, select, orderBy }: Row) {
      assert.deepEqual(where, { documentId, targetType: "Attachment", action: "UPDATE_DRAFT" });
      assert.deepEqual(orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
      return harness.audits
        .filter((row) => row.documentId === where.documentId && row.targetType === where.targetType && row.action === where.action)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
        .map((row) => selected(row, select));
    },
    async create({ data }: Row) {
      addAudit(data);
    },
  },
  async $transaction(operation: (tx: Row) => Promise<unknown>) {
    const transaction = transactionQueue.then(async () => {
      const snapshot = structuredClone({ attachments: harness.attachments, audits: harness.audits });
      let locked = false;
      const tx = {
        ...memoryPrisma,
        async $queryRaw(query: Row) {
          assert.match(query.text, /SELECT\s+"id"\s+FROM\s+"ApprovalDocument"\s+WHERE\s+"id"\s*=\s*\$1\s+FOR UPDATE/);
          assert.deepEqual(query.values, [documentId]);
          assert.equal(locked, false, "acquire the document lock once per transaction");
          locked = true;
          harness.locks++;
          return harness.document ? [{ id: documentId }] : [];
        },
        approvalDocument: {
          async findUnique(args: Row) {
            assert.equal(locked, true, "read the latest revision only after acquiring the row lock");
            return memoryPrisma.approvalDocument.findUnique(args);
          },
        },
      };
      try {
        const result = await operation(tx);
        if (harness.failTransaction) throw new Error("transaction commit failed");
        return result;
      } catch (error) {
        Object.assign(harness, snapshot);
        harness.rollbacks++;
        throw error;
      }
    });
    transactionQueue = transaction.catch(() => undefined);
    return transaction;
  },
};

const harnessKey = "__generatedApprovalPdfAttachmentsHarness";
(globalThis as Row)[harnessKey] = {
  prisma: memoryPrisma,
  async persistAttachmentFiles(files: Row[]) {
    for (const file of files) harness.files.set(file.storageKey, file.buffer.toString("utf8"));
    if (harness.failStorage) throw new Error("storage upload failed");
  },
  async removeStoredAttachmentFiles(files: Row[]) {
    for (const file of files) {
      harness.removedKeys.push(file.storageKey);
      harness.files.delete(file.storageKey);
    }
  },
};
function moduleUrl(source: string) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const mocks = moduleUrl(`
  export const prisma = globalThis.${harnessKey}.prisma;
  export const persistAttachmentFiles = globalThis.${harnessKey}.persistAttachmentFiles;
  export const removeStoredAttachmentFiles = globalThis.${harnessKey}.removeStoredAttachmentFiles;
  export async function getCurrentAuditLogRequestData() { return {}; }
`);
let source = readFileSync(new URL("../src/lib/generated-approval-pdf-attachments.ts", import.meta.url), "utf8");
for (const specifier of ["@/lib/prisma", "@/lib/audit-log-request", "@/lib/attachment-storage"]) {
  source = source.replaceAll(`"${specifier}"`, JSON.stringify(mocks));
}
const { syncGeneratedApprovalPdf } = await import(moduleUrl(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText));

function approvalDocument() {
  return {
    id: documentId, documentNo: "APP-2026-0001", title: "출장 요청",
    category: "GENERAL", content: "기존 기안 본문", templateId: "plain-template",
    template: { name: "일반 기안서", schema: { version: 1, fields: [] } },
    drafterId: "drafter", drafter: {
      name: "기안자", department: { name: "운영팀" }, position: { name: "담당자" },
    },
    approvalSteps: [{ approverId: "approver", approver: {
      name: "결재자", department: { name: "운영팀" }, position: { name: "팀장" },
    } }],
    submittedAt: new Date("2026-09-14T01:00:00Z"),
    createdAt: new Date("2026-09-13T01:00:00Z"),
    updatedAt: new Date("2026-09-14T01:00:00Z"),
  };
}

function addAttachment(id: string, values: Row = {}) {
  const row = {
    id, documentId, originalName: "출장 요청.pdf", storageProvider: "local",
    storageKey: `generated-approval-pdf-v5/${id}.pdf`, mimeType: "application/pdf", size: 100,
    signedSourceAttachmentId: null, convertedSourceAttachmentId: null,
    createdAt: new Date("2026-09-13T01:00:00Z"), ...values,
  };
  harness.attachments.push(row);
  harness.files.set(row.storageKey, `original bytes: ${id}`);
  return row;
}

function addAudit(values: Row) {
  const index = harness.audits.length + 1;
  harness.audits.push({
    id: `audit-${index}`, createdAt: new Date(Date.UTC(2026, 8, 14, 1, 0, index)),
    documentId, targetType: "Attachment", action: "UPDATE_DRAFT", metadata: {},
    ...structuredClone(values),
  });
}

async function createFile(input: Row) {
  harness.renderInputs.push(structuredClone(input));
  const buffer = Buffer.from(JSON.stringify(input));
  return {
    originalName: `${input.title}.pdf`, storageProvider: "local",
    storageKey: `generated-approval-pdf-v5/render-${++harness.nextFileId}.pdf`,
    mimeType: "application/pdf", size: buffer.length, buffer,
  };
}

function sync(renderer = createFile) {
  return syncGeneratedApprovalPdf(documentId, "actor", renderer);
}

function revise(values: Row) {
  Object.assign(harness.document!, values);
  harness.document!.updatedAt = new Date(harness.document!.updatedAt.getTime() + 1_000);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  Object.assign(harness, {
    document: approvalDocument(), attachments: [], audits: [], renderInputs: [],
    files: new Map(), removedKeys: [], failStorage: false, failTransaction: false,
    rollbacks: 0, locks: 0, nextAttachmentId: 0, nextFileId: 0,
  });
  transactionQueue = Promise.resolve();
});
after(() => { delete (globalThis as Row)[harnessKey]; });

describe("generated approval PDF source synchronization", () => {
  test("updates the same document source when a recalled draft is renamed", async () => {
    const first = await sync();
    const previousKey = first.storageKey;
    revise({ title: "변경된 출장 요청" });

    const next = await sync();
    assert.equal(next.id, first.id);
    assert.equal(harness.attachments.length, 1);
    assert.equal(harness.attachments[0].originalName, "변경된 출장 요청.pdf");
    assert.equal(harness.renderInputs[1].title, "변경된 출장 요청");
    assert.equal(harness.files.has(previousKey), false);
    assert.match(harness.files.get(next.storageKey)!, /변경된 출장 요청/);
  });

  test("renders changed content even if the title is unchanged", async () => {
    const first = await sync();
    revise({ content: "회수 후 수정한 최신 기안 본문" });
    const next = await sync();

    assert.equal(next.id, first.id);
    assert.notEqual(next.storageKey, first.storageKey);
    assert.equal(harness.attachments.length, 1);
    assert.equal(harness.renderInputs[1].content, "회수 후 수정한 최신 기안 본문");
    assert.equal(harness.renderInputs[1].title, harness.renderInputs[0].title);
  });

  for (const field of ["documentNo", "submittedAt", "approvers"] as const) {
    test(`renders again when ${field} changes on resubmission`, async () => {
      const first = await sync();
      if (field === "documentNo") revise({ documentNo: "APP-2026-0099" });
      if (field === "submittedAt") revise({ submittedAt: new Date("2026-09-15T02:00:00Z") });
      if (field === "approvers") revise({ approvalSteps: [{
        approverId: "new-approver", approver: {
          name: "새 결재자", department: { name: "인사팀" }, position: { name: "부장" },
        },
      }] });

      const next = await sync();
      assert.equal(next.id, first.id);
      assert.notEqual(next.storageKey, first.storageKey);
      assert.equal(harness.renderInputs.length, 2);
      const input = harness.renderInputs[1];
      if (field === "documentNo") assert.equal(input.documentNo, "APP-2026-0099");
      if (field === "submittedAt") assert.deepEqual(input.issuedAt, new Date("2026-09-15T02:00:00Z"));
      if (field === "approvers") assert.deepEqual(input.approvers, [{
        name: "새 결재자", departmentName: "인사팀", positionName: "부장",
      }]);
    });
  }

  test("reuses a verified source for the same PDF revision", async () => {
    const first = await sync();
    // A workflow-only timestamp change should not regenerate identical bytes.
    revise({});
    const next = await sync();

    assert.equal(next.id, first.id);
    assert.equal(next.storageKey, first.storageKey);
    assert.equal(harness.renderInputs.length, 1);
    assert.equal(harness.audits.length, 1);
    assert.equal(harness.locks, 1);
    assert.equal(harness.files.size, 1);
  });

  test("deduplicates v5 and older audited system sources while preserving a same-name user PDF", async () => {
    const v5 = addAttachment("a-v5");
    const legacy = addAttachment("b-legacy", { storageKey: "attachments/old-system-original.pdf" });
    const v2 = addAttachment("c-v2", { storageKey: "generated-approval-pdf-v2/original.pdf" });
    const user = addAttachment("d-user", { storageKey: "attachments/user-upload.pdf" });
    const unrelated = addAttachment("other-document", { documentId: "another-document" });
    const userSnapshot = structuredClone(user);
    const unrelatedSnapshot = structuredClone(unrelated);
    const replacedKeys = [v5.storageKey, legacy.storageKey, v2.storageKey];
    addAudit({ targetId: legacy.id, message: "시스템 원본문서 PDF를 생성했습니다." });

    const current = await sync();
    assert.equal(current.id, v5.id);
    assert.deepEqual(harness.attachments.map((row) => row.id).sort(), [v5.id, user.id, unrelated.id].sort());
    assert.deepEqual(harness.attachments.find((row) => row.id === user.id), userSnapshot);
    assert.deepEqual(harness.attachments.find((row) => row.id === unrelated.id), unrelatedSnapshot);
    assert.deepEqual(new Set(harness.removedKeys), new Set(replacedKeys));
    assert.equal(harness.files.get(user.storageKey), "original bytes: d-user");
    assert.equal(harness.files.get(unrelated.storageKey), "original bytes: other-document");
  });

  test("removes automatic signed descendants when replacing an obsolete original", async () => {
    const original = addAttachment("original");
    const inProgress = addAttachment("in-progress", {
      storageKey: "generated-approval-signed/in-progress.pdf", signedSourceAttachmentId: original.id,
    });
    const final = addAttachment("final", {
      storageKey: "generated-approval-signed/final.pdf", signedSourceAttachmentId: inProgress.id,
    });
    addAudit({ targetId: inProgress.id, message: "결재본 PDF를 자동 갱신했습니다." });
    addAudit({ targetId: final.id, metadata: { generatedApprovalPdfType: "FINAL_APPROVED" } });
    const oldKeys = [original.storageKey, inProgress.storageKey, final.storageKey];

    const current = await sync();
    assert.equal(current.id, original.id);
    assert.deepEqual(harness.attachments.map((row) => row.id), [original.id]);
    assert.deepEqual(new Set(harness.removedKeys), new Set(oldKeys));
    assert.equal(harness.files.size, 1);
  });

  for (const link of ["signedSourceAttachmentId", "convertedSourceAttachmentId"] as const) {
    test(`preserves manually created ${link} evidence as history and creates a fresh original`, async () => {
      const original = addAttachment("old-original");
      const manual = addAttachment("manual", {
        storageKey: "attachments/manual.pdf", [link]: original.id,
      });
      const child = addAttachment("manual-child", {
        storageKey: "attachments/manual-child.pdf", convertedSourceAttachmentId: manual.id,
      });
      const oldRows = structuredClone([original, manual, child]);
      const oldBytes = new Map(harness.files);

      const current = await sync();
      assert.notEqual(current.id, original.id);
      assert.equal(harness.attachments.length, 4);
      assert.deepEqual(harness.removedKeys, []);
      for (const old of oldRows) {
        const archived = harness.attachments.find((row) => row.id === old.id)!;
        assert.deepEqual(archived, { ...old, originalName: `[이전 결재 이력] ${old.originalName}` });
        assert.equal(harness.files.get(old.storageKey), oldBytes.get(old.storageKey));
      }
      assert.deepEqual(harness.audits.at(-1)!.metadata.archivedSourceAttachmentIds, [original.id]);

      const archivedRows = structuredClone(harness.attachments.filter((row) => row.id !== current.id));
      assert.equal((await sync()).id, current.id, "archived storage paths do not trigger duplicate regeneration");
      assert.equal(harness.renderInputs.length, 1);

      revise({ content: "다음 재상신 내용" });
      const next = await sync();
      assert.equal(next.id, current.id);
      assert.equal(harness.attachments.length, 4);
      assert.deepEqual(harness.attachments.filter((row) => row.id !== current.id), archivedRows);
      assert.deepEqual(harness.audits.at(-1)!.metadata.archivedSourceAttachmentIds, []);
      for (const [key, bytes] of oldBytes) assert.equal(harness.files.get(key), bytes);
    });
  }

  for (const failure of ["storage", "transaction"] as const) {
    test(`cleans up the attempted new file and preserves existing sources after ${failure} failure`, async () => {
      addAttachment("existing");
      const previousRows = structuredClone(harness.attachments);
      const previousFiles = new Map(harness.files);
      if (failure === "storage") harness.failStorage = true;
      else harness.failTransaction = true;

      await assert.rejects(sync(), failure === "storage" ? /storage upload failed/ : /transaction commit failed/);
      assert.deepEqual(harness.attachments, previousRows);
      assert.deepEqual(harness.files, previousFiles);
      assert.deepEqual(harness.audits, []);
      assert.equal(harness.removedKeys.length, 1);
      assert.match(harness.removedKeys[0], /render-1\.pdf$/);
      assert.equal(harness.rollbacks, failure === "transaction" ? 1 : 0);
    });
  }

  test("concurrent requests for the same revision publish only one source", async () => {
    const bothRendering = deferred();
    let rendering = 0;
    const render = async (input: Row) => {
      const file = await createFile(input);
      if (++rendering === 2) bothRendering.resolve();
      await bothRendering.promise;
      return file;
    };
    const [first, second] = await Promise.all([sync(render), sync(render)]);

    assert.equal(first.id, second.id);
    assert.equal(first.storageKey, second.storageKey);
    assert.equal(harness.renderInputs.length, 2);
    assert.equal(harness.attachments.length, 1);
    assert.equal(harness.audits.length, 1);
    assert.equal(harness.locks, 2);
    assert.equal(harness.files.size, 1);
    assert.equal(harness.files.has(first.storageKey), true);
    assert.equal(harness.removedKeys.length, 1);
    assert.notEqual(harness.removedKeys[0], first.storageKey);
  });

  test("a stale render cannot replace a source published for a newer document", async () => {
    const rendering = deferred();
    const finishRendering = deferred();
    const stale = sync(async (input: Row) => {
      const file = await createFile(input);
      rendering.resolve();
      await finishRendering.promise;
      return file;
    });
    await rendering.promise;
    revise({ title: "최신 제목", content: "최신 본문" });
    const current = await sync();
    const currentRows = structuredClone(harness.attachments);
    const rejectsStale = assert.rejects(stale, /PDF 생성 중 문서가 변경되었습니다/);
    finishRendering.resolve();
    await rejectsStale;

    assert.deepEqual(harness.attachments, currentRows);
    assert.equal(harness.files.size, 1);
    assert.match(harness.files.get(current.storageKey)!, /최신 본문/);
    assert.equal(harness.audits.length, 1);
    assert.equal(harness.rollbacks, 1);
    assert.equal(harness.removedKeys.length, 1);
    assert.notEqual(harness.removedKeys[0], current.storageKey);
  });
});
