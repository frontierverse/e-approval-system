export type MobileUser = {
  id: string;
  name: string;
  role: string;
  positionName: string;
  canApproveDocuments: boolean;
};

export type HomeDocument = {
  id: string;
  title: string;
  documentNo: string;
  status: string;
  submittedAt: string | null;
  drafterName: string;
  currentApproverName: string | null;
};

export type HomeResponse = {
  canApproveDocuments: boolean;
  counts: { activeSent: number; recalled: number; activeInbox?: number };
  taskCounts: { pending: number; overdue: number };
  dailyReportSummary: MobileDailyReportHomeSummary | null;
  sentDocuments: HomeDocument[];
  inboxDocuments?: HomeDocument[];
};

export type InboxDocument = {
  id: string;
  documentNo: string;
  title: string;
  status: string;
  submittedAt: string | null;
  drafterName: string;
  stepOrder: number | null;
  attachmentCount: number;
};

export type InboxResponse = { total: number; documents: InboxDocument[] };

export type MobileAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  previewKind: "pdf" | "image" | null;
  isSigned: boolean;
  signedAt: string | null;
};

export type MobileDocument = {
  id: string;
  documentNo: string;
  title: string;
  status: string;
  category: string;
  templateName: string;
  content: string;
  createdAt?: string;
  submittedAt: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
  drafterName: string;
  approvalSteps: {
    id: string;
    order: number;
    name: string;
    status: string;
    actedAt: string | null;
    comment: string | null;
    actedByName?: string | null;
    proxyApprovedByName?: string | null;
    decisionType?: string;
  }[];
  histories?: MobileDocumentHistory[];
  attachments: MobileAttachment[];
  canDecide: boolean;
  canRecall?: boolean;
  canEdit?: boolean;
  decisionBlockedReason: string | null;
};

export type MobileDocumentHistory = {
  id: string;
  action: string;
  actorName: string;
  createdAt: string;
  description: string;
};

export type MobileNotification = {
  id: string;
  title: string;
  message: string;
  documentId: string;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsResponse = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  unreadCount: number;
  notifications: MobileNotification[];
};

export type AccountImageInfo = {
  exists: boolean;
  mimeType: string | null;
  size: number | null;
  updatedAt: string | null;
};

export type MobileAccount = {
  id: string;
  name: string;
  email: string | null;
  departmentName: string;
  positionName: string;
  canChangePassword: boolean;
  profileImage: AccountImageInfo;
  signatureImage: AccountImageInfo;
};


export type MobileStaffTaskStatus = "pending" | "overdue" | "completed" | "all" | "deleted";
export type MobileStaffTaskItem = {
  id: string; title: string; description: string | null; meetingTitle: string | null;
  dueDate: string | null; assigneeId: string; assigneeName: string; departmentName: string;
  completedAt: string | null; deletedAt: string | null; createdAt: string; updatedAt: string; version: number;
};
export type MobileStaffTaskCounts = { pending: number; overdue: number; completed: number; deleted: number };
export type MobileStaffTasksResponse = {
  status: MobileStaffTaskStatus; today: string; tasks: MobileStaffTaskItem[]; counts: MobileStaffTaskCounts;
  page: number; pageSize: 20; total: number; totalPages: number;
};
export type MobileStaffTaskMutationResponse = { ok: true; message: string; task: MobileStaffTaskItem };
export type MobileStaffTaskCreateInput = {
  title: string; requestId: string; description?: string; meetingTitle?: string; dueDate?: string;
};
export type MobileStaffTaskCompletionInput = { completed: boolean; version: number };
export type MobileStaffTaskDeleteInput = { version: number };
export type MobileStaffTaskHistoryField = "title" | "description" | "meetingTitle" | "assigneeName" | "dueDate" | "completedAt" | "deletedAt";
export type MobileStaffTaskHistoryLog = {
  id: string; createdAt: string; message: string | null; actorName: string;
  changeType: "staffTask.create" | "staffTask.update" | "staffTask.complete" | "staffTask.reopen" | "staffTask.delete" | null;
  changes: { field: MobileStaffTaskHistoryField; label: string; before: string | null; after: string | null }[];
};
export type MobileStaffTaskHistoryResponse = {
  task: MobileStaffTaskItem; logs: MobileStaffTaskHistoryLog[]; today: string;
  page: number; pageSize: 20; total: number; totalPages: number;
};


export type MobileDailyReportStatus = "missing" | "draft" | "submitted" | "reviewed";
export type MobileDailyReportFilter = "all" | "unread" | "missing" | "reviewed";
export type MobileDailyReportHomeSummary =
  | { mode: "employee"; today: string; status: MobileDailyReportStatus }
  | { mode: "director"; today: string; submitted: number; unreviewed: number }
  | { mode: "unavailable"; today: string };
export type MobileDailyReportEntry = {
  id: string; workDate: string; mainContent: string;
  youthReports: { youthId: string; youthName: string; content: string }[];
  authorId: string; authorName: string; departmentName: string; version: number;
  submittedAt: string | null; reviewedAt: string | null;
  reviewedByName: string | null; updatedAt: string;
};
export type MobileDailyReportHistoryItem = Pick<MobileDailyReportEntry, "id" | "workDate" | "submittedAt" | "reviewedAt">;
export type MobileDailyReportDirectorRow = {
  staff: { id: string; name: string; departmentName: string };
  report: { id: string; workDate: string; version: number; submittedAt: string; reviewedAt: string | null; updatedAt: string } | null;
};
export type MobileDailyReportListResponse =
  | { mode: "employee"; today: string; userName: string; canWrite: boolean; todayStatus: MobileDailyReportStatus;
      history: MobileDailyReportHistoryItem[]; page: number; pageSize: 15; total: number; totalPages: number }
  | { mode: "director"; today: string; selectedDate: string; userName: string; canWrite: false;
      filter: MobileDailyReportFilter; q: string;
      counts: { staff: number; submitted: number; missing: number; unreviewed: number };
      rows: MobileDailyReportDirectorRow[]; page: number; pageSize: 20; total: number; totalPages: number };
export type MobileDailyReportEditorResponse = {
  mode: "employee"; today: string; selectedDate: string; userName: string; canWrite: boolean;
  recipients: string[]; youths: { id: string; name: string }[]; entry: MobileDailyReportEntry | null;
};
export type MobileDailyReportDetailResponse = {
  mode: "employee" | "director"; today: string; canWrite: boolean; canReview: boolean; entry: MobileDailyReportEntry;
};
export type MobileDailyReportMutationResponse = { ok: true; message: string; entry: MobileDailyReportEntry };
export type MobileDailyReportSaveInput = {
  workDate: string; mainContent: string; youthReports: { youthId: string; content: string }[];
  intent: "draft" | "submit"; version: number;
};
