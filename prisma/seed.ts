import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  ApprovalStepStatus,
  AuditAction,
  DocumentStatus,
  PrismaClient,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";

const adapter = new PrismaPg({
  connectionString: getDatabaseUrl(),
});
const prisma = new PrismaClient({ adapter });
const demoPasswordHash = hashPassword("password123");
const defaultDocumentTemplateSchema = {
  fields: [
    { name: "title", label: "제목", type: "text", required: true },
    {
      name: "content",
      label: "기안 내용",
      type: "textarea",
      required: true,
    },
    {
      name: "attachments",
      label: "첨부파일",
      type: "attachments",
      required: false,
    },
  ],
};
const defaultAllowedAttachmentExtensions = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".txt",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".hwp",
  ".hwpx",
];

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.attachmentPolicy.deleteMany();
  await prisma.approvalComment.deleteMany();
  await prisma.approvalStep.deleteMany();
  await prisma.approvalDocument.deleteMany();
  await prisma.documentTemplate.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.position.deleteMany();

  await prisma.department.createMany({
    data: [
      {
        id: "dept-operations",
        name: "바자울",
        code: "BAJAUL",
        sortOrder: 1,
      },
      { id: "dept-corporation", name: "법인", code: "CORP", sortOrder: 2 },
    ],
  });

  await prisma.position.createMany({
    data: [
      { id: "pos-staff", name: "주임", level: 1, sortOrder: 1 },
      { id: "pos-senior", name: "대리", level: 2, sortOrder: 2 },
      { id: "pos-lead", name: "팀장", level: 3, sortOrder: 3 },
      { id: "pos-director", name: "이사", level: 4, sortOrder: 4 },
      { id: "pos-facility-head", name: "시설장", level: 5, sortOrder: 5 },
    ],
  });

  await prisma.user.createMany({
    data: [
      {
        id: "user-001",
        name: "김민준",
        email: "minjun.kim@company.local",
        passwordHash: demoPasswordHash,
        departmentId: "dept-operations",
        positionId: "pos-lead",
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
      {
        id: "user-002",
        name: "이서연",
        email: "seoyeon.lee@company.local",
        passwordHash: demoPasswordHash,
        departmentId: "dept-operations",
        positionId: "pos-senior",
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
      {
        id: "user-003",
        name: "박도윤",
        email: "doyoon.park@company.local",
        passwordHash: demoPasswordHash,
        departmentId: "dept-corporation",
        positionId: "pos-staff",
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
      {
        id: "user-004",
        name: "최지훈",
        email: "jihun.choi@company.local",
        passwordHash: demoPasswordHash,
        departmentId: "dept-operations",
        positionId: "pos-director",
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
      {
        id: "user-005",
        name: "정하린",
        email: "harin.jung@company.local",
        passwordHash: demoPasswordHash,
        departmentId: "dept-operations",
        positionId: "pos-facility-head",
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
    ],
  });

  await prisma.documentTemplate.createMany({
    data: [
      {
        id: "template-general-draft",
        name: "일반 기안서",
        description: "기본 결재 요청에 사용하는 양식",
        schema: defaultDocumentTemplateSchema,
      },
      {
        id: "template-expense-report",
        name: "지출결의서",
        description: "비용 사용과 정산 승인을 요청하는 양식",
        schema: defaultDocumentTemplateSchema,
      },
      {
        id: "template-vacation-request",
        name: "휴가신청서",
        description: "연차, 반차 등 휴가 사용을 요청하는 양식",
        schema: defaultDocumentTemplateSchema,
      },
      {
        id: "template-purchase-request",
        name: "구매요청서",
        description: "물품과 서비스 구매 승인을 요청하는 양식",
        schema: defaultDocumentTemplateSchema,
      },
    ],
  });

  await prisma.attachmentPolicy.create({
    data: {
      id: "default",
      maxFileCount: 5,
      maxFileSizeMb: 10,
      allowedExtensions: defaultAllowedAttachmentExtensions,
    },
  });

  await prisma.approvalDocument.createMany({
    data: [
      {
        id: "doc-2026-0007",
        documentNo: "EA-2026-0007",
        title: "신규 협업툴 도입 검토 요청",
        category: "구매 검토",
        content:
          "바자울과 법인의 공동 작업이 늘어나면서 파일 공유, 작업 이력, 댓글 관리가 분산되고 있습니다. 협업툴 도입 후보를 비교 검토하고, 2주 파일럿 사용 후 정식 도입 여부를 결정하고자 합니다.",
        status: DocumentStatus.SUBMITTED,
        templateId: "template-general-draft",
        drafterId: "user-002",
        createdAt: new Date("2026-05-02T15:10:00+09:00"),
        submittedAt: new Date("2026-05-03T09:20:00+09:00"),
      },
      {
        id: "doc-2026-0006",
        documentNo: "EA-2026-0006",
        title: "상반기 워크숍 운영 계획",
        category: "행사 운영",
        content:
          "전사 협업 강화를 위해 상반기 워크숍을 진행합니다. 장소 대관, 식음료, 운영 물품, 프로그램 진행비를 포함한 예산과 운영 일정을 승인 요청합니다.",
        status: DocumentStatus.IN_PROGRESS,
        templateId: "template-general-draft",
        drafterId: "user-001",
        createdAt: new Date("2026-04-29T11:30:00+09:00"),
        submittedAt: new Date("2026-04-30T10:05:00+09:00"),
      },
      {
        id: "doc-2026-0005",
        documentNo: "EA-2026-0005",
        title: "디자인 장비 구매 품의",
        category: "구매 품의",
        content:
          "바자울 신규 입사자 배정 장비와 노후 장비 교체를 위해 모니터, 태블릿, 색상 보정 장비 구매를 요청합니다.",
        status: DocumentStatus.APPROVED,
        templateId: "template-general-draft",
        drafterId: "user-001",
        createdAt: new Date("2026-04-21T16:10:00+09:00"),
        submittedAt: new Date("2026-04-22T09:00:00+09:00"),
        completedAt: new Date("2026-04-23T14:20:00+09:00"),
      },
      {
        id: "doc-2026-0004",
        documentNo: "EA-2026-0004",
        title: "고객사 방문 교통비 정산",
        category: "비용 정산",
        content:
          "영업 미팅을 위한 고객사 방문 교통비 정산을 요청합니다. 증빙 누락분은 재첨부 후 다시 상신하겠습니다.",
        status: DocumentStatus.REJECTED,
        templateId: "template-general-draft",
        drafterId: "user-003",
        createdAt: new Date("2026-04-18T18:20:00+09:00"),
        submittedAt: new Date("2026-04-19T08:55:00+09:00"),
        completedAt: new Date("2026-04-19T10:30:00+09:00"),
      },
    ],
  });

  await prisma.approvalStep.createMany({
    data: [
      {
        id: "step-2026-0007-1",
        documentId: "doc-2026-0007",
        approverId: "user-001",
        order: 1,
        status: ApprovalStepStatus.PENDING,
      },
      {
        id: "step-2026-0007-2",
        documentId: "doc-2026-0007",
        approverId: "user-004",
        order: 2,
        status: ApprovalStepStatus.WAITING,
      },
      {
        id: "step-2026-0006-1",
        documentId: "doc-2026-0006",
        approverId: "user-005",
        order: 1,
        status: ApprovalStepStatus.APPROVED,
        actedAt: new Date("2026-04-30T13:40:00+09:00"),
        comment: "바자울 협업 세션 포함 확인했습니다.",
      },
      {
        id: "step-2026-0006-2",
        documentId: "doc-2026-0006",
        approverId: "user-004",
        order: 2,
        status: ApprovalStepStatus.PENDING,
      },
      {
        id: "step-2026-0005-1",
        documentId: "doc-2026-0005",
        approverId: "user-005",
        order: 1,
        status: ApprovalStepStatus.APPROVED,
        actedAt: new Date("2026-04-22T11:25:00+09:00"),
        comment: "장비 수량 확인했습니다.",
      },
      {
        id: "step-2026-0005-2",
        documentId: "doc-2026-0005",
        approverId: "user-004",
        order: 2,
        status: ApprovalStepStatus.APPROVED,
        actedAt: new Date("2026-04-23T14:20:00+09:00"),
        comment: "예산 범위 내 진행 승인합니다.",
      },
      {
        id: "step-2026-0004-1",
        documentId: "doc-2026-0004",
        approverId: "user-001",
        order: 1,
        status: ApprovalStepStatus.REJECTED,
        actedAt: new Date("2026-04-19T10:30:00+09:00"),
        comment: "영수증 증빙이 누락되어 반려합니다.",
      },
      {
        id: "step-2026-0004-2",
        documentId: "doc-2026-0004",
        approverId: "user-004",
        order: 2,
        status: ApprovalStepStatus.WAITING,
      },
    ],
  });

  await prisma.attachment.createMany({
    data: [
      {
        id: "attachment-0007-1",
        documentId: "doc-2026-0007",
        uploaderId: "user-002",
        originalName: "collaboration-tool-comparison.pdf",
        storageKey: "mock/doc-2026-0007/comparison.pdf",
        mimeType: "application/pdf",
        size: 845120,
      },
      {
        id: "attachment-0007-2",
        documentId: "doc-2026-0007",
        uploaderId: "user-002",
        originalName: "pilot-plan.xlsx",
        storageKey: "mock/doc-2026-0007/pilot-plan.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 214320,
      },
      {
        id: "attachment-0006-1",
        documentId: "doc-2026-0006",
        uploaderId: "user-001",
        originalName: "workshop-budget.xlsx",
        storageKey: "mock/doc-2026-0006/workshop-budget.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 184992,
      },
      {
        id: "attachment-0005-1",
        documentId: "doc-2026-0005",
        uploaderId: "user-001",
        originalName: "equipment-quote-1.pdf",
        storageKey: "mock/doc-2026-0005/quote-1.pdf",
        mimeType: "application/pdf",
        size: 392020,
      },
      {
        id: "attachment-0005-2",
        documentId: "doc-2026-0005",
        uploaderId: "user-001",
        originalName: "equipment-quote-2.pdf",
        storageKey: "mock/doc-2026-0005/quote-2.pdf",
        mimeType: "application/pdf",
        size: 405880,
      },
      {
        id: "attachment-0005-3",
        documentId: "doc-2026-0005",
        uploaderId: "user-001",
        originalName: "asset-list.xlsx",
        storageKey: "mock/doc-2026-0005/asset-list.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 155010,
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        id: "history-2026-0007-1",
        actorId: "user-002",
        action: AuditAction.SUBMIT,
        targetType: "ApprovalDocument",
        targetId: "doc-2026-0007",
        documentId: "doc-2026-0007",
        message: "김민준, 최지훈 순서로 결재를 요청했습니다.",
        createdAt: new Date("2026-05-03T09:20:00+09:00"),
      },
      {
        id: "history-2026-0006-1",
        actorId: "user-001",
        action: AuditAction.SUBMIT,
        targetType: "ApprovalDocument",
        targetId: "doc-2026-0006",
        documentId: "doc-2026-0006",
        message: "정하린, 최지훈 순서로 결재를 요청했습니다.",
        createdAt: new Date("2026-04-30T10:05:00+09:00"),
      },
      {
        id: "history-2026-0006-2",
        actorId: "user-005",
        action: AuditAction.APPROVE,
        targetType: "ApprovalStep",
        targetId: "step-2026-0006-1",
        documentId: "doc-2026-0006",
        message: "1차 결재자가 승인했습니다.",
        createdAt: new Date("2026-04-30T13:40:00+09:00"),
      },
      {
        id: "history-2026-0005-1",
        actorId: "user-001",
        action: AuditAction.SUBMIT,
        targetType: "ApprovalDocument",
        targetId: "doc-2026-0005",
        documentId: "doc-2026-0005",
        message: "정하린, 최지훈 순서로 결재를 요청했습니다.",
        createdAt: new Date("2026-04-22T09:00:00+09:00"),
      },
      {
        id: "history-2026-0005-2",
        actorId: "user-005",
        action: AuditAction.APPROVE,
        targetType: "ApprovalStep",
        targetId: "step-2026-0005-1",
        documentId: "doc-2026-0005",
        message: "1차 결재자가 승인했습니다.",
        createdAt: new Date("2026-04-22T11:25:00+09:00"),
      },
      {
        id: "history-2026-0005-3",
        actorId: "user-004",
        action: AuditAction.COMPLETE,
        targetType: "ApprovalDocument",
        targetId: "doc-2026-0005",
        documentId: "doc-2026-0005",
        message: "최종 결재가 완료되었습니다.",
        createdAt: new Date("2026-04-23T14:20:00+09:00"),
      },
      {
        id: "history-2026-0004-1",
        actorId: "user-003",
        action: AuditAction.SUBMIT,
        targetType: "ApprovalDocument",
        targetId: "doc-2026-0004",
        documentId: "doc-2026-0004",
        message: "김민준, 최지훈 순서로 결재를 요청했습니다.",
        createdAt: new Date("2026-04-19T08:55:00+09:00"),
      },
      {
        id: "history-2026-0004-2",
        actorId: "user-001",
        action: AuditAction.REJECT,
        targetType: "ApprovalStep",
        targetId: "step-2026-0004-1",
        documentId: "doc-2026-0004",
        message: "증빙 누락으로 문서를 반려했습니다.",
        createdAt: new Date("2026-04-19T10:30:00+09:00"),
      },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  return databaseUrl;
}
