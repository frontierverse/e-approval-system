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

export type MobileDocument = {
  id: string;
  documentNo: string;
  title: string;
  status: string;
  category: string;
  templateName: string;
  content: string;
  submittedAt: string | null;
  drafterName: string;
  approvalSteps: {
    id: string;
    order: number;
    name: string;
    status: string;
    actedAt: string | null;
    comment: string | null;
  }[];
  attachments: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    previewKind: "pdf" | "image" | null;
  }[];
  canDecide: boolean;
  decisionBlockedReason: string | null;
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
  unreadCount: number;
  notifications: MobileNotification[];
};
