export function workPushEventId(data: unknown): string | null {
  const id = data && typeof data === "object" && "pushEventId" in data ? data.pushEventId : null;
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : null;
}
// Server responses are validated too: never navigate to an arbitrary URL or an
// admin-only route supplied by a notification or a stale session response.
export function workPushHref(value: unknown): value is string {
  return typeof value === "string" && /^(?:\/chat\/[A-Za-z0-9_-]{1,100}|\/tasks(?:\/[A-Za-z0-9_-]{1,100}(?:\?assigned=1)?|\?status=overdue)?|\/resources\/[A-Za-z0-9_-]{1,100}|\/work-schedules(?:\/[A-Za-z0-9_-]{1,100})?|\/documents\/[A-Za-z0-9_-]{1,100}|\/inbox|\/app-updates)$/.test(value);
}
