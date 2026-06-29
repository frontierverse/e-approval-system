"use server";

import {
  getCompletedDocumentPage,
  getDraftDocumentPage,
  getInboxDocumentPage,
  getSentDocumentPage,
  type CompletedDocumentArchiveReviewFilter,
  type CompletedDocumentStatusFilter,
  type DocumentPageSort,
  type DraftDocumentStatusFilter,
  type InboxDocumentStatusFilter,
  type SentDocumentStatusFilter,
} from "@/lib/approval-queries";
import { requireUser } from "@/lib/auth";
import { getKoreanDateValue } from "@/lib/document-archive-policy";

const documentPageSize = 8;

export type DocumentListPageActionFilters = {
  dateFrom: string;
  dateTo: string;
  extraParams?: Record<string, string>;
  page: number;
  query: string;
  sort: string;
  status: string;
};

export async function getInboxDocumentPageAction(
  filters: DocumentListPageActionFilters,
) {
  const user = await requireUser();
  const documentPage = await getInboxDocumentPage(user.id, {
    dateFrom: normalizeDate(filters.dateFrom),
    dateTo: normalizeDate(filters.dateTo),
    page: normalizePage(filters.page),
    pageSize: documentPageSize,
    query: normalizeText(filters.query),
    sort: normalizeSort(filters.sort),
    status: normalizeInboxStatus(filters.status),
  });

  return {
    ok: true,
    data: {
      documentPage,
    },
  } as const;
}

export async function getSentDocumentPageAction(
  filters: DocumentListPageActionFilters,
) {
  const user = await requireUser();
  const documentPage = await getSentDocumentPage(user.id, {
    dateFrom: normalizeDate(filters.dateFrom),
    dateTo: normalizeDate(filters.dateTo),
    page: normalizePage(filters.page),
    pageSize: documentPageSize,
    query: normalizeText(filters.query),
    sort: normalizeSort(filters.sort),
    status: normalizeSentStatus(filters.status),
  });

  return {
    ok: true,
    data: {
      documentPage,
    },
  } as const;
}

export async function getDraftDocumentPageAction(
  filters: DocumentListPageActionFilters,
) {
  const user = await requireUser();
  const documentPage = await getDraftDocumentPage(user.id, {
    dateFrom: normalizeDate(filters.dateFrom),
    dateTo: normalizeDate(filters.dateTo),
    page: normalizePage(filters.page),
    pageSize: documentPageSize,
    query: normalizeText(filters.query),
    sort: normalizeSort(filters.sort),
    status: normalizeDraftStatus(filters.status),
  });

  return {
    ok: true,
    data: {
      documentPage,
    },
  } as const;
}

export async function getCompletedDocumentPageAction(
  filters: DocumentListPageActionFilters,
) {
  const user = await requireUser();
  const archiveReview = normalizeArchiveReview(
    filters.extraParams?.archiveReview,
  );
  const todayDate = getKoreanDateValue();
  const dateFrom = normalizeDate(filters.dateFrom);
  const dateTo = normalizeDate(filters.dateTo);
  const shouldDefaultArchiveReviewDates =
    archiveReview === "review" && !dateFrom && !dateTo;
  const documentPage = await getCompletedDocumentPage(user.id, {
    archiveReview,
    dateFrom: shouldDefaultArchiveReviewDates ? todayDate : dateFrom,
    dateTo: shouldDefaultArchiveReviewDates ? todayDate : dateTo,
    page: normalizePage(filters.page),
    pageSize: documentPageSize,
    query: normalizeText(filters.query),
    sort: normalizeSort(filters.sort),
    status: normalizeCompletedStatus(filters.status),
  });

  return {
    ok: true,
    data: {
      documentPage,
    },
  } as const;
}

function normalizeArchiveReview(
  value: string | undefined,
): CompletedDocumentArchiveReviewFilter {
  return value === "review" || value === "today" ? "review" : "none";
}

function normalizeCompletedStatus(value: string): CompletedDocumentStatusFilter {
  return value === "approved" || value === "rejected" ? value : "all";
}

function normalizeDate(value: string) {
  const date = value.trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function normalizeDraftStatus(value: string): DraftDocumentStatusFilter {
  return value === "draft" || value === "recalled" ? value : "all";
}

function normalizeInboxStatus(value: string): InboxDocumentStatusFilter {
  return value === "active" ||
    value === "submitted" ||
    value === "in_progress"
    ? "active"
    : "all";
}

function normalizePage(value: number) {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function normalizeSentStatus(value: string): SentDocumentStatusFilter {
  if (
    value === "active" ||
    value === "submitted" ||
    value === "in_progress" ||
    value === "approved" ||
    value === "rejected"
  ) {
    return value === "submitted" || value === "in_progress" ? "active" : value;
  }

  return "all";
}

function normalizeSort(value: string): DocumentPageSort {
  return value === "oldest" ? "oldest" : "latest";
}

function normalizeText(value: string) {
  return value.trim();
}
