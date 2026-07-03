export const questionBankProblemTypes = [
  "multiple-choice",
  "short-answer",
  "essay",
] as const;

export type QuestionBankProblemType =
  (typeof questionBankProblemTypes)[number];
export type QuestionBankProblemTypeFilter = QuestionBankProblemType | "all";
export type QuestionBankDifficultyFilter = number | "all";
export type QuestionBankSchoolLevel = "middle" | "high";
export type QuestionBankSemester = "1학기" | "2학기";

export const questionBankProblemTypeLabels = {
  "multiple-choice": "객관식",
  "short-answer": "단답형",
  essay: "서술형",
} as const satisfies Record<QuestionBankProblemType, string>;

export const questionBankDifficultyOptions = [
  { value: 1, label: "기초" },
  { value: 2, label: "보통" },
  { value: 3, label: "심화" },
  { value: 4, label: "고난도" },
  { value: 5, label: "최상" },
] as const;

export const questionBankSchoolLevelOptions = [
  { value: "middle", label: "중학생" },
  { value: "high", label: "고등학생" },
] as const satisfies ReadonlyArray<{
  value: QuestionBankSchoolLevel;
  label: string;
}>;

export const questionBankGradeOptions = [
  { value: 1, label: "1학년" },
  { value: 2, label: "2학년" },
  { value: 3, label: "3학년" },
] as const;

export const questionBankSemesterOptions = [
  { value: "1학기", label: "1학기" },
  { value: "2학기", label: "2학기" },
] as const satisfies ReadonlyArray<{
  value: QuestionBankSemester;
  label: string;
}>;

export const questionBankMaxQuestionCount = 50;
export const questionBankDefaultQuestionCount = 10;
export const questionBankUnitNameMaxLength = 80;
export const questionBankProblemBodyMaxLength = 2000;
export const questionBankProblemExplanationMaxLength = 2000;
export const questionBankChoicesMaxLength = 1000;

export function isQuestionBankProblemType(
  value: string,
): value is QuestionBankProblemType {
  return questionBankProblemTypes.includes(value as QuestionBankProblemType);
}

export function normalizeQuestionBankProblemType(
  value: unknown,
): QuestionBankProblemType {
  const normalizedValue = String(value ?? "").trim();

  return isQuestionBankProblemType(normalizedValue)
    ? normalizedValue
    : "multiple-choice";
}

export function normalizeQuestionBankProblemTypeFilter(
  value: unknown,
): QuestionBankProblemTypeFilter {
  const normalizedValue = String(value ?? "").trim();

  if (normalizedValue === "all") {
    return "all";
  }

  return isQuestionBankProblemType(normalizedValue)
    ? normalizedValue
    : "all";
}

export function normalizeQuestionBankDifficulty(value: unknown) {
  const difficulty = Number(value);

  return isQuestionBankDifficulty(difficulty) ? difficulty : 2;
}

export function normalizeQuestionBankDifficultyFilter(
  value: unknown,
): QuestionBankDifficultyFilter {
  const normalizedValue = String(value ?? "").trim();

  if (normalizedValue === "all") {
    return "all";
  }

  const difficulty = Number(normalizedValue);

  return isQuestionBankDifficulty(difficulty) ? difficulty : "all";
}

export function normalizeQuestionBankQuestionCount(
  value: unknown,
  fallback = questionBankDefaultQuestionCount,
) {
  const count = Number(value);
  const fallbackCount = Number.isInteger(fallback)
    ? fallback
    : questionBankDefaultQuestionCount;

  if (!Number.isInteger(count)) {
    return clampQuestionCount(fallbackCount);
  }

  return clampQuestionCount(count);
}

export function getQuestionBankProblemTypeLabel(
  type: QuestionBankProblemType | string,
) {
  return isQuestionBankProblemType(type)
    ? questionBankProblemTypeLabels[type]
    : type;
}

export function getQuestionBankDifficultyLabel(value: number) {
  return (
    questionBankDifficultyOptions.find((option) => option.value === value)
      ?.label ?? `${value}단계`
  );
}

export function inferQuestionBankSchoolLevel({
  gradeLevel,
  subject,
}: {
  gradeLevel: string | null | undefined;
  subject: string;
}): QuestionBankSchoolLevel {
  const text = `${subject} ${gradeLevel ?? ""}`;

  if (/고등|고교|고\s*[1-3]/.test(text)) {
    return "high";
  }

  return "middle";
}

export function inferQuestionBankGradeNumber(
  gradeLevel: string | null | undefined,
) {
  const text = String(gradeLevel ?? "").trim();
  const matchedGrade =
    text.match(/[중고]\s*([1-3])/)?.[1] ?? text.match(/([1-3])\s*학년/)?.[1];
  const grade = Number(matchedGrade);

  return Number.isInteger(grade) && grade >= 1 && grade <= 3 ? grade : null;
}

export function inferQuestionBankSemester({
  name,
  siblingCount,
  siblingIndex,
  sortOrder,
}: {
  name: string;
  siblingCount?: number;
  siblingIndex?: number;
  sortOrder?: number;
}): QuestionBankSemester {
  if (/1\s*학기/.test(name)) {
    return "1학기";
  }

  if (/2\s*학기/.test(name)) {
    return "2학기";
  }

  const visibleSortOrder = Number(sortOrder ?? 0) % 100;

  if (visibleSortOrder >= 50) {
    return "2학기";
  }

  if (visibleSortOrder > 0) {
    return "1학기";
  }

  const romanOrder = readLeadingRomanUnitOrder(name);

  if (romanOrder) {
    return romanOrder >= 5 ? "2학기" : "1학기";
  }

  const resolvedSiblingCount = siblingCount ?? 0;
  const resolvedSiblingIndex = siblingIndex ?? -1;

  if (
    Number.isInteger(resolvedSiblingIndex) &&
    Number.isInteger(resolvedSiblingCount) &&
    resolvedSiblingCount > 0
  ) {
    return resolvedSiblingIndex >= Math.ceil(resolvedSiblingCount / 2)
      ? "2학기"
      : "1학기";
  }

  return "1학기";
}

export function parseQuestionBankChoices(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((choice) => choice.trim())
    .filter(Boolean);
}

export function normalizeQuestionBankText(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export function createWorksheetTitle({
  title,
  unitName,
}: {
  title?: string | null;
  unitName: string;
}) {
  const normalizedTitle = normalizeQuestionBankText(title);

  return normalizedTitle || `${unitName} 문제지`;
}

export function shuffleQuestionBankItems<T>(
  items: readonly T[],
  seed: string,
) {
  const shuffled = [...items];
  const random = createSeededRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = shuffled[index];
    const swap = shuffled[swapIndex];

    if (current === undefined || swap === undefined) {
      continue;
    }

    shuffled[index] = swap;
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

function isQuestionBankDifficulty(value: number) {
  return (
    Number.isInteger(value) &&
    questionBankDifficultyOptions.some((option) => option.value === value)
  );
}

function clampQuestionCount(value: number) {
  return Math.max(1, Math.min(questionBankMaxQuestionCount, value));
}

function readLeadingRomanUnitOrder(name: string) {
  const roman = name.match(/^\s*([IVX]+)\./i)?.[1]?.toUpperCase();

  if (!roman) {
    return null;
  }

  const values: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
  };
  let total = 0;
  let previous = 0;

  for (const character of [...roman].reverse()) {
    const value = values[character] ?? 0;

    if (value < previous) {
      total -= value;
    } else {
      total += value;
      previous = value;
    }
  }

  return total || null;
}

function createSeededRandom(seed: string) {
  let state = 2166136261;

  for (const character of seed) {
    state ^= character.codePointAt(0) ?? 0;
    state = Math.imul(state, 16777619);
  }

  return () => {
    state += 0x6d2b79f5;
    let value = state;

    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
