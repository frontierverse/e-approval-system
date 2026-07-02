export const questionBankProblemTypes = [
  "multiple-choice",
  "short-answer",
  "essay",
] as const;

export type QuestionBankProblemType =
  (typeof questionBankProblemTypes)[number];
export type QuestionBankProblemTypeFilter = QuestionBankProblemType | "all";
export type QuestionBankDifficultyFilter = number | "all";

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
