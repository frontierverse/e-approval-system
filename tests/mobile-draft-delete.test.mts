import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { Prisma, AuditAction } from "../src/generated/prisma/client.ts";
import { MobileDraftError, mobileDraftId, mobileDraftTimestamp } from "../src/lib/mobile-draft-core.ts";
import { canDeleteDraftDocumentByPolicy } from "../src/lib/approval-permissions-core.ts";
import { isDraftDeleteResult } from "../mobile/src/lib/draft-deletion.ts";

const version = "2026-10-05T00:12:00.000Z";
function fixture() {
  const h = { document: { id: "draft-a", drafterId: "staff", title: "합성 기안", status: "DRAFT", updatedAt: new Date(version), attachments: [{ storageProvider: "SYNTHETIC", storageKey: "synthetic-file" }] } as Record<string, unknown> | null,
    audits: [] as Record<string, unknown>[], order: [] as string[], files: [] as unknown[], cache: [] as string[], active: true, deletes: 0, failAudit: false, failCommit: false };
  const tx = {
    async $queryRaw(query: { sql: string }) { h.order.push(query.sql.includes('"User"') ? "actor-lock" : "document-lock"); },
    user: { async findUnique() { return { status: h.active ? "ACTIVE" : "INACTIVE" }; } },
    approvalDocument: {
      async findUnique() { assert.equal(h.order.at(-1), "document-lock"); h.order.push("read"); return h.document; },
      async delete() { h.order.push("delete"); h.deletes++; h.document = null; for (const audit of h.audits) audit.documentId = null; },
    },
    auditLog: {
      async findFirst({ where }: { where: { actorId: string; targetId: string; action: string; metadata: { equals: string } } }) {
        return h.audits.find(a => a.actorId === where.actorId && a.targetId === where.targetId && a.action === where.action && (a.metadata as Record<string, unknown>).mobileDeleteExpectedUpdatedAt === where.metadata.equals) ?? null;
      },
      async create({ data }: { data: Record<string, unknown> }) { if (h.failAudit) throw Error("audit failure"); h.audits.push({ id: "audit", ...data }); },
    },
  };
  let queue = Promise.resolve();
  const db = { $transaction<T>(action: (tx: unknown) => Promise<T>) {
    const result = queue.then(async () => {
      const snapshot = structuredClone({ document: h.document, audits: h.audits, deletes: h.deletes });
      try { const value = await action(tx); if (h.failCommit) throw Error("commit failure"); h.order.push("commit"); return value; }
      catch (cause) { Object.assign(h, snapshot); throw cause; }
    }); queue = result.then(() => undefined, () => undefined); return result;
  } };
  const modules: Record<string, unknown> = {
    "server-only": {}, "next/cache": { revalidatePath: () => { throw Error("global cache used"); } },
    "@/generated/prisma/client": { Prisma, AuditAction }, "@/lib/prisma": { prisma: { $transaction() { throw Error("global DB used"); } } },
    "@/lib/mobile-draft-core": { MobileDraftError, mobileDraftId, mobileDraftTimestamp },
    "@/lib/approval-permissions-core": { canDeleteDraftDocumentByPolicy },
    "@/lib/audit-log-request": { getCurrentAuditLogRequestData: async () => ({}) },
    "@/lib/attachment-storage": { removeStoredAttachmentFiles: async () => { throw Error("global storage used"); } },
  };
  function load(name: string) {
    if (modules[name]) return modules[name];
    const file = name.replace("@/", "../src/") + ".ts", source = readFileSync(new URL(file, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const evaluated = { exports: {} };
    new Function("require", "module", "exports", compiled)(load, evaluated, evaluated.exports);
    return modules[name] = evaluated.exports;
  }
  const { deleteMobileDraft } = load("@/lib/mobile-draft-delete") as { deleteMobileDraft: (actor: string, id: string, value: unknown, deps: unknown) => Promise<unknown> };
  const deps = { db, cache: (path: string) => { h.cache.push(path); }, removeAttachments: async (files: unknown[]) => { assert.ok(h.order.includes("commit")); assert.equal(h.document, null); h.files.push(...files); } };
  return { h, run: (actor = "staff", body: unknown = { expectedUpdatedAt: version }, id = "draft-a") => deleteMobileDraft(actor, id, body, deps) };
}

test("mobile draft deletion commits its audit before removing files, and retries survive audit SetNull", async () => {
  const f = fixture();
  const results = await Promise.all([f.run(), f.run()]);
  assert.ok(results.every(value => isDraftDeleteResult(value, "draft-a")));
  assert.equal(f.h.document, null); assert.equal(f.h.deletes, 1); assert.equal(f.h.audits.length, 1);
  assert.equal(f.h.audits[0].documentId, null); assert.equal(f.h.audits[0].targetId, "draft-a");
  assert.equal(f.h.files.length, 1); assert.ok(f.h.cache.includes("/drafts"));
  await assert.rejects(f.run("other"), { status: 404 });
  await assert.rejects(f.run("staff", { expectedUpdatedAt: "2026-10-05T00:13:00.000Z" }), { status: 404 });
});
test("only the active drafter can delete DRAFT; submitted, recalled, completed and stale edits survive", async () => {
  for (const status of ["SUBMITTED", "IN_PROGRESS", "RECALLED", "APPROVED", "REJECTED", "DISCARDED"]) {
    const f = fixture(); f.h.document!.status = status;
    await assert.rejects(f.run(), { status: 409 }); assert.equal(f.h.deletes, 0); assert.equal(f.h.audits.length, 0);
  }
  const other = fixture(); await assert.rejects(other.run("administrator"), { status: 404 });
  const stale = fixture(); stale.h.document!.updatedAt = new Date("2026-10-05T00:13:00.000Z");
  await assert.rejects(stale.run(), { status: 409 }); assert.equal(stale.h.deletes, 0);
  const inactive = fixture(); inactive.h.active = false;
  await assert.rejects(inactive.run(), { status: 401 }); assert.deepEqual(inactive.h.order, ["actor-lock"]);
  const replay = fixture(); await replay.run(); replay.h.active = false;
  await assert.rejects(replay.run(), { status: 401 }); assert.equal(replay.h.deletes, 1);
});
test("invalid delete bodies are rejected before any transaction or attachment mutation", async () => {
  for (const body of [null, [], {}, { expectedUpdatedAt: null }, { expectedUpdatedAt: "invalid" }, { expectedUpdatedAt: "2026-10-05T00:12:00Z" }, { expectedUpdatedAt: version, force: true }]) {
    const f = fixture(); await assert.rejects(f.run("staff", body), { status: 400 });
    assert.deepEqual(f.h.order, []); assert.equal(f.h.files.length, 0);
  }
  assert.equal(isDraftDeleteResult({ ok: true, deleted: true, documentId: "other" }, "draft-a"), false);
  assert.equal(isDraftDeleteResult({ ok: true, documentId: "draft-a" }, "draft-a"), false);
});
test("audit or commit failure rolls back deletion and never removes stored files", async () => {
  for (const failure of ["failAudit", "failCommit"] as const) {
    const f = fixture(); f.h[failure] = true; await assert.rejects(f.run());
    assert.ok(f.h.document); assert.equal(f.h.deletes, 0); assert.equal(f.h.audits.length, 0); assert.equal(f.h.files.length, 0);
  }
});
