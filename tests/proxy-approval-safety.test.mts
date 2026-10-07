import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import ts from "typescript";
import { compileDocumentTemplateContent } from "../src/lib/draft-template-content.ts";
import { getVacationRequestDocumentTemplateSchema, vacationRequestTemplateId } from "../src/lib/document-template-schema.ts";
import { canActAsApprovalProxy } from "../src/lib/proxy-approval-policy.ts";
import { isInvalidAutomaticApprovalPdf } from "../src/lib/approval-pdf-invalidation.ts";

// Real decisions, policy, locks, ledger and invalidation. Only external effects are mocked.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const state = { document: {} as Row, ledger: [] as Row[], audits: [] as Row[], attachments: [] as Row[], notifications: [] as Row[], failInvalidation: false };
let lockTail = Promise.resolve();
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((part: Row) => matches(row, part));
    if (value && typeof value === "object") {
      if ("in" in value) return value.in.includes(row[key]);
      if ("path" in value) return value.path.reduce((nested: Row | undefined, part: string) => nested?.[part], row[key]) === value.equals;
    }
    return row[key] === value;
  });
}
const effects = {
  user: { async findUnique({where}: Row) { return { id: where.id, name: where.id, role: where.id.startsWith("admin") ? "ADMIN" : "USER", position: null }; } },
  staffLeaveLedger: {
    async findUnique({where}: Row) { return structuredClone(state.ledger.find((row) => row.documentId === where.documentId) ?? null); },
    async createMany({data}: Row) {
      for (const row of data) if (!state.ledger.some((existing) => existing.userId === row.userId && existing.sourceKey === row.sourceKey)) {
        state.ledger.push({id: `ledger-${state.ledger.length + 1}`, ...structuredClone(row)});
      }
    },
  },
  attachment: {
    async findMany({where}: Row) { return structuredClone(state.attachments.filter((row) => matches(row, where))); },
    async update({where, data}: Row) {
      if (state.failInvalidation) throw new Error("invalidation failed");
      const row = state.attachments.find((row) => row.id === where.id);
      assert.ok(row); Object.assign(row, data); return row;
    },
  },
  auditLog: {
    async create({data}: Row) { state.audits.push(structuredClone(data)); },
    async findMany({where}: Row) { return structuredClone(state.audits.filter((row) => matches(row, where))); },
    async findFirst({where}: Row) { return structuredClone(state.audits.find((row) => matches(row, where)) ?? null); },
  },
  notification: {
    async create({data}: Row) { state.notifications.push(structuredClone(data)); },
    async deleteMany({where}: Row) { state.notifications = state.notifications.filter((row) => !matches(row, where)); },
  },
};
const prisma = {
  ...effects,
  async $transaction(operation: (tx: Row) => Promise<unknown>) {
    let locked = false;
    let release: (() => void) | undefined;
    let snapshot: typeof state | undefined;
    function requireLock() { assert.equal(locked, true, "document must be locked BEFORE reading or changing decisions"); }
    const tx = {
      ...effects,
      async $queryRaw(query: {text: string; values: unknown[]}) {
        assert.match(query.text, /ApprovalDocument.*FOR UPDATE/s);
        assert.deepEqual(query.values, ["doc"]);
        const previous = lockTail;
        lockTail = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        locked = true;
        snapshot = structuredClone(state);
        return [{id: "doc"}];
      },
      approvalDocument: {
        async findUnique() { requireLock(); return structuredClone(state.document); },
        async update({data}: Row) { requireLock(); Object.assign(state.document, data); return structuredClone(state.document); },
        async updateMany({where, data}: Row) {
          requireLock(); if (!matches(state.document, where)) return {count: 0};
          Object.assign(state.document, data); return {count: 1};
        },
      },
      approvalStep: {
        async findMany() { requireLock(); return state.document.approvalSteps.filter((row: Row) => row.status === "PENDING"); },
        async update({where, data}: Row) {
          requireLock(); const step = state.document.approvalSteps.find((row: Row) => row.id === where.id);
          assert.ok(step); Object.assign(step, data); return step;
        },
        async updateMany({where, data}: Row) {
          requireLock(); const rows = state.document.approvalSteps.filter((row: Row) => matches(row, where));
          for (const row of rows) Object.assign(row, data);
          return {count: rows.length};
        },
      },
    };
    try { return await operation(tx); }
    catch (error) { if (snapshot) Object.assign(state, snapshot); throw error; }
    finally { release?.(); }
  },
};
const key = "__proxyApprovalSafetyHarness";
(globalThis as Row)[key] = {prisma};
const moduleUrl = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const mockUrl = moduleUrl(`
  export const prisma = globalThis.${key}.prisma;
  export async function getCurrentAuditLogRequestData() { return {}; }
  export async function createDocumentNotification(tx, input) { return tx.notification.create({data: input}); }
  export async function removeStoredAttachmentFiles() { throw new Error("Unexpected storage access"); }
`);
function compile(file: string, replacements: Record<string, string>) {
  let source = readFileSync(new URL(`../src/lib/${file}`, import.meta.url), "utf8");
  // Notification delivery is an external effect; actual queue/integration tests cover it separately.
  source = source.replaceAll(JSON.stringify("@/lib/mobile-push-events"), JSON.stringify('data:text/javascript,export%20async%20function%20queueStaffPushEvent(){}%20export%20async%20function%20queueChatPush(){}'));

  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`"${from}"`, JSON.stringify(to));
  return moduleUrl(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText);
}
const leaveModule = compile("staff-leave.ts", {"@/lib/prisma": mockUrl});
const {reverseApprovedVacationLeaveDeduction} = await import(leaveModule);
const {proxyApproveApprovalStepsThrough, rejectProxyApprovedStep, recallSubmittedDocument, approveCurrentApprovalStep} = await import(compile("approval-mutations.ts", {
  "@/lib/prisma": mockUrl, "@/lib/notifications": mockUrl, "@/lib/audit-log-request": mockUrl,
  "@/lib/attachment-storage": mockUrl, "@/lib/staff-leave": leaveModule,
}));
const schema = getVacationRequestDocumentTemplateSchema();
beforeEach(() => {
  lockTail = Promise.resolve();
  Object.assign(state, {ledger: [], audits: [], attachments: [], notifications: [], failInvalidation: false});
  state.document = {
    id: "doc", title: "연차 신청", drafterId: "drafter", status: "SUBMITTED", completedAt: null,
    templateId: vacationRequestTemplateId, template: {name: "휴가 신청서", schema},
    content: compileDocumentTemplateContent(schema, {vacationType: "annual", startDate: "2026-09-15", endDate: "2026-09-15", reason: "검증"}),
    drafter: {id: "drafter", name: "기안자", position: null},
    approvalSteps: [{ id: "step", documentId: "doc", order: 1, approverId: "approver", status: "PENDING", decisionType: "NORMAL",
      actedById: null, proxyApprovedById: null, approver: {id: "approver", name: "원결재자", position: null}, proxyApprovedBy: null }],
  };
});
after(() => { delete (globalThis as Row)[key]; });
const proxy = (actor = "admin") => proxyApproveApprovalStepsThrough("doc", actor, "step", "부재에 따른 대리결재");
const reject = () => rejectProxyApprovedStep("doc", "step", "approver", "승인 취소");
function addCopies() {
  state.attachments.push({id: "auto", documentId: "doc", originalName: "승인본.pdf"}, {id: "manual", documentId: "doc", originalName: "승인본.pdf"});
  state.audits.push({id: "auto-audit", documentId: "doc", action: "UPDATE_DRAFT", targetType: "Attachment", targetId: "auto", metadata: {generatedApprovalPdfType: "FINAL_APPROVED"}});
}
describe("proxy approval safety", () => {
  test("allows only administrators who are not the drafter", async () => {
    for (const actor of ["drafter", "unrelated", "approver"]) assert.equal((await proxy(actor)).ok, false);
    state.document.drafterId = "admin";
    assert.equal((await proxy()).ok, false);
    assert.equal(canActAsApprovalProxy(undefined, "ADMIN", "drafter"), false);
    state.document.drafterId = "drafter";
    assert.equal((await proxy()).ok, true);
    assert.equal(state.document.approvalSteps[0].proxyApprovedById, "admin");
    assert.equal(state.audits[0].metadata.proxyActorId, "admin");
  });
  test("requires a bounded reason even when called without a form", async () => {
    for (const reason of ["", " ", "a", "a".repeat(1001)]) {
      assert.equal((await proxyApproveApprovalStepsThrough("doc", "admin", "step", reason)).ok, false);
    }
    assert.equal(state.document.status, "SUBMITTED");
    assert.equal(state.audits.length, 0);
  });
  test("concurrent proxy requests record exactly one approval and deduction", async () => {
    const results = await Promise.all([proxy(), proxy("admin-2")]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(state.ledger.length, 1);
    assert.equal(state.audits.filter((row) => row.action === "PROXY_APPROVE").length, 1);
  });
  test("recall taking the lock first cannot be overwritten by a proxy approval", async () => {
    const [recall, approval] = await Promise.all([recallSubmittedDocument("doc", "drafter"), proxy()]);
    assert.equal(recall.ok, true); assert.equal(approval.ok, false);
    assert.equal(state.document.status, "RECALLED"); assert.equal(state.ledger.length, 0);
  });
  test("final proxy approval taking the lock first prevents a later recall", async () => {
    const [approval, recall] = await Promise.all([proxy(), recallSubmittedDocument("doc", "drafter")]);
    assert.equal(approval.ok, true); assert.equal(recall.ok, false);
    assert.equal(state.document.status, "APPROVED");
  });
  test("normal and proxy approval share the lock and cannot overwrite each other", async () => {
    const results = await Promise.all([approveCurrentApprovalStep("doc", "approver", "확인"), proxy()]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(state.ledger.length, 1);
    assert.equal(state.document.approvalSteps[0].decisionType, "NORMAL");
  });
  test("rejection restores the recorded amount once and preserves manual evidence", async () => {
    await proxy(); addCopies();
    const original = structuredClone(state.ledger[0]);
    state.notifications.push({documentId: "doc", type: "APPROVAL_REQUESTED", readAt: null});
    const results = await Promise.all([reject(), reject()]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(state.document.status, "REJECTED");
    assert.deepEqual(state.ledger[0], original);
    assert.equal(state.ledger.reduce((sum, row) => sum + row.amountHalfDays, 0), 0);
    assert.equal(state.ledger[1].sourceKey, `approval-reversal:${original.id}`);
    assert.equal(state.attachments[0].originalName, "[효력 취소] 승인본.pdf");
    assert.equal(state.attachments[1].originalName, "승인본.pdf");
    assert.equal(state.notifications.filter((row) => row.type === "APPROVAL_REQUESTED").length, 0);
    await reverseApprovedVacationLeaveDeduction(prisma, {documentId: "doc", actorId: "admin", reason: "재시도"});
    assert.equal(state.ledger.length, 2);
  });
  test("reversal uses historical deduction even when the document content has changed", async () => {
    await proxy(); state.ledger[0].amountHalfDays = -7;
    state.document.content = "변경된 내용";
    await reject();
    assert.equal(state.ledger[1].amountHalfDays, 7);
  });
  test("rejecting an in-progress proxy approval creates no leave credit", async () => {
    state.document.approvalSteps.push({ ...structuredClone(state.document.approvalSteps[0]), id: "next", order: 2, approverId: "next-user", status: "WAITING" });
    assert.equal((await proxy()).ok, true);
    assert.equal(state.document.status, "IN_PROGRESS");
    assert.equal(state.ledger.length, 0);
    assert.equal((await reject()).ok, true);
    assert.equal(state.document.status, "REJECTED");
    assert.equal(state.ledger.length, 0);
  });
  test("invalidation failure rolls the rejection and leave reversal back together", async () => {
    await proxy(); addCopies(); state.failInvalidation = true;
    await assert.rejects(reject, /invalidation failed/);
    assert.equal(state.document.status, "APPROVED");
    assert.equal(state.document.approvalSteps[0].status, "APPROVED");
    assert.equal(state.ledger.length, 1);
  });
  test("legacy rejected automatic copies are invalid, identically named manual files are unchanged", async () => {
    addCopies();
    for (const [id, expected] of [["auto", true], ["manual", false]] as const) {
      assert.equal(await isInvalidAutomaticApprovalPdf(prisma as never, {id, originalName: "승인본.pdf", document: {status: "REJECTED"}}), expected);
    }
    assert.equal(await isInvalidAutomaticApprovalPdf(prisma as never, {id: "auto", originalName: "[효력 취소] 승인본.pdf", document: {status: "IN_PROGRESS"}}), true);
  });
});
