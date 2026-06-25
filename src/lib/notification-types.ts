export type AppNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  documentId: string;
  documentTitle: string;
  documentNo: string | null;
  readAt: string | null;
  createdAt: string;
  documentContent?: string;
  latestComment?: string | null;
  latestApproverName?: string | null;
};
