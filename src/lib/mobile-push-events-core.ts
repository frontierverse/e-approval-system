export const pushEventBodies = {
  CHAT_MESSAGE: "새 직원 채팅 메시지가 도착했습니다.",
  CHAT_FILE: "직원 채팅에서 새 파일이 도착했습니다.",
  TASK_ASSIGNED: "새 할 일이 배정되었습니다.",
  TASK_UPDATED: "담당 할 일의 내용이나 마감일이 변경되었습니다.",
  TASK_UNASSIGNED: "할 일의 담당자가 변경되었습니다.",
  TASK_COMPLETED: "배정한 할 일이 완료되었습니다.",
  TASK_REOPENED: "배정한 할 일의 완료가 취소되었습니다.",
  TASK_DELETED: "배정한 할 일이 삭제되었습니다.",
  TASK_DUE: "오늘 마감인 할 일이 있습니다. 내 할 일을 확인하세요.",
  TASK_OVERDUE: "마감일이 지난 할 일이 있습니다. 내 할 일을 확인하세요.",
  RESOURCE_CREATED: "자료실에 새 게시물이 등록되었습니다.",
  RESOURCE_UPDATED: "자료실 게시물의 내용이나 파일이 변경되었습니다.",
  WORK_SCHEDULE_CREATED: "새 공용 업무 일정이 등록되었습니다.",
  WORK_SCHEDULE_UPDATED: "공용 업무 일정의 시간이나 내용이 변경되었습니다.",
  WORK_SCHEDULE_CANCELLED: "공용 업무 일정이 취소되었습니다.",
  WORK_SCHEDULE_REMINDER: "공용 업무 일정이 곧 시작됩니다. 일정을 확인하세요.",
  FEATURE_UPDATE: "새 업무 기능 안내가 등록되었습니다.",
  APPROVAL_RECALLED: "받은 결재 요청이 회수되었습니다.",
  APPROVAL_REMINDER: "하루 이상 대기 중인 결재 요청이 있습니다.",
} as const;
export type PushEventKind = keyof typeof pushEventBodies;
export function isPushEventKind(kind: string): kind is PushEventKind { return Object.hasOwn(pushEventBodies, kind); }
export function pushEventId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value); }
export function pushEventPayload(event: { id: string; kind: string }) {
  if (!pushEventId(event.id) || !isPushEventKind(event.kind)) return null;
  return { title: "바자울", body: pushEventBodies[event.kind], data: { pushEventId: event.id }, channelId: "work", priority: "high" as const, sound: "default" };
}
export function koreanPushClock(now: Date) {
  const local = new Date(now.getTime() + 9 * 60 * 60_000);
  const date = local.toISOString().slice(0, 10), minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  return { date, minute, endOfWork: new Date(`${date}T18:00:00+09:00`) };
}
export function scheduleStart(date: string, minute: number) { return new Date(new Date(`${date}T00:00:00+09:00`).getTime() + minute * 60_000); }
export function isScheduleReminderDue(now: Date, date: string, minute: number) {
  const start = scheduleStart(date, minute).getTime(), time = now.getTime();
  return time >= start - 30 * 60_000 && time < start;
}
