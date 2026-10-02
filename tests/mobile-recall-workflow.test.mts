import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import { canRecallDocumentByPolicy } from "../src/lib/approval-permissions-core.ts";

// Execute the production mutations with their external effects isolated. The transaction
// queue simulates the per-document lock; tests also verify that reads follow that lock.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const version = "2026-10-02T01:00:00.000Z";
const state: Row = {};
const tx = {
  approvalDocument: {
    async findUnique() { state.order.push("read"); return state.document; },
    async updateMany({where, data}: Row) {
      if (!where.status.in.includes(state.document.status)) return {count:0};
      Object.assign(state.document, data, {updatedAt:new Date("2026-10-02T02:00:00.000Z")});
      state.writes++; return {count:1};
    },
    async update({data}: Row) {
      assert.equal(data.attachments.deleteMany, undefined);
      Object.assign(state.document, data, {approvalSteps:data.approvalSteps.create, attachments:state.document.attachments});
      state.writes++;
    },
  },
  approvalStep: {
    async updateMany({where, data}: Row) {
      for (const step of state.document.approvalSteps) if (where.status.in.includes(step.status)) Object.assign(step, data);
    },
    async deleteMany() { state.document.approvalSteps = []; },
  },
  notification: {
    async deleteMany({where}: Row) {
      assert.equal(where.documentId, "document");
      state.notifications = state.notifications.filter((row: Row) => row.type !== where.type || row.readAt !== where.readAt);
    },
  },
  auditLog: {
    async findFirst({where}: Row) {
      return state.histories.find((row: Row) => row.actorId === where.actorId && row.documentId === where.documentId && row.action === where.action && row.metadata?.mobileRecallExpectedUpdatedAt === where.metadata.equals);
    },
    async create({data}: Row) { state.histories.push({id:String(state.histories.length), ...data}); },
  },
  user: { async findUnique() { return {name:"작성 직원"}; } },
};
let queue = Promise.resolve();
const prisma = { $transaction<T>(action: (value: typeof tx) => Promise<T>) {
  const result = queue.then(() => action(tx)); queue = result.then(() => undefined, () => undefined); return result;
} };
const key = "__mobileRecallWorkflow";
(globalThis as Row)[key] = {
  prisma, canRecallDocumentByPolicy,
  DocumentStatus:{DRAFT:"DRAFT", RECALLED:"RECALLED", SUBMITTED:"SUBMITTED", IN_PROGRESS:"IN_PROGRESS"},
  ApprovalStepStatus:{WAITING:"WAITING", PENDING:"PENDING"},
  AuditAction:{RECALL:"RECALL", SUBMIT:"SUBMIT", UPDATE_DRAFT:"UPDATE_DRAFT"},
  NotificationType:{APPROVAL_REQUESTED:"APPROVAL_REQUESTED"},
  async getCurrentAuditLogRequestData() { return {}; },
  async lockApprovalDocument() { state.order.push("lock"); state.onLock?.(); },
  async invalidateAutomaticApprovalPdfs() { state.pdfInvalidations++; },
  getSourceAttachmentWithSignedCopies() { return null; },
  getDocumentAttachmentsToRemove() { return []; },
  createDraftUpdateAuditDetails() { return {summary:"내용 보완", changes:[]}; },
  async getNextDocumentNo() { return "새 번호"; },
  getSubmitMessage() { return "결재를 요청했습니다."; },
  async createDocumentNotification(_tx: unknown, value: unknown) { state.notifications.push(value); },
  async removeStoredAttachmentFiles() {},
};
const source = readFileSync(new URL("../src/lib/approval-mutations.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("mutations.ts", source, ts.ScriptTarget.Latest, true);
const functions = ["recallSubmittedDocument", "updateDraftDocument"].map(name => {
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(fn, name); return fn.getText(ast);
}).join("\n");
const code = ts.transpileModule(`const {${Object.keys((globalThis as Row)[key]).join(",")}} = globalThis.${key};\n${functions}`,
  {compilerOptions:{module:ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2022}}).outputText;
const {recallSubmittedDocument, updateDraftDocument} = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
beforeEach(() => Object.assign(state, {
  document:{id:"document", title:"문서", drafterId:"staff", status:"IN_PROGRESS", updatedAt:new Date(version), documentNo:"원 번호", category:"업무기안", content:"원 내용", templateId:"template",
    attachments:[{id:"original-pdf", originalName:"자료.pdf"}],
    approvalSteps:[{approverId:"first", approver:{name:"첫 결재자"}, status:"APPROVED", comment:"이전 승인 의견", actedAt:version},
      {approverId:"head", approver:{name:"시설장"}, status:"PENDING", comment:null}, {approverId:"last", approver:{name:"다음 결재자"}, status:"WAITING"}]},
  histories:[{action:"APPROVE", description:"이전 승인 기록"}],
  notifications:[{type:"APPROVAL_REQUESTED", readAt:null}, {type:"APPROVAL_REQUESTED", readAt:version}, {type:"OTHER", readAt:null}],
  order:[], writes:0, pdfInvalidations:0, onLock:null,
}));
after(() => { delete (globalThis as Row)[key]; });

test("recall preserves evidence and attachments while clearing unacted steps and unread requests", async () => {
  assert.deepEqual(await recallSubmittedDocument("document", "staff", version), {ok:true, documentId:"document"});
  assert.deepEqual(state.order.slice(0,2), ["lock","read"]);
  assert.equal(state.document.status, "RECALLED");
  assert.deepEqual(state.document.attachments.map((row: Row) => row.id), ["original-pdf"]);
  assert.equal(state.document.approvalSteps[0].comment, "이전 승인 의견");
  assert.deepEqual(state.document.approvalSteps.slice(1).map((row: Row) => row.status), ["WAITING","WAITING"]);
  assert.equal(state.histories[0].description, "이전 승인 기록");
  assert.equal(state.histories[1].metadata.mobileRecallExpectedUpdatedAt, version);
  assert.equal(state.pdfInvalidations, 1);
  assert.equal(state.notifications.length, 2);
});
test("duplicate recall retries write one audit entry and cannot recall a later resubmission", async () => {
  const results = await Promise.all([recallSubmittedDocument("document","staff",version), recallSubmittedDocument("document","staff",version)]);
  assert.ok(results.every(row => row.ok));
  assert.equal(state.writes, 1);
  assert.equal(state.histories.filter((row: Row) => row.action === "RECALL").length, 1);
  state.document.status = "SUBMITTED";
  state.document.updatedAt = new Date("2026-10-02T03:00:00.000Z");
  assert.equal((await recallSubmittedDocument("document","staff",version)).ok, false);
  assert.equal(state.document.status, "SUBMITTED");
  assert.equal(state.writes, 1);
});
test("stale versions, a concurrent approval and non-authors cannot change the document", async () => {
  assert.equal((await recallSubmittedDocument("document","other",version)).ok, false);
  assert.equal((await recallSubmittedDocument("document","staff","2026-10-02T00:00:00.000Z")).ok, false);
  state.onLock = () => { state.document.status = "APPROVED"; };
  assert.equal((await recallSubmittedDocument("document","staff",version)).ok, false);
  assert.equal(state.writes, 0);
  assert.equal(state.pdfInvalidations, 0);
});
test("existing web recall remains supported without a mobile version", async () => {
  assert.equal((await recallSubmittedDocument("document","staff")).ok, true);
  assert.equal(state.histories.at(-1).metadata, undefined);
});
test("editing and resubmitting a recalled document reuses its ID and restarts the approval line", async () => {
  await recallSubmittedDocument("document", "staff", version);
  const result = await updateDraftDocument({documentId:"document", actorId:"staff", title:"수정한 제목", category:"업무기안", content:"보완한 내용", templateId:"template",
    approvers:[{id:"head", name:"시설장"}], submitImmediately:true});
  assert.equal(result.ok, true);
  assert.equal(result.documentId, "document");
  assert.equal(state.document.content, "보완한 내용");
  assert.equal(state.document.status, "SUBMITTED");
  assert.equal(state.document.documentNo, "원 번호");
  assert.equal(state.document.completedAt, null);
  assert.equal(state.document.approvalSteps[0].status, "PENDING");
  assert.equal(state.histories.filter((row: Row) => row.action === "RECALL").length, 1);
  assert.equal(state.histories.at(-1).action, "SUBMIT");
  assert.equal(state.document.attachments[0].id, "original-pdf");
});
