import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";

// Exercise the actual server actions, including their error and redirect paths.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const documentId = "document";
const sourceId = "source";
const harness = {
  source: null as Row | null,
  beforeTransaction: () => {},
  created: [] as Row[],
  audits: [] as Row[],
  stored: new Set<string>(),
  removed: [] as string[],
  locks: 0,
};

class Redirect extends Error {
  constructor(readonly url: string) { super("NEXT_REDIRECT"); }
}

function findSource({ where, select }: Row) {
  assert.equal(where.id, sourceId);
  assert.equal(where.signedSourceAttachmentId, null);
  assert.equal(select.storageKey, true);
  assert.equal(select.storageProvider, true);
  assert.equal(select.document.select.updatedAt, true);
  if (where.documentId) assert.equal(where.documentId, documentId);
  return structuredClone(harness.source);
}

const mockPrisma = {
  attachment: { async findFirst(args: Row) { return findSource(args); } },
  async $transaction(operation: (tx: Row) => Promise<unknown>) {
    harness.beforeTransaction();
    let locked = false;
    return operation({
      async $queryRaw(query: Row) {
        assert.match(query.text, /SELECT\s+"id"\s+FROM\s+"ApprovalDocument"\s+WHERE\s+"id"\s*=\s*\$1\s+FOR UPDATE/);
        assert.deepEqual(query.values, [documentId]);
        locked = true;
        harness.locks++;
        return [{ id: documentId }];
      },
      attachment: {
        async findFirst(args: Row) {
          assert.equal(locked, true, "recheck the source only after locking its document");
          return findSource(args);
        },
        async create({ data }: Row) {
          assert.equal(locked, true);
          assert.equal(data.signedSourceAttachmentId, sourceId);
          harness.created.push(structuredClone(data));
          return { id: "signed" };
        },
      },
      auditLog: { async create({ data }: Row) { harness.audits.push(data); } },
    });
  },
};

const mockValues: Row = {
  prisma: mockPrisma,
  revalidatePath() {},
  redirect(url: string) { throw new Redirect(url); },
  async requireUser() {
    return {
      id: "approver", role: "STAFF",
      signatureImageStorageProvider: "local", signatureImageStorageKey: "stamp.png",
    };
  },
  async getCurrentAuditLogRequestData() { return {}; },
  getReadableDocumentWhere() { return { id: documentId }; },
  isSignableAttachmentFile() { return true; },
  parseSignaturePlacements() { return { ok: true, placements: [{ page: 1, x: 1, y: 1, size: 30 }] }; },
  async readStoredAttachmentFile() {
    return { body: new ReadableStream({ start(controller) {
      controller.enqueue(Buffer.from("source bytes")); controller.close();
    } }) };
  },
  async createSignedAttachmentFile() {
    return { originalName: "signed.pdf", mimeType: "application/pdf", buffer: Buffer.from("signed bytes") };
  },
  defaultAttachmentPolicy: {},
  async prepareAttachmentFiles() {
    return { files: [{
      originalName: "signed.pdf", storageProvider: "local", storageKey: "staged-signed.pdf",
      mimeType: "application/pdf", size: 12, buffer: Buffer.from("signed bytes"),
    }] };
  },
  async persistAttachmentFiles(files: Row[]) {
    for (const file of files) harness.stored.add(file.storageKey);
  },
  async removeStoredAttachmentFiles(files: Row[]) {
    for (const file of files) {
      harness.stored.delete(file.storageKey);
      harness.removed.push(file.storageKey);
    }
  },
};
const harnessKey = "__attachmentSignatureRevisionHarness";
(globalThis as Row)[harnessKey] = mockValues;

function moduleUrl(source: string) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function loadAction(relativePath: string) {
  let source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const parsed = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true);
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    if (specifier === "@/generated/prisma/client") continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const names = bindings.elements.filter((binding) => !binding.isTypeOnly)
      .map((binding) => binding.propertyName?.text ?? binding.name.text);
    for (const name of names) {
      mockValues[name] ??= () => { throw new Error(`Unexpected dependency: ${name}`); };
    }
    const mock = moduleUrl(names.map((name) =>
      `export const ${name} = globalThis.${harnessKey}.${name};`).join("\n"));
    source = source.replaceAll(JSON.stringify(specifier), JSON.stringify(mock));
  }
  return import(moduleUrl(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText));
}

const signing = await loadAction("../src/app/attachments/[id]/sign/actions.ts");
const uploading = await loadAction("../src/app/documents/[id]/actions.ts");

beforeEach(() => {
  Object.assign(harness, {
    source: {
      id: sourceId, originalName: "original.pdf", storageProvider: "local",
      storageKey: "original.pdf", mimeType: "application/pdf",
      document: {
        id: documentId, status: "SUBMITTED", updatedAt: new Date("2026-09-14T01:00:00Z"),
        approvalSteps: [{ approverId: "approver", status: "PENDING" }],
      },
    },
    beforeTransaction: () => {}, created: [], audits: [], stored: new Set(), removed: [], locks: 0,
  });
});
after(() => { delete (globalThis as Row)[harnessKey]; });

async function invoke(kind: "sign" | "upload") {
  try {
    return kind === "sign"
      ? await signing.createSignedAttachmentAction(sourceId, {}, new FormData())
      : await uploading.uploadSignedAttachmentAction(documentId, sourceId, new FormData());
  } catch (error) {
    assert.ok(error instanceof Redirect, "actions only redirect after handled completion");
    const url = new URL(error.url, "https://example.test");
    return { error: url.searchParams.get("actionError"), url: error.url };
  }
}

describe("manual attachment signatures use the current source revision", () => {
  for (const kind of ["sign", "upload"] as const) {
    for (const change of ["source", "document", "archived", "deleted", "approver", "recalled"] as const) {
      test(`${kind} rejects a ${change} change before committing and cleans staged bytes`, async () => {
        harness.beforeTransaction = () => {
          if (change === "source") harness.source!.storageKey = "latest-original.pdf";
          if (change === "document") harness.source!.document.updatedAt = new Date("2026-09-14T02:00:00Z");
          if (change === "archived") harness.source!.originalName = "[이전 결재 이력] original.pdf";
          if (change === "deleted") harness.source = null;
          if (change === "approver") harness.source!.document.approvalSteps[0].status = "APPROVED";
          if (change === "recalled") harness.source!.document.status = "RECALLED";
        };
        const result = await invoke(kind);
        assert.match(result.error, change === "approver" || change === "recalled"
          ? /현재 결재 차례/ : /문서 또는 원본 첨부파일이 변경/);
        assert.equal(harness.locks, 1);
        assert.deepEqual(harness.created, []);
        assert.deepEqual(harness.audits, []);
        assert.equal(harness.stored.size, 0);
        assert.deepEqual(harness.removed, ["staged-signed.pdf"]);
      });
    }
    test(`${kind} commits an unchanged source and preserves its file through success redirect`, async () => {
      const result = await invoke(kind);
      assert.equal(result.error, null);
      assert.match(result.url, /^\/documents\/document(?:#signed-signed)?$/);
      assert.equal(harness.created.length, 1);
      assert.equal(harness.audits.length, 1);
      assert.equal(harness.locks, 1);
      assert.deepEqual([...harness.stored], ["staged-signed.pdf"]);
      assert.deepEqual(harness.removed, []);
    });
  }
});
