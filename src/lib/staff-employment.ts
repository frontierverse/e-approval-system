import { getKoreanDateTimeParts } from "@/lib/korean-date";

export type StaffEmploymentStatus = "employed" | "resigning" | "resigned";

export function getStaffEmploymentToday(now = new Date()): string {
  const parts = getKoreanDateTimeParts(now);
  if (!parts) throw new Error("Invalid staff employment date");
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Account activation and employment are independent. Match the Korean date
// boundary used by staff assignment queries: the resignation date is inclusive.
export function getStaffEmploymentStatus(
  resignationDate: string | null,
  today: string,
): StaffEmploymentStatus {
  if (!resignationDate) return "employed";
  return resignationDate <= today ? "resigned" : "resigning";
}
