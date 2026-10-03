export type MobileNotificationFilters = { filter: "all" | "unread"; page: number };
export const mobileNotificationPageSize = 20;

export function parseMobileNotificationFilters(params: URLSearchParams):
  | { ok: true; filters: MobileNotificationFilters }
  | { ok: false; error: string } {
  const filter = params.get("filter") ?? "all";
  if (filter !== "all" && filter !== "unread") return { ok: false, error: "알림 필터가 올바르지 않습니다." };
  const rawPage = params.get("page") ?? "1";
  const page = Number(rawPage);
  if (!/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(page)) return { ok: false, error: "페이지가 올바르지 않습니다." };
  return { ok: true, filters: { filter, page } };
}

export function validMobileNotificationId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
}
