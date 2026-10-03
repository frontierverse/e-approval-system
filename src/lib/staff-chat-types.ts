export type ChatEmployee = {
  id: string;
  name: string;
  departmentName: string;
  positionName: string;
  active: boolean;
};

export type ChatAttachmentStatus = "available" | "downloading" | "deleting" | "deleted";

export type ChatAttachment = {
  id: string;
  originalName: string;
  size: number;
  status: ChatAttachmentStatus;
};

export type ChatFilePolicy = { maxFileSize: number; zipMaxFileSize: number; uploadChunkSize: number; maxFileCount: 1; allowedExtensions: string[] };

export type ChatMessage = {
  id: string;
  sequence: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  attachment?: ChatAttachment | null;
};

export type ChatConversation = {
  peer: ChatEmployee;
  lastMessage: ChatMessage;
  unreadCount: number;
};

export type ChatSummary = {
  employees: ChatEmployee[];
  conversations: ChatConversation[];
  unreadCount: number;
};

export type ChatMessagePage = { messages: ChatMessage[]; hasMore: boolean };

export type ChatUploadStatus = { uploadId: string; uploadedParts: number[]; message?: ChatMessage };
export type ChatReceiptStatus = { match: boolean; status: ChatAttachmentStatus };
