import { ApiError } from "./api";
import { requestKey } from "./drafts";
import type { ChatAttachment, ChatEmployee, ChatFilePolicy, ChatMessage, ChatMessagePage, ChatReceiptStatus, ChatSummary, ChatUploadStatus } from "@/lib/types";
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: string[]) => Object.keys(v).every(k => names.includes(k));
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const iso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export const isChatId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
export const chatRouteId = (v: unknown): string => typeof v === "string" ? v : "";
export const isChatSequence = (v: unknown): v is string => typeof v === "string" && /^[1-9]\d*$/.test(v);
export function compareChatSequence(a: string, b: string) {
  return a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0;
}
export function isChatEmployee(v: unknown): v is ChatEmployee {
  return object(v) && keys(v, ["id", "name", "departmentName", "positionName", "active"]) && isChatId(v.id) && typeof v.name === "string" && typeof v.departmentName === "string" && typeof v.positionName === "string" && typeof v.active === "boolean";
}
export function isChatAttachment(v: unknown): v is ChatAttachment {
  return object(v) && keys(v, ["id", "originalName", "size", "status"]) && isChatId(v.id) && typeof v.originalName === "string" && v.originalName.length > 0 && count(v.size) && v.size > 0 && v.size <= 100 * 1024 * 1024 && ["available", "downloading", "deleting", "deleted"].includes(String(v.status));
}
export function isChatMessage(v: unknown, userId?: string, peerId?: string): v is ChatMessage {
  return object(v) && keys(v, ["id", "sequence", "senderId", "recipientId", "body", "createdAt", "readAt", "attachment"]) && isChatId(v.id) && isChatSequence(v.sequence) && isChatId(v.senderId) && isChatId(v.recipientId) && v.senderId !== v.recipientId && typeof v.body === "string" && v.body.length <= 2000 && iso(v.createdAt) && (v.readAt === null || iso(v.readAt)) && (v.attachment === undefined || v.attachment === null || isChatAttachment(v.attachment)) && (!userId || v.senderId === userId || v.recipientId === userId) && (!peerId || (v.senderId === peerId || v.recipientId === peerId)) && (!userId || !peerId || (v.senderId === userId && v.recipientId === peerId || v.senderId === peerId && v.recipientId === userId));
}
export function isChatMessagePage(v: unknown, userId?: string, peerId?: string): v is ChatMessagePage {
  if (!object(v) || !keys(v, ["messages", "hasMore"]) || !Array.isArray(v.messages) || v.messages.length > 50 || typeof v.hasMore !== "boolean")
    return false;
  const ids = new Set<string>();
  let sequence = "0";
  for (const message of v.messages) {
    if (!isChatMessage(message, userId, peerId) || ids.has(message.id) || compareChatSequence(sequence, message.sequence) >= 0)
      return false;
    ids.add(message.id);
    sequence = message.sequence;
  }
  return true;
}
export function isChatSummary(v: unknown, userId?: string): v is ChatSummary {
  if (!object(v) || !keys(v, ["employees", "conversations", "unreadCount"]) || !Array.isArray(v.employees) || !Array.isArray(v.conversations) || !count(v.unreadCount))
    return false;
  const staff = new Set<string>();
  const peers = new Set<string>();
  let unread = 0;
  for (const e of v.employees) {
    if (!isChatEmployee(e) || !e.active || e.id === userId || staff.has(e.id))
      return false;
    staff.add(e.id);
  }
  for (const c of v.conversations) {
    if (!object(c) || !keys(c, ["peer", "lastMessage", "unreadCount"]) || !isChatEmployee(c.peer) || c.peer.id === userId || peers.has(c.peer.id) || !count(c.unreadCount) || !isChatMessage(c.lastMessage, userId, c.peer.id))
      return false;
    peers.add(c.peer.id);
    unread += c.unreadCount;
  }
  return Number.isSafeInteger(unread) && unread === v.unreadCount;
}
export function isChatFilePolicy(v: unknown): v is ChatFilePolicy {
  return object(v) && keys(v, ["maxFileSize", "zipMaxFileSize", "uploadChunkSize", "maxFileCount", "allowedExtensions"]) && count(v.maxFileSize) && v.maxFileSize > 0 && v.maxFileSize <= 4 * 1024 * 1024 && v.zipMaxFileSize === 100 * 1024 * 1024 && v.uploadChunkSize === 4 * 1024 * 1024 && v.maxFileCount === 1 && Array.isArray(v.allowedExtensions) && v.allowedExtensions.every(e => typeof e === "string" && /^\.[a-z0-9]+$/.test(e));
}
export function isChatUploadStatus(v: unknown): v is ChatUploadStatus {
  return object(v) && keys(v, ["uploadId", "uploadedParts", "message"]) && typeof v.uploadId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.uploadId) && Array.isArray(v.uploadedParts) && v.uploadedParts.length <= 25 && new Set(v.uploadedParts).size === v.uploadedParts.length && v.uploadedParts.every((p, i, parts) => count(p) && p < 25 && (i === 0 || parts[i - 1] < p)) && (v.message === undefined || isChatMessage(v.message));
}
export function isChatReceiptStatus(v: unknown): v is ChatReceiptStatus {
  return object(v) && keys(v, ["match", "status"]) && typeof v.match === "boolean" && ["available", "downloading", "deleting", "deleted"].includes(String(v.status));
}
export function mergeChatMessages(previous: ChatMessage[], latest: ChatMessagePage) {
  const overlap = latest.messages.some(m => previous.some(p => p.id === m.id));
  const gap = previous.length > 0 && latest.hasMore && !overlap;
  const map = new Map((gap ? [] : previous).map(m => [m.id, m]));
  latest.messages.forEach(m => map.set(m.id, m));
  return { messages: [...map.values()].sort((a, b) => compareChatSequence(a.sequence, b.sequence)), gap };
}
export function formatChatTimestamp(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
export function chatPreviewKind(name: string): "pdf" | "image" | null {
  return /\.pdf$/i.test(name) ? "pdf" : /\.(png|jpe?g|webp|gif)$/i.test(name) ? "image" : null;
}
export function chatUnknownResult(cause: unknown) {
  return !(cause instanceof ApiError) || cause.status === 0 || cause.status === 408 || cause.status >= 500 || (cause.status >= 200 && cause.status < 300);
}
export const newChatRequestId = requestKey;
export function chatError(cause: unknown) {
  return cause instanceof Error ? cause.message : "채팅을 처리하지 못했습니다. 다시 확인하세요.";
}
