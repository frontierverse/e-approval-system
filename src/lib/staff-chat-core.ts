import { getKoreanDateTimeParts } from "@/lib/korean-date";

export const staffChatBodyMaxLength = 2000;
export const staffChatPageSize = 50;
const staffChatRequestMaxBytes = 16_384;

export function getStaffChatToday(): string {
  const parts = getKoreanDateTimeParts(new Date())!;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isStaffChatEmployeeActive(
  user: { status: string; resignationDate: string | null },
  today = getStaffChatToday(),
): boolean {
  return user.status === "ACTIVE" && (!user.resignationDate || user.resignationDate > today);
}

export class StaffChatError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "StaffChatError";
  }
}

export function parseStaffChatId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new StaffChatError("채팅 요청 정보가 올바르지 않습니다.");
  }
  return value;
}

export function parseStaffChatPeerId(value: unknown, userId: string): string {
  const peerId = parseStaffChatId(value);
  if (peerId === userId) throw new StaffChatError("대화할 다른 직원을 선택해 주세요.");
  return peerId;
}

export function parseStaffChatSend(value: unknown, userId: string) {
  const data = parseObject(value);
  const peerId = parseStaffChatPeerId(data.peerId, userId);
  const requestId = parseStaffChatId(data.requestId);
  if (requestId.length < 8) throw new StaffChatError("메시지 전송 정보가 올바르지 않습니다.");
  if (typeof data.body !== "string" || !data.body.trim()) {
    throw new StaffChatError("메시지를 입력해 주세요.");
  }
  const body = data.body.trim();
  if (body.length > staffChatBodyMaxLength) {
    throw new StaffChatError("메시지는 2,000자 이하로 입력해 주세요.");
  }
  if ([...body].some((character) => character.charCodeAt(0) < 32 && !"\t\n\r".includes(character))) {
    throw new StaffChatError("메시지에 지원하지 않는 문자가 있습니다.");
  }
  return { peerId, body, requestId };
}

export function parseStaffChatRead(value: unknown, userId: string) {
  const data = parseObject(value);
  return {
    peerId: parseStaffChatPeerId(data.peerId, userId),
    messageId: parseStaffChatId(data.messageId),
  };
}

function parseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StaffChatError("채팅 요청 정보가 올바르지 않습니다.");
  }
  return value as Record<string, unknown>;
}

export function assertStaffChatSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new StaffChatError("허용되지 않은 요청입니다.", 403);
  }
  let valid = false;
  try {
    valid = !!origin && new URL(origin).origin === new URL(request.url).origin;
  } catch { /* Invalid or opaque origins are rejected. */ }
  if (!valid) throw new StaffChatError("허용되지 않은 요청입니다.", 403);
}

export async function readStaffChatJson(request: Request): Promise<unknown> {
  assertStaffChatSameOrigin(request);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new StaffChatError("JSON 형식의 요청이 필요합니다.", 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new StaffChatError("채팅 요청 정보가 올바르지 않습니다.");
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > staffChatRequestMaxBytes) {
        await reader.cancel();
        throw new StaffChatError("채팅 요청이 너무 큽니다.", 413);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof StaffChatError) throw error;
    throw new StaffChatError("채팅 요청 정보가 올바르지 않습니다.");
  } finally {
    reader.releaseLock();
  }
}
