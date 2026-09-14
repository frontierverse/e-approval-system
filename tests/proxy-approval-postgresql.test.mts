import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

const ciDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/e_approval_test";
test("CI PostgreSQL serializes proxy, normal approval, recall and reversal using real transactions", {
  skip: process.env.GITHUB_ACTIONS !== "true", timeout: 30_000,
}, async () => {
  if (process.env.DATABASE_URL !== ciDatabaseUrl || process.env.DIRECT_URL !== ciDatabaseUrl) {
    throw new Error("Only the disposable loopback CI database is allowed.");
  }
  const {prisma} = await import("../src/lib/prisma.ts");
  const {proxyApproveApprovalStepsThrough, approveCurrentApprovalStep, recallSubmittedDocument, rejectProxyApprovedStep} = await import("../src/lib/approval-mutations.ts");
  const {compileDocumentTemplateContent} = await import("../src/lib/draft-template-content.ts");
  const {getVacationRequestDocumentTemplateSchema} = await import("../src/lib/document-template-schema.ts");
  const prefix = `proxy-ci-${randomUUID()}`;
  const [department, position] = await Promise.all([prisma.department.findFirstOrThrow(), prisma.position.findFirstOrThrow()]);
  const users = ["drafter", "approver", "admin", "admin2"].map((kind) => ({
    id: `${prefix}-${kind}`, name: kind, role: kind.startsWith("admin") ? "ADMIN" as const : "USER" as const,
    departmentId: department.id, positionId: position.id,
  }));
  const schema = getVacationRequestDocumentTemplateSchema();
  const template = await prisma.documentTemplate.create({data: { id: `${prefix}-template`, name: "휴가 신청서", schema }});
  try {
    await prisma.user.createMany({data: users});
    for (const mode of ["duplicate", "normal", "recall", "reversal"] as const) {
      const id = `${prefix}-${mode}`;
      const stepId = `${id}-step`;
      await prisma.approvalDocument.create({data: {
        id, title: "CI 대리결재 검증", category: "휴가", status: "SUBMITTED", submittedAt: new Date(),
        content: compileDocumentTemplateContent(schema, {vacationType: "annual", startDate: "2026-09-15", endDate: "2026-09-15", reason: "CI"}),
        drafterId: users[0].id, templateId: template.id,
        approvalSteps: {create: {id: stepId, order: 1, approverId: users[1].id, status: "PENDING"}},
      }});
      const proxy = () => proxyApproveApprovalStepsThrough(id, users[2].id, stepId, "부재로 대리 처리");
      if (mode === "reversal") {
        assert.equal((await proxy()).ok, true);
        const results = await Promise.all([
          rejectProxyApprovedStep(id, stepId, users[1].id, "원 결재자 반려"),
          rejectProxyApprovedStep(id, stepId, users[2].id, "대리 처리자 반려"),
        ]);
        assert.equal(results.filter((row) => row.ok).length, 1);
        const original = await prisma.staffLeaveLedger.findUniqueOrThrow({where: {documentId: id}});
        const reversals = await prisma.staffLeaveLedger.findMany({where: {userId: users[0].id, sourceKey: `approval-reversal:${original.id}`}});
        assert.equal(reversals.length, 1);
        assert.equal(original.amountHalfDays + reversals[0].amountHalfDays, 0);
        continue;
      }
      const other = mode === "normal"
        ? () => approveCurrentApprovalStep(id, users[1].id, "정상 승인")
        : mode === "recall" ? () => recallSubmittedDocument(id, users[0].id)
        : () => proxyApproveApprovalStepsThrough(id, users[3].id, stepId, "다른 관리자 처리");
      const results = await Promise.all([proxy(), other()]);
      assert.equal(results.filter((row) => row.ok).length, 1, `${mode}: only one decision may win`);
      const document = await prisma.approvalDocument.findUniqueOrThrow({where: {id}, include: {approvalSteps: true}});
      const completed = await prisma.auditLog.count({where: {documentId: id, action: "COMPLETE"}});
      assert.equal(completed, document.status === "APPROVED" ? 1 : 0);
      assert.equal(document.approvalSteps[0].status, document.status === "APPROVED" ? "APPROVED" : "WAITING");
    }
  } finally {
    await prisma.approvalDocument.deleteMany({where: {id: {startsWith: prefix}}});
    await prisma.auditLog.deleteMany({where: {actorId: {in: users.map((user) => user.id)}}});
    await prisma.user.deleteMany({where: {id: {in: users.map((user) => user.id)}}});
    await prisma.documentTemplate.delete({where: {id: template.id}});
    await prisma.$disconnect();
  }
});
