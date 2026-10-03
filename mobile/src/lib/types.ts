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
