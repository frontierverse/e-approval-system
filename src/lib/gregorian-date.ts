/** Canonical Gregorian dates supported by business date columns (years 0001..9999). */
export function isGregorianDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseGregorianDate(value);
  return Number.isFinite(date.getTime()) && formatGregorianDate(date) === value;
}
export function parseGregorianDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year!, month! - 1, day!);
  return date;
}
export function formatGregorianDate(date: Date): string {
  if (!Number.isFinite(date.getTime())) return "";
  return [String(date.getUTCFullYear()).padStart(4, "0"), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}
export function shiftGregorianDate(value: string, days: number): string | null {
  if (!isGregorianDate(value) || !Number.isInteger(days)) return null;
  const date = parseGregorianDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999 ? null : formatGregorianDate(date);
}
