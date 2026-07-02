"use server";

import {
  getRecentHistoryPage,
  getRecentPublicApprovalActivityPage,
} from "@/lib/approval-queries";
import { requireUser } from "@/lib/auth";

const homeApprovalActivityPageSize = 5;

export async function getHomePersonalApprovalHistoryPageAction(page: number) {
  const user = await requireUser();

  const personalHistoryPage = await getRecentHistoryPage(user.id, {
    page: normalizePage(page),
    pageSize: homeApprovalActivityPageSize,
  });

  return {
    ok: true,
    data: {
      personalHistoryPage,
    },
  } as const;
}

export async function getHomePublicApprovalActivityPageAction(page: number) {
  await requireUser();

  const publicActivityPage = await getRecentPublicApprovalActivityPage({
    page: normalizePage(page),
    pageSize: homeApprovalActivityPageSize,
  });

  return {
    ok: true,
    data: {
      publicActivityPage,
    },
  } as const;
}

function normalizePage(value: number) {
  return Number.isInteger(value) && value > 0 ? value : 1;
}
