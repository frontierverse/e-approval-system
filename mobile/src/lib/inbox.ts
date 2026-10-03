import type { InboxResponse } from "./types";
export type InboxFilters = {
  query: string;
  dateFrom: string;
  dateTo: string;
  sort: "latest" | "oldest";
  page: number;
};
export type InboxPage = InboxResponse & { page: number; pageSize: number; totalPages: number };
export function inboxPath(filters: InboxFilters) {
  const params = new URLSearchParams({ sort: filters.sort, page: String(filters.page) });
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  return `/inbox?${params}`;
}
