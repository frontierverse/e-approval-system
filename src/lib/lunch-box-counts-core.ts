import { getKoreanDateValue } from "@/lib/document-archive-policy";

export const lunchBoxSchoolTypes = [
  { value: "elementary", label: "초등학교" },
  { value: "kindergarten", label: "병설유치원" },
] as const;

export const lunchBoxCountFields = [
  "preservationCount",
  "deliveryDriverCount",
  "class1Count",
  "class2Count",
  "class3Count",
  "class4Count",
  "linkedCount",
] as const;

export const lunchBoxCountFieldLabels: Record<
  (typeof lunchBoxCountFields)[number],
  string
> = {
  preservationCount: "보존식",
  deliveryDriverCount: "배송기사",
  class1Count: "1반",
  class2Count: "2반",
  class3Count: "3반",
  class4Count: "4반",
  linkedCount: "연계형",
};

export const lunchBoxServingCountFields = [
  "class1Count",
  "class2Count",
  "class3Count",
  "class4Count",
  "linkedCount",
] as const;

export const lunchBoxDailyChecklistColumnCount = 3;
export const lunchBoxDailyChecklistShortFieldLabels: Record<
  (typeof lunchBoxServingCountFields)[number],
  string
> = {
  class1Count: "1반",
  class2Count: "2반",
  class3Count: "3반",
  class4Count: "4반",
  linkedCount: "연계",
};

export const lunchBoxPreservationClasses = [1, 2, 3, 4] as const;
export const lunchBoxCountChangeLogPageSize = 10;
export const lunchBoxDailyCheckHistoryPageSize = 10;

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];
const lunchBoxMenuMarkerPattern =
  /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳★]/gu;
const lunchBoxPackingSchoolName = "남초";

export const lunchBoxCalendarWeekdays = [
  { value: 0, label: "일" },
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
] as const;

export type LunchBoxCalendarWeekday =
  (typeof lunchBoxCalendarWeekdays)[number]["value"];

export type LunchBoxCalendarDay = {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  weekday: LunchBoxCalendarWeekday;
};

export type LunchBoxSchoolType = (typeof lunchBoxSchoolTypes)[number]["value"];
export type LunchBoxCountField = (typeof lunchBoxCountFields)[number];
export type LunchBoxPreservationClass =
  (typeof lunchBoxPreservationClasses)[number];

export type LunchBoxSchool = {
  id: string;
  name: string;
  preservationClass: LunchBoxPreservationClass | null;
  type: LunchBoxSchoolType;
  order: number;
  active: boolean;
};

export type LunchBoxCountValues = Record<LunchBoxCountField, number>;

export type LunchBoxCountRow = LunchBoxCountValues & {
  schoolId: string;
  schoolName: string;
  preservationClass: LunchBoxPreservationClass | null;
  schoolType: LunchBoxSchoolType;
};

export type LunchBoxCountGrid = {
  date: string;
  menuItems: string[];
  rows: LunchBoxCountRow[];
};

export type LunchBoxCountRealtimeMergeResult = {
  conflictingFieldCount: number;
  conflictingSchoolCount: number;
  edits: Record<string, LunchBoxCountValues>;
  grid: LunchBoxCountGrid;
  unavailableSchoolCount: number;
};

export type LunchBoxDailySchoolChecklistData = {
  checkedSchoolIds: string[];
  grid: LunchBoxCountGrid;
};

export type LunchBoxDailyChecklistView = {
  checkedCount: number;
  checkedSchoolIds: string[];
  columns: LunchBoxCountRow[][];
  dateLabel: string;
  hasDeliveryDriver: boolean;
  preservationTotal: number;
  progressLabel: string | null;
  remainingCount: number;
  rows: LunchBoxCountRow[];
  summaryLabel: string;
  totalCount: number;
  visibleServingFields: LunchBoxServingCountField[];
};

export type LunchBoxSchoolChecklistData = {
  checkedSchoolIds: string[];
};

export type LunchBoxStatusCountGroup = {
  groupCount: number;
  personCount: number;
};

export type LunchBoxStatusSummary = {
  deliveryDriverCount: number;
  elementaryServingCount: number;
  groupDistribution: LunchBoxStatusCountGroup[];
  kindergartenCount: number;
  namchoLunchBoxCount: number;
  preservationCount: number;
  totalCount: number;
};

export type LunchBoxCountRowInput = LunchBoxCountValues & {
  schoolId: string;
};

export type LunchBoxServingCountField =
  (typeof lunchBoxServingCountFields)[number];

export type LunchBoxServingOrderItem = {
  count: number;
  field: LunchBoxServingCountField;
  label: string;
  schoolId: string;
  schoolName: string;
};

export type LunchBoxServingOrderGroups = {
  servingItems: LunchBoxServingOrderItem[];
  packingItems: LunchBoxServingOrderItem[];
};

export type LunchBoxChecklistChip = {
  field: LunchBoxServingCountField;
  label: string;
  value: number;
};

export type LunchBoxChecklistRow = {
  classChips: LunchBoxChecklistChip[];
  deliveryDriverCount: number;
  preservationClass: LunchBoxPreservationClass | null;
  preservationCount: number;
  preservationLabel: string | null;
  schoolId: string;
  schoolName: string;
  schoolType: LunchBoxSchoolType;
  servingCounts: Record<LunchBoxServingCountField, number>;
  total: number;
};


export type LunchBoxDailyCountRecord = LunchBoxCountValues & {
  date: string;
  schoolId: string;
};

export type LunchBoxFixedCountRow = LunchBoxChecklistRow & {
  countSnapshot?: string;
  currentCountStartDate: string;
  firstDate: string;
  lastDate: string;
  supplyDayCount: number;
  varianceNote: string | null;
};

export type LunchBoxFixedCountList = {
  hasDeliveryDriver: boolean;
  idleSchoolNames: string[];
  preservationTotal: number;
  rows: LunchBoxFixedCountRow[];
  totalCount: number;
  varyingSchoolNames: string[];
  visibleServingFields: LunchBoxServingCountField[];
};

export type LunchBoxCountMonthDaySchool = {
  schoolId: string;
  schoolName: string;
  schoolType: LunchBoxSchoolType;
  total: number;
};

export type LunchBoxCountMonthDay = {
  date: string;
  menuItems: string[];
  totalCount: number;
  schools: LunchBoxCountMonthDaySchool[];
};

export type LunchBoxCountMonth = {
  month: string;
  days: Record<string, LunchBoxCountMonthDay>;
};

export type LunchBoxChartRow = LunchBoxCountValues & {
  date: string;
  schoolId: string;
  schoolName: string;
  schoolOrder: number;
  schoolType: LunchBoxSchoolType;
};

export type LunchBoxChartPoint = {
  date: string;
  preservationCount: number;
  totalCount: number;
};

export type LunchBoxChartSchoolSeries = {
  points: LunchBoxChartPoint[];
  schoolId: string;
  schoolName: string;
  schoolType: LunchBoxSchoolType;
};

export type LunchBoxChartData = {
  dailySeries: LunchBoxChartPoint[];
  endDate: string | null;
  schoolSeries: LunchBoxChartSchoolSeries[];
  serviceDates: string[];
  startDate: string | null;
};

export type LunchBoxCountFieldChange = {
  field: LunchBoxCountField;
  previous: number;
  next: number;
};

export type LunchBoxCountSchoolChange = {
  schoolId: string;
  schoolName: string;
  changes: LunchBoxCountFieldChange[];
};

export type LunchBoxCountChangeDetail = {
  date: string;
  schools: LunchBoxCountSchoolChange[];
};

export type LunchBoxCountChangeLog = LunchBoxCountChangeDetail & {
  id: string;
  message: string | null;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    departmentName: string;
    positionName: string;
    profileImageStorageKey: string | null;
    profileImageUpdatedAt: string | null;
  };
};

export type LunchBoxCountChangeLogPage = {
  logs: LunchBoxCountChangeLog[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type LunchBoxDailyCheckHistorySchool = {
  schoolId: string;
  schoolName: string;
};

export type LunchBoxDailyCheckHistoryLog = {
  id: string;
  date: string;
  isChecked: boolean | null;
  schools: LunchBoxDailyCheckHistorySchool[];
  message: string | null;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    departmentName: string;
    positionName: string;
    profileImageStorageKey: string | null;
    profileImageUpdatedAt: string | null;
  };
};

export type LunchBoxDailyCheckHistoryPage = {
  logs: LunchBoxDailyCheckHistoryLog[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type LunchBoxSchoolFormValues = {
  name: string;
  preservationClass: string;
  type: string;
};

export type LunchBoxSchoolFormState = {
  error?: string;
  resetKey?: string;
  success?: string;
  values?: LunchBoxSchoolFormValues;
};

export type LunchBoxActionResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

export function isLunchBoxSchoolType(
  value: string,
): value is LunchBoxSchoolType {
  return lunchBoxSchoolTypes.some((type) => type.value === value);
}

export function normalizeLunchBoxSchoolType(
  value: string | undefined,
): LunchBoxSchoolType {
  return value && isLunchBoxSchoolType(value) ? value : "elementary";
}

export function getLunchBoxSchoolTypeLabel(type: string) {
  return (
    lunchBoxSchoolTypes.find((item) => item.value === type)?.label ?? "기타"
  );
}

export function normalizeLunchBoxSchoolName(value: unknown) {
  const name = String(value ?? "").trim();

  if (name === "이리초" || name === "익산초") {
    return name;
  }

  return name.replace(/^(?:이리|익산)/, "").trim();
}

export function isLunchBoxPackingSchool(
  row: Pick<LunchBoxCountRow, "schoolName" | "schoolType">,
) {
  return (
    row.schoolType === "kindergarten" ||
    (row.schoolType === "elementary" &&
      normalizeLunchBoxSchoolName(row.schoolName) === lunchBoxPackingSchoolName)
  );
}

export function isLunchBoxPreservationClassValue(
  value: number,
): value is LunchBoxPreservationClass {
  return lunchBoxPreservationClasses.some((item) => item === value);
}

export function normalizeLunchBoxPreservationClass(
  value: unknown,
): LunchBoxPreservationClass | null {
  const parsed = Number(value);

  return isLunchBoxPreservationClassValue(parsed) ? parsed : null;
}

export function resolveLunchBoxPreservationClassForUpdate({
  previousClass,
  submitted,
  value,
}: {
  previousClass: number | null;
  submitted: boolean;
  value: unknown;
}) {
  return submitted
    ? normalizeLunchBoxPreservationClass(value)
    : normalizeLunchBoxPreservationClass(previousClass);
}

export function getLunchBoxPreservationClassLabel(value: number | null) {
  return value ? `${value}반` : "지정반 없음";
}

export function normalizeLunchBoxSchoolFormValues(
  formData: FormData,
): LunchBoxSchoolFormValues {
  return {
    name: normalizeLunchBoxSchoolName(formData.get("name")),
    preservationClass: String(formData.get("preservationClass") ?? ""),
    type: String(formData.get("type") ?? ""),
  };
}

export function normalizeLunchBoxCountValue(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}

export function normalizeLunchBoxMenuItems(values: readonly unknown[]) {
  return values.flatMap((value) => {
    const item = String(value ?? "")
      .replace(lunchBoxMenuMarkerPattern, "")
      .replace(/\s+/gu, " ")
      .trim();

    return item ? [item] : [];
  });
}

export function formatLunchBoxMenuItems(values: readonly unknown[]) {
  return normalizeLunchBoxMenuItems(values).join(", ");
}

export function parseLunchBoxCountChangeDetail(
  metadata: unknown,
  fallbackDate = "",
): LunchBoxCountChangeDetail {
  const metadataRecord = getLunchBoxMetadataRecord(metadata);
  const metadataDate = metadataRecord?.date;
  const date =
    typeof metadataDate === "string" && isLunchBoxDate(metadataDate)
      ? metadataDate
      : isLunchBoxDate(fallbackDate)
        ? fallbackDate
        : "";
  const schoolRecords = Array.isArray(metadataRecord?.schools)
    ? metadataRecord.schools
    : [];
  const schools = schoolRecords.flatMap((schoolValue) => {
    const schoolRecord = getLunchBoxMetadataRecord(schoolValue);
    const next = getLunchBoxMetadataRecord(schoolRecord?.next);

    if (!schoolRecord || !next) {
      return [];
    }

    const previous = getLunchBoxMetadataRecord(schoolRecord.previous);
    const changes = lunchBoxCountFields.flatMap((field) => {
      if (!Object.prototype.hasOwnProperty.call(next, field)) {
        return [];
      }

      const previousCount = previous
        ? normalizeLunchBoxCountValue(previous[field])
        : 0;
      const nextCount = normalizeLunchBoxCountValue(next[field]);

      return previousCount === nextCount
        ? []
        : [
            {
              field,
              previous: previousCount,
              next: nextCount,
            },
          ];
    });

    if (changes.length === 0) {
      return [];
    }

    return [
      {
        schoolId:
          typeof schoolRecord.schoolId === "string"
            ? schoolRecord.schoolId
            : "",
        schoolName:
          typeof schoolRecord.schoolName === "string" &&
          schoolRecord.schoolName.trim()
            ? schoolRecord.schoolName.trim()
            : "학교명 미상",
        changes,
      },
    ];
  });

  return { date, schools };
}

export function parseLunchBoxDailyCheckHistoryDetail(
  metadata: unknown,
  fallbackDate = "",
) {
  const metadataRecord = getLunchBoxMetadataRecord(metadata);
  const metadataDate = metadataRecord?.date;
  const date =
    typeof metadataDate === "string" && isLunchBoxDate(metadataDate)
      ? metadataDate
      : isLunchBoxDate(fallbackDate)
        ? fallbackDate
        : "";
  const isChecked =
    typeof metadataRecord?.nextChecked === "boolean"
      ? metadataRecord.nextChecked
      : metadataRecord?.changeType === "lunchBoxDailySchoolCheck.clear"
        ? false
        : null;
  const directSchoolId =
    typeof metadataRecord?.schoolId === "string"
      ? metadataRecord.schoolId.trim()
      : "";
  const directSchoolName =
    typeof metadataRecord?.schoolName === "string"
      ? metadataRecord.schoolName.trim()
      : "";
  const directSchool =
    directSchoolId || directSchoolName
      ? [
          {
            schoolId: directSchoolId,
            schoolName: directSchoolName || "학교명 미상",
          },
        ]
      : [];
  const aggregateSchools = Array.isArray(metadataRecord?.schools)
    ? metadataRecord.schools.flatMap((schoolValue) => {
        const schoolRecord = getLunchBoxMetadataRecord(schoolValue);

        if (!schoolRecord) {
          return [];
        }

        const schoolId =
          typeof schoolRecord.schoolId === "string"
            ? schoolRecord.schoolId.trim()
            : "";
        const schoolName =
          typeof schoolRecord.schoolName === "string" &&
          schoolRecord.schoolName.trim()
            ? schoolRecord.schoolName.trim()
            : "";

        return schoolId || schoolName
          ? [
              {
                schoolId,
                schoolName: schoolName || "학교명 미상",
              },
            ]
          : [];
      })
    : [];
  const schools = Array.from(
    new Map(
      [...directSchool, ...aggregateSchools].map((school) => [
        `${school.schoolId}\u0000${school.schoolName}`,
        school,
      ]),
    ).values(),
  );

  return { date, isChecked, schools };
}

export function normalizeLunchBoxPreservationCountForSave(
  values: { preservationCount?: unknown },
  previousCount: number,
) {
  return Object.prototype.hasOwnProperty.call(values, "preservationCount")
    ? normalizeLunchBoxCountValue(values.preservationCount)
    : normalizeLunchBoxCountValue(previousCount);
}

export function normalizeLunchBoxDeliveryDriverCountForSave(
  values: { deliveryDriverCount?: unknown },
  previousCount: number,
) {
  return Object.prototype.hasOwnProperty.call(values, "deliveryDriverCount")
    ? normalizeLunchBoxCountValue(values.deliveryDriverCount)
    : normalizeLunchBoxCountValue(previousCount);
}

export function getLunchBoxCountTotal(values: LunchBoxCountValues): number {
  return lunchBoxCountFields.reduce((sum, field) => sum + values[field], 0);
}

export function getLunchBoxChartCount(
  point: Pick<LunchBoxChartPoint, "preservationCount" | "totalCount">,
  includePreservation: boolean,
) {
  return includePreservation
    ? point.totalCount
    : point.totalCount - point.preservationCount;
}

export function createLunchBoxChartData(
  rows: readonly LunchBoxChartRow[],
): LunchBoxChartData {
  type ChartPointCounts = Pick<
    LunchBoxChartPoint,
    "preservationCount" | "totalCount"
  >;
  type SchoolBucket = Omit<LunchBoxChartSchoolSeries, "points"> & {
    pointsByDate: Map<string, ChartPointCounts>;
    schoolOrder: number;
  };

  const dailyCountsByDate = new Map<string, ChartPointCounts>();
  const schoolsById = new Map<string, SchoolBucket>();

  for (const row of rows) {
    if (!isLunchBoxDate(row.date)) {
      continue;
    }

    const weekday = parseLunchBoxDateValue(row.date).getUTCDay();

    if (weekday === 0 || weekday === 6) {
      continue;
    }

    const totalCount = getLunchBoxCountTotal(row);

    if (totalCount < 1) {
      continue;
    }

    const dailyCounts = dailyCountsByDate.get(row.date);

    if (dailyCounts) {
      dailyCounts.totalCount += totalCount;
      dailyCounts.preservationCount += row.preservationCount;
    } else {
      dailyCountsByDate.set(row.date, {
        preservationCount: row.preservationCount,
        totalCount,
      });
    }

    let school = schoolsById.get(row.schoolId);

    if (!school) {
      school = {
        pointsByDate: new Map(),
        schoolId: row.schoolId,
        schoolName: row.schoolName,
        schoolOrder: row.schoolOrder,
        schoolType: row.schoolType,
      };
      schoolsById.set(row.schoolId, school);
    }

    const schoolPoint = school.pointsByDate.get(row.date);

    if (schoolPoint) {
      schoolPoint.totalCount += totalCount;
      schoolPoint.preservationCount += row.preservationCount;
    } else {
      school.pointsByDate.set(row.date, {
        preservationCount: row.preservationCount,
        totalCount,
      });
    }
  }

  const serviceDates = Array.from(dailyCountsByDate.keys()).sort();
  const dailySeries = serviceDates.map((date) => ({
    date,
    ...dailyCountsByDate.get(date)!,
  }));
  const schoolSeries = Array.from(schoolsById.values())
    .sort(
      (left, right) =>
        left.schoolOrder - right.schoolOrder ||
        left.schoolName.localeCompare(right.schoolName, "ko-KR") ||
        left.schoolId.localeCompare(right.schoolId),
    )
    .map(
      ({
        pointsByDate,
        schoolId,
        schoolName,
        schoolType,
      }): LunchBoxChartSchoolSeries => ({
        points: serviceDates.map((date) => ({
          date,
          preservationCount:
            pointsByDate.get(date)?.preservationCount ?? 0,
          totalCount: pointsByDate.get(date)?.totalCount ?? 0,
        })),
        schoolId,
        schoolName,
        schoolType,
      }),
    );

  return {
    dailySeries,
    endDate: serviceDates.at(-1) ?? null,
    schoolSeries,
    serviceDates,
    startDate: serviceDates[0] ?? null,
  };
}

export function createLunchBoxServingOrderGroups(
  rows: readonly LunchBoxCountRow[],
): LunchBoxServingOrderGroups {
  type IndexedItem = {
    item: LunchBoxServingOrderItem;
    sourceIndex: number;
  };

  const servingItems: IndexedItem[] = [];
  const packingItems: IndexedItem[] = [];

  rows.forEach((row, rowIndex) => {
    const targetItems = isLunchBoxPackingSchool(row)
      ? packingItems
      : servingItems;

    lunchBoxServingCountFields.forEach((field, fieldIndex) => {
      const count = row[field];

      if (count <= 0) {
        return;
      }

      targetItems.push({
        item: {
          count,
          field,
          label: lunchBoxCountFieldLabels[field],
          schoolId: row.schoolId,
          schoolName: row.schoolName,
        },
        sourceIndex:
          rowIndex * lunchBoxServingCountFields.length + fieldIndex,
      });
    });
  });

  const sortItems = (items: IndexedItem[]) =>
    items
      .sort(
        (left, right) =>
          right.item.count - left.item.count ||
          left.sourceIndex - right.sourceIndex,
      )
      .map(({ item }) => item);

  return {
    servingItems: sortItems(servingItems),
    packingItems: sortItems(packingItems),
  };
}

export function hasLunchBoxStatusData(grid: LunchBoxCountGrid) {
  return (
    grid.menuItems.length > 0 ||
    grid.rows.some((row) => getLunchBoxCountTotal(row) > 0)
  );
}

export function createLunchBoxStatusSummary(
  rows: readonly LunchBoxCountRow[],
): LunchBoxStatusSummary {
  const groupCounts = new Map<number, number>();
  let deliveryDriverCount = 0;
  let elementaryServingCount = 0;
  let kindergartenCount = 0;
  let namchoLunchBoxCount = 0;
  let preservationCount = 0;
  let totalCount = 0;

  for (const row of rows) {
    deliveryDriverCount += row.deliveryDriverCount;
    preservationCount += row.preservationCount;
    totalCount += getLunchBoxCountTotal(row);

    const servingCounts = [
      row.class1Count,
      row.class2Count,
      row.class3Count,
      row.class4Count,
      row.linkedCount,
    ];
    const schoolServingCount = servingCounts.reduce(
      (sum, count) => sum + count,
      0,
    );

    if (isLunchBoxPackingSchool(row)) {
      if (row.schoolType === "kindergarten") {
        kindergartenCount += schoolServingCount;
      } else {
        namchoLunchBoxCount += schoolServingCount;
      }

      continue;
    }

    elementaryServingCount += schoolServingCount;

    for (const personCount of servingCounts) {
      if (personCount < 1) {
        continue;
      }

      groupCounts.set(personCount, (groupCounts.get(personCount) ?? 0) + 1);
    }
  }

  return {
    deliveryDriverCount,
    elementaryServingCount,
    groupDistribution: Array.from(
      groupCounts,
      ([personCount, groupCount]) => ({ groupCount, personCount }),
    ).sort((left, right) => right.personCount - left.personCount),
    kindergartenCount,
    namchoLunchBoxCount,
    preservationCount,
    totalCount,
  };
}

export function formatLunchBoxPreservationChipLabel(
  count: number,
  preservationClass: LunchBoxPreservationClass | null,
) {
  if (count < 1) {
    return null;
  }

  return `보존식 ${count}(${preservationClass ? `${preservationClass}반` : "반 미지정"})`;
}

// 날짜별 기록을 학교 단위 한 줄로 접되, 가장 최근 공급일의 양수 수량을 표시한다.
// 값이 바뀐 학교는 최근 값이 연속으로 이어지기 시작한 공급일과 varianceNote를 함께
// 제공해 과거에 더 자주 쓰인 수량이 현재 수량처럼 보이지 않게 한다.
export function createLunchBoxFixedCountList({
  counts,
  schools,
}: {
  counts: readonly LunchBoxDailyCountRecord[];
  schools: readonly LunchBoxSchool[];
}): LunchBoxFixedCountList {
  const countsBySchoolId = new Map<string, LunchBoxDailyCountRecord[]>();

  for (const count of counts) {
    if (getLunchBoxCountTotal(count) < 1) {
      continue;
    }

    const bucket = countsBySchoolId.get(count.schoolId);

    if (bucket) {
      bucket.push(count);
    } else {
      countsBySchoolId.set(count.schoolId, [count]);
    }
  }

  const idleSchoolNames: string[] = [];
  const varyingSchoolNames: string[] = [];
  const rows: LunchBoxFixedCountRow[] = [];
  let hasDeliveryDriver = false;
  let preservationTotal = 0;
  let totalCount = 0;

  for (const school of schools) {
    const schoolCounts = countsBySchoolId.get(school.id);

    if (!schoolCounts || schoolCounts.length === 0) {
      idleSchoolNames.push(school.name);
      continue;
    }

    const orderedSchoolCounts = [...schoolCounts].sort((left, right) =>
      left.date < right.date ? -1 : left.date > right.date ? 1 : 0,
    );
    const groups = new Map<string, { count: number; values: LunchBoxCountValues }>();

    for (const record of orderedSchoolCounts) {
      const values = pickLunchBoxCountValues(record);
      const key = getLunchBoxCountValuesKey(values);
      const group = groups.get(key);

      if (group) {
        group.count += 1;
      } else {
        groups.set(key, { count: 1, values });
      }
    }

    const currentRecord = orderedSchoolCounts[orderedSchoolCounts.length - 1];
    const currentValues = pickLunchBoxCountValues(currentRecord);
    const currentKey = getLunchBoxCountValuesKey(currentValues);
    const currentGroup = groups.get(currentKey);
    let currentCountStartDate = currentRecord.date;

    for (let index = orderedSchoolCounts.length - 2; index >= 0; index -= 1) {
      const previousRecord = orderedSchoolCounts[index];

      if (
        getLunchBoxCountValuesKey(pickLunchBoxCountValues(previousRecord)) !==
        currentKey
      ) {
        break;
      }

      currentCountStartDate = previousRecord.date;
    }

    const otherValueCount = groups.size - 1;
    const dates = orderedSchoolCounts.map((record) => record.date);
    const total = getLunchBoxCountTotal(currentValues);

    if (otherValueCount > 0) {
      varyingSchoolNames.push(school.name);
    }

    hasDeliveryDriver =
      hasDeliveryDriver || currentValues.deliveryDriverCount > 0;
    preservationTotal += currentValues.preservationCount;
    totalCount += total;
    rows.push({
      classChips: lunchBoxServingCountFields.flatMap((field) =>
        currentValues[field] < 1
          ? []
          : [
              {
                field,
                label: lunchBoxCountFieldLabels[field],
                value: currentValues[field],
              },
            ],
      ),
      currentCountStartDate,
      deliveryDriverCount: currentValues.deliveryDriverCount,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      preservationClass: school.preservationClass,
      preservationCount: currentValues.preservationCount,
      preservationLabel: formatLunchBoxPreservationChipLabel(
        currentValues.preservationCount,
        school.preservationClass,
      ),
      schoolId: school.id,
      schoolName: school.name,
      schoolType: school.type,
      servingCounts: {
        class1Count: currentValues.class1Count,
        class2Count: currentValues.class2Count,
        class3Count: currentValues.class3Count,
        class4Count: currentValues.class4Count,
        linkedCount: currentValues.linkedCount,
      },
      supplyDayCount: schoolCounts.length,
      total,
      varianceNote:
        otherValueCount === 0
          ? null
          : `전체 ${schoolCounts.length}일 중 최신 수량 ${currentGroup?.count ?? 0}일 · 이전 수량 ${otherValueCount}종`,
    });
  }

  const visibleServingFields = lunchBoxServingCountFields.filter((field) =>
    rows.some((row) => row.servingCounts[field] > 0),
  );

  return {
    hasDeliveryDriver,
    idleSchoolNames,
    preservationTotal,
    rows: sortLunchBoxFixedCountRows(rows),
    totalCount,
    varyingSchoolNames,
    visibleServingFields,
  };
}

// 전체 공급기간에서 가장 먼저 공급을 시작하는 학교가 위로 온다.
// 같은 날 시작하는 학교끼리는 기존 학교 순서를 유지한다.
export function sortLunchBoxFixedCountRows(
  rows: readonly LunchBoxFixedCountRow[],
): LunchBoxFixedCountRow[] {
  return rows
    .map((row, index) => ({ index, row }))
    .sort(
      (left, right) =>
        (left.row.firstDate < right.row.firstDate
          ? -1
          : left.row.firstDate > right.row.firstDate
            ? 1
            : 0) || left.index - right.index,
    )
    .map((entry) => entry.row);
}

export function formatLunchBoxShortDateLabel(value: string) {
  if (!isLunchBoxDate(value)) {
    return value;
  }

  const [, month, day] = value.split("-");

  return `${Number(month)}.${Number(day)}`;
}

function pickLunchBoxCountValues(
  values: LunchBoxCountValues,
): LunchBoxCountValues {
  return {
    class1Count: values.class1Count,
    class2Count: values.class2Count,
    class3Count: values.class3Count,
    class4Count: values.class4Count,
    linkedCount: values.linkedCount,
    preservationCount: values.preservationCount,
    deliveryDriverCount: values.deliveryDriverCount,
  };
}

function getLunchBoxCountValuesKey(values: LunchBoxCountValues) {
  return lunchBoxCountFields.map((field) => values[field]).join("/");
}

export function splitLunchBoxChecklistColumns<Row>(
  rows: readonly Row[],
  columnCount: number,
): Row[][] {
  if (columnCount < 1) {
    return [[...rows]];
  }

  const perColumn = Math.ceil(rows.length / columnCount);
  const columns: Row[][] = [];

  for (let index = 0; index < rows.length; index += perColumn) {
    columns.push(rows.slice(index, index + perColumn));
  }

  return columns.length > 0 ? columns : [[]];
}

export function createLunchBoxDailyChecklistView({
  checkedSchoolIds,
  grid,
}: LunchBoxDailySchoolChecklistData): LunchBoxDailyChecklistView {
  const rows = grid.rows.filter((row) => getLunchBoxCountTotal(row) > 0);
  const normalizedCheckedSchoolIds = normalizeLunchBoxChecklistIds(
    checkedSchoolIds,
    rows,
  );
  const checkedCount = normalizedCheckedSchoolIds.length;
  const remainingCount = rows.length - checkedCount;
  const totalCount = rows.reduce(
    (sum, row) => sum + getLunchBoxCountTotal(row),
    0,
  );
  const preservationTotal = rows.reduce(
    (sum, row) => sum + row.preservationCount,
    0,
  );
  const dateLabel = formatLunchBoxDateLabel(grid.date);

  return {
    checkedCount,
    checkedSchoolIds: normalizedCheckedSchoolIds,
    columns: splitLunchBoxChecklistColumns(
      rows,
      lunchBoxDailyChecklistColumnCount,
    ),
    dateLabel,
    hasDeliveryDriver: rows.some((row) => row.deliveryDriverCount > 0),
    preservationTotal,
    progressLabel:
      rows.length === 0
        ? null
        : `체크 ${checkedCount}/${rows.length}${
            remainingCount === 0
              ? " (완료)"
              : ` (남은 ${remainingCount})`
          }`,
    remainingCount,
    rows,
    summaryLabel: `${dateLabel} · ${rows.length}개교 · 총 ${totalCount}개 · 보존식 ${preservationTotal}개`,
    totalCount,
    visibleServingFields: lunchBoxServingCountFields.filter((field) =>
      rows.some((row) => row[field] > 0),
    ),
  };
}

export function formatLunchBoxPreservationCellTitle(
  schoolName: string,
  count: number,
  preservationClass: LunchBoxPreservationClass | null,
) {
  if (count < 1) {
    return `${schoolName} 보존식 없음`;
  }

  return `${schoolName} 보존식 ${count}개 · ${
    preservationClass ? `${preservationClass}반 배정` : "배정 반 미지정"
  }`;
}


export function toggleLunchBoxChecklistId(
  checkedIds: readonly string[],
  schoolId: string,
) {
  return checkedIds.includes(schoolId)
    ? checkedIds.filter((id) => id !== schoolId)
    : [...checkedIds, schoolId];
}

export function setLunchBoxChecklistIdChecked(
  checkedIds: readonly string[],
  schoolId: string,
  isChecked: boolean,
) {
  const nextIds = checkedIds.filter((id) => id !== schoolId);

  return isChecked ? [...nextIds, schoolId] : nextIds;
}

export function resolveLunchBoxDisplayedChecklistIds({
  canonicalCheckedIds,
  clearPending,
  pendingChecks,
  rows,
}: {
  canonicalCheckedIds: readonly string[];
  clearPending: boolean;
  pendingChecks: ReadonlyMap<string, boolean>;
  rows: readonly { schoolId: string }[];
}) {
  if (clearPending) {
    return [];
  }

  let displayedIds = normalizeLunchBoxChecklistIds(
    canonicalCheckedIds,
    rows,
  );
  const allowedIds = new Set(rows.map((row) => row.schoolId));

  for (const [schoolId, isChecked] of pendingChecks) {
    if (allowedIds.has(schoolId)) {
      displayedIds = setLunchBoxChecklistIdChecked(
        displayedIds,
        schoolId,
        isChecked,
      );
    }
  }

  return displayedIds;
}

export function normalizeLunchBoxChecklistIds(
  value: unknown,
  rows: readonly { schoolId: string }[],
) {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowedIds = new Set(rows.map((row) => row.schoolId));

  return Array.from(
    new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string" && allowedIds.has(item),
      ),
    ),
  );
}

export function hasLunchBoxCountChanges(
  previous: Partial<LunchBoxCountValues> | null | undefined,
  next: LunchBoxCountValues,
) {
  return lunchBoxCountFields.some(
    (field) => (previous?.[field] ?? 0) !== next[field],
  );
}

export function mergeLunchBoxCountRealtimeGrid({
  currentGrid,
  edits,
  nextGrid,
}: {
  currentGrid: LunchBoxCountGrid;
  edits: Record<string, LunchBoxCountValues>;
  nextGrid: LunchBoxCountGrid;
}): LunchBoxCountRealtimeMergeResult {
  const currentRowsBySchoolId = new Map(
    currentGrid.rows.map((row) => [row.schoolId, row]),
  );
  const nextRowsBySchoolId = new Map(
    nextGrid.rows.map((row) => [row.schoolId, row]),
  );
  const mergedRows = [...nextGrid.rows];
  const nextEdits: Record<string, LunchBoxCountValues> = {};
  const conflictingSchoolIds = new Set<string>();
  let conflictingFieldCount = 0;
  let unavailableSchoolCount = 0;

  for (const [schoolId, localValues] of Object.entries(edits)) {
    const currentRow = currentRowsBySchoolId.get(schoolId);
    const nextRow = nextRowsBySchoolId.get(schoolId);

    if (!currentRow) {
      continue;
    }

    if (!nextRow) {
      const locallyEditedFieldCount = lunchBoxCountFields.filter(
        (field) => localValues[field] !== currentRow[field],
      ).length;

      nextEdits[schoolId] = localValues;
      mergedRows.push(currentRow);
      conflictingFieldCount += Math.max(1, locallyEditedFieldCount);
      conflictingSchoolIds.add(schoolId);
      unavailableSchoolCount += 1;
      continue;
    }

    const mergedValues = lunchBoxCountFields.reduce(
      (values, field) => {
        const isLocallyEdited = localValues[field] !== currentRow[field];

        if (!isLocallyEdited) {
          return values;
        }

        if (
          nextRow[field] !== currentRow[field] &&
          nextRow[field] !== localValues[field]
        ) {
          conflictingFieldCount += 1;
          conflictingSchoolIds.add(schoolId);
        }

        values[field] = localValues[field];
        return values;
      },
      {
        class1Count: nextRow.class1Count,
        class2Count: nextRow.class2Count,
        class3Count: nextRow.class3Count,
        class4Count: nextRow.class4Count,
        linkedCount: nextRow.linkedCount,
        preservationCount: nextRow.preservationCount,
        deliveryDriverCount: nextRow.deliveryDriverCount,
      },
    );

    if (hasLunchBoxCountChanges(nextRow, mergedValues)) {
      nextEdits[schoolId] = mergedValues;
    }
  }

  return {
    conflictingFieldCount,
    conflictingSchoolCount: conflictingSchoolIds.size,
    edits: nextEdits,
    grid: {
      ...nextGrid,
      rows: mergedRows,
    },
    unavailableSchoolCount,
  };
}

export function isLunchBoxDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function getLunchBoxCountToday() {
  return getKoreanDateValue();
}

export function parseLunchBoxDateValue(value: string) {
  const [yearText, monthText, dayText] = value.split("-");

  return new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );
}

export function formatLunchBoxDateValue(date: Date | string): string {
  if (typeof date === "string") {
    if (isLunchBoxDate(date)) {
      return date;
    }

    const parsedDate = new Date(date);

    return Number.isNaN(parsedDate.getTime())
      ? date
      : formatLunchBoxDateValue(parsedDate);
  }

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function shiftLunchBoxDate(value: string, days: number) {
  const date = parseLunchBoxDateValue(value);
  date.setUTCDate(date.getUTCDate() + days);

  return formatLunchBoxDateValue(date);
}

export function getLunchBoxCalendarWeekDates(value: string) {
  if (!isLunchBoxDate(value)) {
    return [];
  }

  const startDate = shiftLunchBoxDate(
    value,
    -parseLunchBoxDateValue(value).getUTCDay(),
  );

  return Array.from({ length: 7 }, (_, index) =>
    shiftLunchBoxDate(startDate, index),
  );
}

export function formatLunchBoxDateLabel(value: string) {
  if (!isLunchBoxDate(value)) {
    return value;
  }

  const [year, month, day] = value.split("-");
  const weekday = weekdayLabels[parseLunchBoxDateValue(value).getUTCDay()];

  return `${year}.${month}.${day}.(${weekday})`;
}

export function getLunchBoxMonthFromDate(date: string) {
  return date.slice(0, 7);
}

export function isLunchBoxMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }

  return isLunchBoxDate(`${value}-01`);
}

export function normalizeLunchBoxMonth(value: string | undefined) {
  return value && isLunchBoxMonth(value) ? value : getLunchBoxCurrentMonth();
}

export function normalizeLunchBoxCountChangeLogPage(
  value: string | string[] | undefined,
) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function normalizeLunchBoxDailyCheckHistoryPage(
  value: string | string[] | undefined,
) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function getLunchBoxCurrentMonth() {
  return getLunchBoxMonthFromDate(getLunchBoxCountToday());
}

export function shiftLunchBoxMonth(month: string, delta: number) {
  const date = parseLunchBoxDateValue(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + delta);

  return formatLunchBoxMonthValue(date);
}

export function getLunchBoxMonthRange(month: string) {
  const normalizedMonth = normalizeLunchBoxMonth(month);

  return {
    endDate: `${shiftLunchBoxMonth(normalizedMonth, 1)}-01`,
    startDate: `${normalizedMonth}-01`,
  };
}

export function getLunchBoxCalendarRange(month: string) {
  const normalizedMonth = normalizeLunchBoxMonth(month);
  const firstDate = `${normalizedMonth}-01`;
  const firstWeekday = parseLunchBoxDateValue(firstDate).getUTCDay();
  const startDate = shiftLunchBoxDate(firstDate, -firstWeekday);

  return {
    endDate: shiftLunchBoxDate(startDate, 42),
    startDate,
  };
}

export function createLunchBoxCalendarDays(month: string) {
  const normalizedMonth = normalizeLunchBoxMonth(month);
  const { startDate } = getLunchBoxCalendarRange(normalizedMonth);
  const gridStart = parseLunchBoxDateValue(startDate);
  const today = getLunchBoxCountToday();

  return Array.from({ length: 42 }, (_, index): LunchBoxCalendarDay => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);

    const dateValue = formatLunchBoxDateValue(date);

    return {
      date: dateValue,
      day: date.getUTCDate(),
      isCurrentMonth: getLunchBoxMonthFromDate(dateValue) === normalizedMonth,
      isToday: dateValue === today,
      weekday: date.getUTCDay() as LunchBoxCalendarWeekday,
    };
  });
}

export function formatLunchBoxMonthLabel(month: string) {
  const [yearText, monthText] = normalizeLunchBoxMonth(month).split("-");

  return `${yearText}년 ${Number(monthText)}월`;
}

function formatLunchBoxMonthValue(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function getLunchBoxMetadataRecord(
  value: unknown,
): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
