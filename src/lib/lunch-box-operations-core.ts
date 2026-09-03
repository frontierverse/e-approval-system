import {
  formatLunchBoxDateValue,
  isLunchBoxDate,
  isLunchBoxMonth,
  parseLunchBoxDateValue,
} from "@/lib/lunch-box-counts-core";

export const maxLunchBoxWorkShiftCount = 30;
export const maxLunchBoxIngredientPurchaseCount = 50;
export const lunchBoxWorkerTypes = ["STAFF", "TEMPORARY"] as const;

export type LunchBoxWorkerType = (typeof lunchBoxWorkerTypes)[number];

const maxWorkerNameLength = 50;
const maxIngredientNameLength = 100;
const maxUnitLength = 20;
const maxNoteLength = 200;
const maxWonAmount = 999_999_999;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
const quantityPattern = /^\d{1,9}(?:\.\d{1,3})?$/u;

export type LunchBoxWorkShiftInput = {
  workerType: string;
  workerName: string;
  startTime: string;
  endTime: string;
  laborCost: string;
  note: string;
};

export type LunchBoxIngredientPurchaseInput = {
  itemName: string;
  quantity: string;
  unit: string;
  purchaseAmount: string;
  note: string;
};

export type NormalizedLunchBoxWorkShift = {
  workerType: LunchBoxWorkerType;
  workerName: string;
  startTime: string;
  endTime: string;
  laborCost: number | null;
  note: string | null;
};

export type NormalizedLunchBoxIngredientPurchase = {
  itemName: string;
  quantity: string;
  unit: string;
  purchaseAmount: number;
  note: string | null;
};

export type LunchBoxWorkShift = NormalizedLunchBoxWorkShift & {
  id: string;
  order: number;
};

export type LunchBoxIngredientPurchase =
  NormalizedLunchBoxIngredientPurchase & {
    id: string;
    order: number;
  };

export type LunchBoxDailyOperation = {
  date: string;
  ingredientPurchases: LunchBoxIngredientPurchase[];
  updatedAt: string | null;
  updatedByName: string | null;
  version: number;
  workShifts: LunchBoxWorkShift[];
};

export type LunchBoxOperationMonthSummaryRow = {
  date: string;
  ingredientItems: Array<{
    itemName: string;
    quantity: string;
    unit: string;
  }>;
  ingredientItemCount: number;
  ingredientPurchaseCost: number;
  laborCost: number;
  totalCost: number;
  totalMinutes: number;
  workerCount: number;
  workerNames: string[];
  workShiftItems: Array<{
    endTime: string;
    startTime: string;
    workerName: string;
    workerType: LunchBoxWorkerType;
  }>;
};

export type LunchBoxHiredWorkerShift = {
  endTime: string;
  laborCost: number;
  startTime: string;
  totalMinutes: number;
};

export type LunchBoxHiredWorkerDay = {
  laborCost: number;
  shifts: LunchBoxHiredWorkerShift[];
  totalMinutes: number;
  workerName: string;
};

export type LunchBoxHiredWorkerSummary = {
  laborCost: number;
  totalMinutes: number;
  workdayCount: number;
  workerName: string;
};

export type LunchBoxOperationChartPoint = {
  date: string;
  hiredWorkers: LunchBoxHiredWorkerDay[];
  laborCost: number;
  totalMinutes: number;
};

export type LunchBoxOperationsChartData = {
  endDate: string | null;
  points: LunchBoxOperationChartPoint[];
  startDate: string | null;
  totalLaborCost: number;
  totalMinutes: number;
  workerNames: string[];
  workerSummaries: LunchBoxHiredWorkerSummary[];
};

export type LunchBoxOperationsViewData = {
  dailyOperation: LunchBoxDailyOperation;
  month: string;
  monthSummary: LunchBoxOperationMonthSummaryRow[];
};

export type LunchBoxOperationsValidationResult =
  | {
      ok: true;
      ingredientPurchases: NormalizedLunchBoxIngredientPurchase[];
      workShifts: NormalizedLunchBoxWorkShift[];
    }
  | {
      ok: false;
      error: string;
    };

export function validateLunchBoxOperationsInput({
  ingredientPurchases,
  workShifts,
}: {
  ingredientPurchases: readonly LunchBoxIngredientPurchaseInput[];
  workShifts: readonly LunchBoxWorkShiftInput[];
}): LunchBoxOperationsValidationResult {
  if (workShifts.length > maxLunchBoxWorkShiftCount) {
    return {
      ok: false,
      error: `근무 기록은 하루 ${maxLunchBoxWorkShiftCount}건까지 입력할 수 있습니다.`,
    };
  }

  if (ingredientPurchases.length > maxLunchBoxIngredientPurchaseCount) {
    return {
      ok: false,
      error: `식재료 구매는 하루 ${maxLunchBoxIngredientPurchaseCount}건까지 입력할 수 있습니다.`,
    };
  }

  const normalizedWorkShifts: NormalizedLunchBoxWorkShift[] = [];

  for (const [index, shift] of workShifts.entries()) {
    const rowNumber = index + 1;
    const workerType = normalizeLunchBoxWorkerType(shift.workerType);
    const workerName = normalizeSingleLineText(shift.workerName);
    const startTime = String(shift.startTime ?? "").trim();
    const endTime = String(shift.endTime ?? "").trim();
    const note = normalizeSingleLineText(shift.note);
    const rawLaborCost = String(shift.laborCost ?? "").trim();
    const laborCost =
      workerType === "TEMPORARY"
        ? parseLunchBoxWonInput(rawLaborCost)
        : null;

    if (!workerType) {
      return {
        ok: false,
        error: `근무 ${rowNumber}행의 근무 구분을 다시 선택하세요.`,
      };
    }

    if (!workerName) {
      return {
        ok: false,
        error: `근무 ${rowNumber}행의 근무자명을 입력하세요.`,
      };
    }

    if (workerName.length > maxWorkerNameLength) {
      return {
        ok: false,
        error: `근무 ${rowNumber}행의 근무자명은 ${maxWorkerNameLength}자 이하로 입력하세요.`,
      };
    }

    if (!timePattern.test(startTime) || !timePattern.test(endTime)) {
      return {
        ok: false,
        error: `근무 ${rowNumber}행의 시작·종료 시간을 모두 선택하세요.`,
      };
    }

    if (getLunchBoxShiftMinutes(startTime, endTime) <= 0) {
      return {
        ok: false,
        error: `근무 ${rowNumber}행의 종료 시간은 시작 시간보다 늦어야 합니다.`,
      };
    }

    if (workerType === "STAFF" && rawLaborCost) {
      return {
        ok: false,
        error: `근무 ${rowNumber}행의 직원은 월급 대상이므로 추가 고용비를 입력하지 않습니다.`,
      };
    }

    if (workerType === "TEMPORARY" && laborCost === null) {
      return {
        ok: false,
        error: `근무 ${rowNumber}행의 추가 고용비는 0원 이상 ${maxWonAmount.toLocaleString("ko-KR")}원 이하의 정수로 입력하세요.`,
      };
    }

    if (note.length > maxNoteLength) {
      return {
        ok: false,
        error: `근무 ${rowNumber}행의 비고는 ${maxNoteLength}자 이하로 입력하세요.`,
      };
    }

    normalizedWorkShifts.push({
      workerType,
      workerName,
      startTime,
      endTime,
      laborCost,
      note: note || null,
    });
  }

  const normalizedPurchases: NormalizedLunchBoxIngredientPurchase[] = [];

  for (const [index, purchase] of ingredientPurchases.entries()) {
    const rowNumber = index + 1;
    const itemName = normalizeSingleLineText(purchase.itemName);
    const quantity = normalizeLunchBoxQuantityInput(purchase.quantity);
    const unit = normalizeSingleLineText(purchase.unit);
    const note = normalizeSingleLineText(purchase.note);
    const purchaseAmount = parseLunchBoxWonInput(purchase.purchaseAmount);

    if (!itemName) {
      return {
        ok: false,
        error: `식재료 ${rowNumber}행의 품목명을 입력하세요.`,
      };
    }

    if (itemName.length > maxIngredientNameLength) {
      return {
        ok: false,
        error: `식재료 ${rowNumber}행의 품목명은 ${maxIngredientNameLength}자 이하로 입력하세요.`,
      };
    }

    if (!quantity) {
      return {
        ok: false,
        error: `식재료 ${rowNumber}행의 구매량은 0보다 큰 숫자로 입력하세요. 소수점 셋째 자리까지 입력할 수 있습니다.`,
      };
    }

    if (!unit) {
      return {
        ok: false,
        error: `식재료 ${rowNumber}행의 단위를 입력하세요.`,
      };
    }

    if (unit.length > maxUnitLength) {
      return {
        ok: false,
        error: `식재료 ${rowNumber}행의 단위는 ${maxUnitLength}자 이하로 입력하세요.`,
      };
    }

    if (purchaseAmount === null) {
      return {
        ok: false,
        error: `식재료 ${rowNumber}행의 구매비는 0원 이상 ${maxWonAmount.toLocaleString("ko-KR")}원 이하의 정수로 입력하세요.`,
      };
    }

    if (note.length > maxNoteLength) {
      return {
        ok: false,
        error: `식재료 ${rowNumber}행의 비고는 ${maxNoteLength}자 이하로 입력하세요.`,
      };
    }

    normalizedPurchases.push({
      itemName,
      quantity,
      unit,
      purchaseAmount,
      note: note || null,
    });
  }

  return {
    ok: true,
    ingredientPurchases: normalizedPurchases,
    workShifts: normalizedWorkShifts,
  };
}

export function getLunchBoxShiftMinutes(startTime: string, endTime: string) {
  if (!timePattern.test(startTime) || !timePattern.test(endTime)) {
    return 0;
  }

  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);

  return endHour * 60 + endMinute - (startHour * 60 + startMinute);
}

export function formatLunchBoxWorkMinutes(value: number) {
  const minutes = Math.max(0, Math.floor(value));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes}분`;
  }

  return remainingMinutes > 0
    ? `${hours}시간 ${remainingMinutes}분`
    : `${hours}시간`;
}

export function formatLunchBoxWon(value: number) {
  return `${Math.max(0, Math.floor(value)).toLocaleString("ko-KR")}원`;
}

export function createLunchBoxOperationSummary({
  ingredientPurchases,
  workShifts,
}: {
  ingredientPurchases: readonly Pick<
    NormalizedLunchBoxIngredientPurchase,
    "purchaseAmount"
  >[];
  workShifts: readonly Pick<
    NormalizedLunchBoxWorkShift,
    "endTime" | "laborCost" | "startTime" | "workerName" | "workerType"
  >[];
}) {
  const workerNames = Array.from(
    new Set(
      workShifts
        .map((shift) => normalizeSingleLineText(shift.workerName))
        .filter(Boolean),
    ),
  );
  const totalMinutes = workShifts.reduce(
    (sum, shift) =>
      sum + Math.max(0, getLunchBoxShiftMinutes(shift.startTime, shift.endTime)),
    0,
  );
  const laborCost = workShifts.reduce(
    (sum, shift) =>
      sum +
      (shift.workerType !== "TEMPORARY" || shift.laborCost === null
        ? 0
        : Math.max(0, Math.floor(shift.laborCost))),
    0,
  );
  const ingredientPurchaseCost = ingredientPurchases.reduce(
    (sum, purchase) =>
      sum + Math.max(0, Math.floor(purchase.purchaseAmount)),
    0,
  );

  return {
    ingredientItemCount: ingredientPurchases.length,
    ingredientPurchaseCost,
    laborCost,
    totalCost: laborCost + ingredientPurchaseCost,
    totalMinutes,
    workerCount: workerNames.length,
    workerNames,
  };
}

export function createLunchBoxOperationsChartData(
  rows: readonly {
    date: string;
    workShifts: readonly Pick<
      NormalizedLunchBoxWorkShift,
      "endTime" | "laborCost" | "startTime" | "workerName" | "workerType"
    >[];
  }[],
): LunchBoxOperationsChartData {
  const points = rows
    .map(({ date, workShifts }) => {
      const hiredWorkersByName = new Map<string, LunchBoxHiredWorkerDay>();

      for (const shift of workShifts) {
        if (shift.workerType !== "TEMPORARY") {
          continue;
        }

        const workerName = normalizeSingleLineText(shift.workerName);

        if (!workerName) {
          continue;
        }

        const totalMinutes = Math.max(
          0,
          getLunchBoxShiftMinutes(shift.startTime, shift.endTime),
        );
        const laborCost = Math.max(0, Math.floor(shift.laborCost ?? 0));
        const worker = hiredWorkersByName.get(workerName) ?? {
          laborCost: 0,
          shifts: [],
          totalMinutes: 0,
          workerName,
        };

        worker.laborCost += laborCost;
        worker.totalMinutes += totalMinutes;
        worker.shifts.push({
          endTime: shift.endTime,
          laborCost,
          startTime: shift.startTime,
          totalMinutes,
        });
        hiredWorkersByName.set(workerName, worker);
      }

      const hiredWorkers = Array.from(hiredWorkersByName.values()).sort(
        (left, right) => left.workerName.localeCompare(right.workerName, "ko"),
      );

      return {
        date,
        hiredWorkers,
        laborCost: hiredWorkers.reduce(
          (sum, worker) => sum + worker.laborCost,
          0,
        ),
        totalMinutes: hiredWorkers.reduce(
          (sum, worker) => sum + worker.totalMinutes,
          0,
        ),
      };
    })
    .filter((point) => point.hiredWorkers.length > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
  const workerSummariesByName = new Map<
    string,
    LunchBoxHiredWorkerSummary
  >();

  for (const point of points) {
    for (const worker of point.hiredWorkers) {
      const summary = workerSummariesByName.get(worker.workerName) ?? {
        laborCost: 0,
        totalMinutes: 0,
        workdayCount: 0,
        workerName: worker.workerName,
      };

      summary.laborCost += worker.laborCost;
      summary.totalMinutes += worker.totalMinutes;
      summary.workdayCount += 1;
      workerSummariesByName.set(worker.workerName, summary);
    }
  }

  const workerSummaries = Array.from(workerSummariesByName.values()).sort(
    (left, right) => left.workerName.localeCompare(right.workerName, "ko"),
  );

  return {
    endDate: points.at(-1)?.date ?? null,
    points,
    startDate: points[0]?.date ?? null,
    totalLaborCost: points.reduce(
      (sum, point) => sum + point.laborCost,
      0,
    ),
    totalMinutes: points.reduce(
      (sum, point) => sum + point.totalMinutes,
      0,
    ),
    workerNames: workerSummaries.map((worker) => worker.workerName),
    workerSummaries,
  };
}

export function getLunchBoxWorkerTypeLabel(value: LunchBoxWorkerType) {
  return value === "STAFF" ? "직원(월급)" : "별도 고용";
}

export function getLunchBoxOperationsMonthRange(month: string) {
  if (!isLunchBoxMonth(month)) {
    throw new Error("올바른 월을 입력하세요.");
  }

  const start = parseLunchBoxDateValue(`${month}-01`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  return { start, end };
}

export function getLunchBoxOperationsMonth(date: string) {
  return isLunchBoxDate(date) ? date.slice(0, 7) : "";
}

export function createEmptyLunchBoxDailyOperation(
  date: string,
): LunchBoxDailyOperation {
  const normalizedDate = isLunchBoxDate(date)
    ? date
    : formatLunchBoxDateValue(new Date());

  return {
    date: normalizedDate,
    ingredientPurchases: [],
    updatedAt: null,
    updatedByName: null,
    version: 0,
    workShifts: [],
  };
}

function parseLunchBoxWonInput(value: unknown) {
  const normalized = String(value ?? "")
    .replaceAll(",", "")
    .trim();

  if (!/^\d+$/u.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= maxWonAmount
    ? parsed
    : null;
}

function normalizeLunchBoxQuantityInput(value: unknown) {
  const normalized = String(value ?? "").trim();

  if (!quantityPattern.test(normalized) || Number(normalized) <= 0) {
    return "";
  }

  return normalized
    .replace(/^0+(?=\d)/u, "")
    .replace(/(\.\d*?[1-9])0+$/u, "$1")
    .replace(/\.0+$/u, "");
}

function normalizeSingleLineText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeLunchBoxWorkerType(
  value: unknown,
): LunchBoxWorkerType | null {
  return lunchBoxWorkerTypes.includes(value as LunchBoxWorkerType)
    ? (value as LunchBoxWorkerType)
    : null;
}
