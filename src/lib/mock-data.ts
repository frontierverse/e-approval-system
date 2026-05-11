export type UserRole = "user" | "admin";
export type DocumentStatus =
  | "draft"
  | "submitted"
  | "in_progress"
  | "approved"
  | "rejected"
  | "recalled";
export type ApprovalStepStatus =
  | "waiting"
  | "pending"
  | "approved"
  | "rejected";

export type Department = {
  id: string;
  name: string;
};

export type Position = {
  id: string;
  name: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  departmentId: string;
  positionId: string;
  role: UserRole;
};

export type UserSummary = {
  id: string;
  name: string;
  departmentName: string;
  positionName: string;
};

export type ApprovalStep = {
  id: string;
  order: number;
  approverId: string;
  approver: UserSummary;
  status: ApprovalStepStatus;
  actedAt: string | null;
  comment: string | null;
};

export type ApprovalHistory = {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  createdAt: string;
  description: string;
};

export type AttachmentSummary = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

export type ApprovalDocument = {
  id: string;
  documentNo: string;
  title: string;
  templateName: string;
  category: string;
  status: DocumentStatus;
  drafter: UserSummary;
  drafterId: string;
  createdAt: string;
  submittedAt: string | null;
  completedAt: string | null;
  content: string;
  attachmentCount: number;
  attachments: AttachmentSummary[];
  approvalSteps: ApprovalStep[];
  histories: ApprovalHistory[];
};

export const departments: Department[] = [
  { id: "dept-operations", name: "바자울" },
  { id: "dept-corporation", name: "법인" },
];

export const positions: Position[] = [
  { id: "pos-staff", name: "주임" },
  { id: "pos-senior", name: "대리" },
  { id: "pos-lead", name: "팀장" },
  { id: "pos-facility-head", name: "시설장" },
  { id: "pos-director", name: "이사" },
];

export const users: User[] = [
  {
    id: "user-001",
    name: "김민준",
    email: "minjun.kim@company.local",
    departmentId: "dept-operations",
    positionId: "pos-lead",
    role: "admin",
  },
  {
    id: "user-002",
    name: "이서연",
    email: "seoyeon.lee@company.local",
    departmentId: "dept-operations",
    positionId: "pos-senior",
    role: "user",
  },
  {
    id: "user-003",
    name: "박도윤",
    email: "doyoon.park@company.local",
    departmentId: "dept-corporation",
    positionId: "pos-staff",
    role: "user",
  },
  {
    id: "user-004",
    name: "최지훈",
    email: "jihun.choi@company.local",
    departmentId: "dept-operations",
    positionId: "pos-director",
    role: "user",
  },
  {
    id: "user-005",
    name: "정하린",
    email: "harin.jung@company.local",
    departmentId: "dept-operations",
    positionId: "pos-facility-head",
    role: "user",
  },
];

export const currentUser = users[0];

type LegacyApprovalStep = Omit<ApprovalStep, "approver">;
type LegacyApprovalHistory = Omit<ApprovalHistory, "actorName">;
type LegacyApprovalDocument = Omit<
  ApprovalDocument,
  "drafter" | "attachments" | "approvalSteps" | "histories"
> & {
  approvalSteps: LegacyApprovalStep[];
  histories: LegacyApprovalHistory[];
};

const legacyDocuments: LegacyApprovalDocument[] = [
  {
    id: "doc-2026-0007",
    documentNo: "EA-2026-0007",
    title: "신규 협업툴 도입 검토 요청",
    templateName: "일반 기안서",
    category: "구매 검토",
    status: "submitted",
    drafterId: "user-002",
    createdAt: "2026-05-02T15:10:00+09:00",
    submittedAt: "2026-05-03T09:20:00+09:00",
    completedAt: null,
    content:
      "바자울과 법인의 공동 작업이 늘어나면서 파일 공유, 작업 이력, 댓글 관리가 분산되고 있습니다. 협업툴 도입 후보를 비교 검토하고, 2주 파일럿 사용 후 정식 도입 여부를 결정하고자 합니다.",
    attachmentCount: 2,
    approvalSteps: [
      {
        id: "step-2026-0007-1",
        order: 1,
        approverId: "user-001",
        status: "pending",
        actedAt: null,
        comment: null,
      },
      {
        id: "step-2026-0007-2",
        order: 2,
        approverId: "user-004",
        status: "waiting",
        actedAt: null,
        comment: null,
      },
    ],
    histories: [
      {
        id: "history-2026-0007-1",
        actorId: "user-002",
        action: "결재 요청",
        createdAt: "2026-05-03T09:20:00+09:00",
        description: "김민준, 최지훈 순서로 결재를 요청했습니다.",
      },
    ],
  },
  {
    id: "doc-2026-0006",
    documentNo: "EA-2026-0006",
    title: "상반기 워크숍 운영 계획",
    templateName: "일반 기안서",
    category: "행사 운영",
    status: "in_progress",
    drafterId: "user-001",
    createdAt: "2026-04-29T11:30:00+09:00",
    submittedAt: "2026-04-30T10:05:00+09:00",
    completedAt: null,
    content:
      "전사 협업 강화를 위해 상반기 워크숍을 진행합니다. 장소 대관, 식음료, 운영 물품, 프로그램 진행비를 포함한 예산과 운영 일정을 승인 요청합니다.",
    attachmentCount: 1,
    approvalSteps: [
      {
        id: "step-2026-0006-1",
        order: 1,
        approverId: "user-005",
        status: "approved",
        actedAt: "2026-04-30T13:40:00+09:00",
        comment: "바자울 협업 세션 포함 확인했습니다.",
      },
      {
        id: "step-2026-0006-2",
        order: 2,
        approverId: "user-004",
        status: "pending",
        actedAt: null,
        comment: null,
      },
    ],
    histories: [
      {
        id: "history-2026-0006-1",
        actorId: "user-001",
        action: "결재 요청",
        createdAt: "2026-04-30T10:05:00+09:00",
        description: "정하린, 최지훈 순서로 결재를 요청했습니다.",
      },
      {
        id: "history-2026-0006-2",
        actorId: "user-005",
        action: "승인",
        createdAt: "2026-04-30T13:40:00+09:00",
        description: "1차 결재자가 승인했습니다.",
      },
    ],
  },
  {
    id: "doc-2026-0005",
    documentNo: "EA-2026-0005",
    title: "디자인 장비 구매 품의",
    templateName: "일반 기안서",
    category: "구매 품의",
    status: "approved",
    drafterId: "user-001",
    createdAt: "2026-04-21T16:10:00+09:00",
    submittedAt: "2026-04-22T09:00:00+09:00",
    completedAt: "2026-04-23T14:20:00+09:00",
    content:
      "바자울 신규 입사자 배정 장비와 노후 장비 교체를 위해 모니터, 태블릿, 색상 보정 장비 구매를 요청합니다.",
    attachmentCount: 3,
    approvalSteps: [
      {
        id: "step-2026-0005-1",
        order: 1,
        approverId: "user-005",
        status: "approved",
        actedAt: "2026-04-22T11:25:00+09:00",
        comment: "장비 수량 확인했습니다.",
      },
      {
        id: "step-2026-0005-2",
        order: 2,
        approverId: "user-004",
        status: "approved",
        actedAt: "2026-04-23T14:20:00+09:00",
        comment: "예산 범위 내 진행 승인합니다.",
      },
    ],
    histories: [
      {
        id: "history-2026-0005-1",
        actorId: "user-001",
        action: "결재 요청",
        createdAt: "2026-04-22T09:00:00+09:00",
        description: "정하린, 최지훈 순서로 결재를 요청했습니다.",
      },
      {
        id: "history-2026-0005-2",
        actorId: "user-005",
        action: "승인",
        createdAt: "2026-04-22T11:25:00+09:00",
        description: "1차 결재자가 승인했습니다.",
      },
      {
        id: "history-2026-0005-3",
        actorId: "user-004",
        action: "승인완료",
        createdAt: "2026-04-23T14:20:00+09:00",
        description: "최종 결재가 완료되었습니다.",
      },
    ],
  },
  {
    id: "doc-2026-0004",
    documentNo: "EA-2026-0004",
    title: "고객사 방문 교통비 정산",
    templateName: "일반 기안서",
    category: "비용 정산",
    status: "rejected",
    drafterId: "user-003",
    createdAt: "2026-04-18T18:20:00+09:00",
    submittedAt: "2026-04-19T08:55:00+09:00",
    completedAt: "2026-04-19T10:30:00+09:00",
    content:
        "영업 미팅을 위한 고객사 방문 교통비 정산을 요청합니다. 증빙 누락분은 재첨부 후 다시 결재 요청하겠습니다.",
    attachmentCount: 0,
    approvalSteps: [
      {
        id: "step-2026-0004-1",
        order: 1,
        approverId: "user-001",
        status: "rejected",
        actedAt: "2026-04-19T10:30:00+09:00",
        comment: "영수증 증빙이 누락되어 반려합니다.",
      },
      {
        id: "step-2026-0004-2",
        order: 2,
        approverId: "user-004",
        status: "waiting",
        actedAt: null,
        comment: null,
      },
    ],
    histories: [
      {
        id: "history-2026-0004-1",
        actorId: "user-003",
        action: "결재 요청",
        createdAt: "2026-04-19T08:55:00+09:00",
        description: "김민준, 최지훈 순서로 결재를 요청했습니다.",
      },
      {
        id: "history-2026-0004-2",
        actorId: "user-001",
        action: "반려",
        createdAt: "2026-04-19T10:30:00+09:00",
        description: "증빙 누락으로 문서를 반려했습니다.",
      },
    ],
  },
];

export const documents: ApprovalDocument[] = legacyDocuments.map((document) => ({
  ...document,
  attachments: [],
  drafter: getUserSummary(document.drafterId),
  approvalSteps: document.approvalSteps.map((step) => ({
    ...step,
    approver: getUserSummary(step.approverId),
  })),
  histories: document.histories.map((history) => ({
    ...history,
    actorName: getUserSummary(history.actorId).name,
  })),
}));

export const documentStatusLabels: Record<DocumentStatus, string> = {
  draft: "임시저장",
  submitted: "결재 요청",
  in_progress: "진행중",
  approved: "승인완료",
  rejected: "반려",
  recalled: "회수",
};

export const approvalStepStatusLabels: Record<ApprovalStepStatus, string> = {
  waiting: "대기",
  pending: "결재대기",
  approved: "승인",
  rejected: "반려",
};

export function getUser(userId: string) {
  return users.find((user) => user.id === userId);
}

export function getDepartment(departmentId: string) {
  return departments.find((department) => department.id === departmentId);
}

export function getPosition(positionId: string) {
  return positions.find((position) => position.id === positionId);
}

function getUserSummary(userId: string): UserSummary {
  const user = getUser(userId);
  const department = user ? getDepartment(user.departmentId) : null;
  const position = user ? getPosition(user.positionId) : null;

  return {
    id: user?.id ?? userId,
    name: user?.name ?? "-",
    departmentName: department?.name ?? "",
    positionName: position?.name ?? "",
  };
}

export function getUserDepartmentName(userId: string) {
  const user = getUser(userId);
  return user ? getDepartment(user.departmentId)?.name ?? "" : "";
}

export function getUserPositionName(userId: string) {
  const user = getUser(userId);
  return user ? getPosition(user.positionId)?.name ?? "" : "";
}

export function getCurrentApprovalStep(document: ApprovalDocument) {
  return (
    document.approvalSteps.find((step) => step.status === "pending") ?? null
  );
}

export function getApprovalProgress(document: ApprovalDocument) {
  const approved = document.approvalSteps.filter(
    (step) => step.status === "approved",
  ).length;

  return {
    approved,
    total: document.approvalSteps.length,
  };
}

export function getInboxDocuments(userId = currentUser.id) {
  return documents
    .filter((document) =>
      document.approvalSteps.some(
        (step) => step.approverId === userId && step.status === "pending",
      ),
    )
    .sort(sortByRecentActivity);
}

export function getSentDocuments(userId = currentUser.id) {
  return documents
    .filter(
      (document) =>
        document.drafterId === userId &&
        document.status !== "draft" &&
        document.status !== "recalled",
    )
    .sort(sortByRecentActivity);
}

export function getDraftDocuments(userId = currentUser.id) {
  return documents
    .filter(
      (document) =>
        document.drafterId === userId &&
        (document.status === "draft" || document.status === "recalled"),
    )
    .sort(sortByRecentActivity);
}

export function getCompletedDocuments(userId = currentUser.id) {
  return documents
    .filter((document) => {
      const isCompleted =
        document.status === "approved" || document.status === "rejected";
      const isRelated =
        document.drafterId === userId ||
        document.approvalSteps.some((step) => step.approverId === userId);

      return isCompleted && isRelated;
    })
    .sort(sortByRecentActivity);
}

export function getDocumentById(documentId: string) {
  return documents.find((document) => document.id === documentId);
}

export function getRecentHistories(limit = 5) {
  return documents
    .flatMap((document) =>
      document.histories.map((history) => ({
        ...history,
        documentId: document.id,
        documentNo: document.documentNo,
        title: document.title,
      })),
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);
}

export function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const { year, month, day } = getKoreanDateParts(value);

  return `${year}. ${month}. ${day}.`;
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const { year, month, day, hours, minutes } = getKoreanDateParts(value);
  const period = hours < 12 ? "오전" : "오후";
  const displayHour = hours % 12 || 12;

  return `${year}. ${month}. ${day}. ${period} ${displayHour}:${minutes}`;
}

function getKoreanDateParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const rawHour = Number(values.hour);
  const hours = rawHour === 24 ? 0 : rawHour;

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hours,
    minutes: values.minute,
  };
}

function sortByRecentActivity(a: ApprovalDocument, b: ApprovalDocument) {
  const aDate = a.completedAt ?? a.submittedAt ?? a.createdAt;
  const bDate = b.completedAt ?? b.submittedAt ?? b.createdAt;

  return new Date(bDate).getTime() - new Date(aDate).getTime();
}
