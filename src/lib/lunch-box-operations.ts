import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createEmptyLunchBoxDailyOperation,
  createLunchBoxOperationSummary,
  getLunchBoxOperationsMonth,
  getLunchBoxOperationsMonthRange,
  normalizeLunchBoxWorkerType,
  type LunchBoxDailyOperation,
  type LunchBoxOperationMonthSummaryRow,
  type LunchBoxOperationsViewData,
  type LunchBoxWorkerType,
} from "@/lib/lunch-box-operations-core";
import { formatLunchBoxDateValue } from "@/lib/lunch-box-counts-core";

const dailyOperationSelect = {
  date: true,
  version: true,
  updatedAt: true,
  updatedBy: {
    select: { name: true },
  },
  workShifts: {
    orderBy: [{ order: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      order: true,
      workerType: true,
      workerName: true,
      startTime: true,
      endTime: true,
      laborCost: true,
      note: true,
    },
  },
  ingredientPurchases: {
    orderBy: [{ order: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      order: true,
      itemName: true,
      quantity: true,
      unit: true,
      purchaseAmount: true,
      note: true,
    },
  },
} satisfies Prisma.LunchBoxDailyOperationSelect;

type LunchBoxDailyOperationRecord =
  Prisma.LunchBoxDailyOperationGetPayload<{
    select: typeof dailyOperationSelect;
  }>;

export async function getLunchBoxOperationsView({
  date,
}: {
  date: string;
}): Promise<LunchBoxOperationsViewData> {
  const month = getLunchBoxOperationsMonth(date);
  const { start, end } = getLunchBoxOperationsMonthRange(month);
  const dateValue = new Date(`${date}T00:00:00.000Z`);
  const [dailyRecord, monthRecords] = await Promise.all([
    prisma.lunchBoxDailyOperation.findUnique({
      where: { date: dateValue },
      select: dailyOperationSelect,
    }),
    prisma.lunchBoxDailyOperation.findMany({
      where: {
        date: { gte: start, lt: end },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      select: {
        date: true,
        workShifts: {
          orderBy: [{ order: "asc" }, { id: "asc" }],
          select: {
            workerType: true,
            workerName: true,
            startTime: true,
            endTime: true,
            laborCost: true,
          },
        },
        ingredientPurchases: {
          orderBy: [{ order: "asc" }, { id: "asc" }],
          select: {
            itemName: true,
            quantity: true,
            unit: true,
            purchaseAmount: true,
          },
        },
      },
    }),
  ]);

  return {
    dailyOperation: dailyRecord
      ? mapLunchBoxDailyOperation(dailyRecord)
      : createEmptyLunchBoxDailyOperation(date),
    month,
    monthSummary: monthRecords.map(mapLunchBoxOperationMonthSummary),
  };
}

function mapLunchBoxDailyOperation(
  record: LunchBoxDailyOperationRecord,
): LunchBoxDailyOperation {
  return {
    date: formatLunchBoxDateValue(record.date),
    version: record.version,
    updatedAt: record.updatedAt.toISOString(),
    updatedByName: record.updatedBy?.name ?? null,
    workShifts: record.workShifts.map((shift) => ({
      ...shift,
      workerType: normalizeLunchBoxWorkerType(shift.workerType) ?? "TEMPORARY",
      note: shift.note,
    })),
    ingredientPurchases: record.ingredientPurchases.map((purchase) => ({
      ...purchase,
      quantity: purchase.quantity.toString(),
      note: purchase.note,
    })),
  };
}

function mapLunchBoxOperationMonthSummary(
  record: {
    date: Date;
    ingredientPurchases: Array<{
      itemName: string;
      quantity: { toString(): string };
      unit: string;
      purchaseAmount: number;
    }>;
    workShifts: Array<{
      endTime: string;
      laborCost: number | null;
      startTime: string;
      workerName: string;
      workerType: LunchBoxWorkerType;
    }>;
  },
): LunchBoxOperationMonthSummaryRow {
  return {
    date: formatLunchBoxDateValue(record.date),
    ingredientItems: record.ingredientPurchases.map((purchase) => ({
      itemName: purchase.itemName,
      quantity: purchase.quantity.toString(),
      unit: purchase.unit,
    })),
    workShiftItems: record.workShifts.map((shift) => ({
      workerType:
        normalizeLunchBoxWorkerType(shift.workerType) ?? "TEMPORARY",
      workerName: shift.workerName,
      startTime: shift.startTime,
      endTime: shift.endTime,
    })),
    ...createLunchBoxOperationSummary(record),
  };
}
