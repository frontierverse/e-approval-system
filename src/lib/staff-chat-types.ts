export type ChatEmployee = {
  id: string;
  name: string;
  departmentName: string;
  positionName: string;
  active: boolean;
};

export type ChatMessage = {
  id: string;
  sequence: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
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
