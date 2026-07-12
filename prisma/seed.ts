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
import {
  getDefaultDocumentTemplateSchema,
  getExpenseReportDocumentTemplateSchema,
  getVacationRequestDocumentTemplateSchema,
} from "../src/lib/document-template-schema";
import { hashPassword } from "../src/lib/password";

const adapter = new PrismaPg({
  connectionString: getDatabaseUrl(),
});
const prisma = new PrismaClient({ adapter });
const demoPasswordHash = hashPassword("password123");
const defaultDocumentTemplateSchema = getDefaultDocumentTemplateSchema();
const expenseReportDocumentTemplateSchema =
  getExpenseReportDocumentTemplateSchema();
const vacationRequestDocumentTemplateSchema =
  getVacationRequestDocumentTemplateSchema();
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
  await prisma.youthFamilyContact.deleteMany();
  await prisma.youth.deleteMany();
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
        description: "구매 요청, 사후 정산, 지급 요청을 함께 처리하는 양식",
        schema: expenseReportDocumentTemplateSchema,
      },
      {
        id: "template-vacation-request",
        name: "휴가신청서",
        description: "연차, 반차 등 휴가 사용을 요청하는 양식",
        schema: vacationRequestDocumentTemplateSchema,
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
      maxFileCount: 10,
      maxFileSizeMb: 30,
      allowedExtensions: defaultAllowedAttachmentExtensions,
    },
  });

  await prisma.youth.createMany({
    data: [
      {
        id: "youth-001",
        name: "김하늘",
        admissionDate: "2026-05-01",
        dischargeDate: "2026-12-31",
        age: 17,
        phone: "010-1111-2222",
        familyRelationship: "어머니",
        familyPhone: "010-3333-4444",
        familyContact: "010-3333-4444",
      },
      {
        id: "youth-002",
        name: "이도현",
        admissionDate: "2026-05-03",
        dischargeDate: "2027-01-15",
        age: 16,
        phone: "010-2222-3333",
        familyRelationship: "아버지",
        familyPhone: "010-4444-5555",
        familyContact: "010-4444-5555",
      },
      {
        id: "youth-003",
        name: "박민서",
        admissionDate: "2026-05-10",
        dischargeDate: null,
        age: 18,
        phone: null,
        familyRelationship: "보호자",
        familyPhone: "010-5555-6666",
        familyContact: "010-5555-6666",
      },
      {
        id: "youth-004",
        name: "최서준",
        admissionDate: null,
        dischargeDate: null,
        age: null,
        phone: null,
        familyRelationship: null,
        familyPhone: null,
        familyContact: null,
      },
    ],
  });

  await prisma.youthFamilyContact.createMany({
    data: [
      {
        id: "family-contact-001",
        youthId: "youth-001",
        relationship: "어머니",
        phone: "010-3333-4444",
      },
      {
        id: "family-contact-002",
        youthId: "youth-001",
        relationship: "아버지",
        phone: "010-7777-8888",
      },
      {
        id: "family-contact-003",
        youthId: "youth-002",
        relationship: "아버지",
        phone: "010-4444-5555",
      },
      {
        id: "family-contact-004",
        youthId: "youth-003",
        relationship: "보호자",
        phone: "010-5555-6666",
      },
    ],
  });

  await prisma.youthSpecialNote.createMany({
    data: [
      {
        id: "note-001",
        youthId: "youth-001",
        title: "등원 후 컨디션 저하",
        summary:
          "오전 프로그램 시작 전 피로감을 호소해 활동 강도를 낮추고 휴식 시간을 추가했습니다.",
        detail:
          "등원 직후 표정이 어둡고 집중 시간이 짧았습니다. 상담실에서 15분 휴식 후 미술 활동에는 참여했으며, 귀가 전 보호자에게 당일 컨디션을 공유했습니다.",
        category: "가족",
        recordedAt: "2026-05-28",
        author: "박서연",
        priority: "보통",
      },
      {
        id: "note-002",
        youthId: "youth-001",
        title: "새 프로그램 적응 중",
        summary:
          "요리 활동에서 역할을 먼저 정하면 안정적으로 참여하는 모습이 확인됐습니다.",
        detail:
          "새로운 조리 도구를 사용할 때는 처음에 망설임이 있었지만, 담당 역할을 분명히 안내하자 재료 손질과 정리까지 끝까지 수행했습니다. 다음 회기에도 역할 안내를 먼저 제공할 예정입니다.",
        category: "학원",
        recordedAt: "2026-05-30",
        author: "최유진",
        priority: "보통",
      },
      {
        id: "note-003",
        youthId: "youth-002",
        title: "또래 갈등 관찰",
        summary:
          "공동 작업 중 의견 충돌이 있었고, 중재 후 역할을 나누자 마무리까지 참여했습니다.",
        detail:
          "팀 활동에서 재료 배분을 두고 언성이 높아졌습니다. 즉시 분리하지 않고 각자의 요구를 말로 설명하게 한 뒤 역할을 재조정했습니다. 이후 활동에는 참여했으나 비슷한 상황이 반복되는지 관찰이 필요합니다.",
        category: "이탈",
        recordedAt: "2026-05-29",
        author: "김민준",
        priority: "긴급",
      },
      {
        id: "note-004",
        youthId: "youth-002",
        title: "수학 학습 집중도 향상",
        summary:
          "짧은 목표를 제시했을 때 20분 이상 집중해 문제 풀이를 완료했습니다.",
        detail:
          "이전보다 문제 풀이 시작 시간이 빨라졌고, 틀린 문제를 다시 설명하면 스스로 수정했습니다. 긴 과제보다 5문항 단위로 나누는 방식이 효과적입니다.",
        category: "학원",
        recordedAt: "2026-05-31",
        author: "정하린",
        priority: "보통",
      },
      {
        id: "note-005",
        youthId: "youth-003",
        title: "보호자 상담 예정",
        summary:
          "최근 귀가 시간 조정 요청이 있어 보호자와 주간 일정 변경 가능 여부를 확인해야 합니다.",
        detail:
          "보호자가 6월 첫째 주부터 귀가 시간을 30분 앞당길 수 있는지 문의했습니다. 차량 운행표와 프로그램 종료 시간을 함께 확인한 뒤 확정 답변이 필요합니다.",
        category: "가족",
        recordedAt: "2026-05-27",
        author: "박서연",
        priority: "긴급",
      },
      {
        id: "note-006",
        youthId: "youth-004",
        title: "카페 체험 활동 선호",
        summary:
          "주문 응대보다 음료 제조 보조 역할에서 자신감을 보였고 활동 만족도가 높았습니다.",
        detail:
          "카페 체험에서 처음에는 손님 응대를 부담스러워했으나, 계량과 컵 정리 역할을 맡긴 뒤 적극적으로 움직였습니다. 다음 체험에서는 제조 보조 역할을 먼저 배정하는 것이 좋겠습니다.",
        category: "보호관찰",
        recordedAt: "2026-05-26",
        author: "최유진",
        priority: "보통",
      },
    ],
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
