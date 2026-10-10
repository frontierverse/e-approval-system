import { getKoreanDateTimeParts } from "@/lib/korean-date";

export type WorkLogReminderDecision = {
  date: string;
  shouldSend: boolean;
  reason:
    | "invalid-date"
    | "outside-send-window"
    | "unsupported-year"
    | "weekend"
    | "holiday"
    | "working-day";
};

/**
 * Reviewed against the following official sources on 2026-10-11:
 * - 2026 calendar: Korea Astronomy and Space Science Institute (KASI),
 *   https://astro.kasi.re.kr/kor/life/post/calendarData?search_year=2026
 * - 2026 calendar announcement: Korea AeroSpace Administration (KASA),
 *   https://www.kasa.go.kr/prog/bbsArticle/BBSMSTR_000000000010/view.do?bbsId=BBSMSTR_000000000010&nttId=B000000001860Pe2zT3
 * - Labor Day and Constitution Day, including substitute holidays, were added
 *   in 2026: Ministry of Personnel Management (2026-04-29),
 *   https://www.mpm.go.kr/mpm/comm/newsPress/newsPressRelease/?boardId=bbs_0000000000000029&category=&cntId=4250&mode=view&pageIdx=1
 * - Official 2027 calendar announcement (2026-06-29): KASA,
 *   https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431
 * - 2027 individual dates: KASI,
 *   https://astro.kasi.re.kr/kor/life/post/calendarData?search_year=2027
 *
 * These are explicit dates, rather than inferred lunar/substitute dates. The
 * 2026 local election day is included; no other temporary holidays were
 * confirmed by these sources at review time. Add government-declared temporary
 * holidays here when announced. Each June, review the next year's official
 * calendar and add its full list before enabling that year. Unreviewed years
 * block reminders, so a missing holiday calendar never becomes a working day.
 *
 * The public KASI Special Days API was considered:
 * https://www.data.go.kr/data/15012690/openapi.do
 * It requires a registered service key. This small checked-in calendar avoids
 * adding a credential or making push delivery depend on a third-party request.
 */
const koreanPublicHolidays: Readonly<Record<string, ReadonlySet<string>>> = {
  "2026": new Set([
    "2026-01-01", // New Year's Day
    "2026-02-16", // Seollal
    "2026-02-17",
    "2026-02-18",
    "2026-03-01", // Independence Movement Day
    "2026-03-02", // Substitute holiday
    "2026-05-01", // Labor Day (public holiday since 2026)
    "2026-05-05", // Children's Day
    "2026-05-24", // Buddha's Birthday
    "2026-05-25", // Substitute holiday
    "2026-06-03", // Nationwide local elections
    "2026-06-06", // Memorial Day
    "2026-07-17", // Constitution Day (public holiday again since 2026)
    "2026-08-15", // Liberation Day
    "2026-08-17", // Substitute holiday
    "2026-09-24", // Chuseok
    "2026-09-25",
    "2026-09-26",
    "2026-10-03", // National Foundation Day
    "2026-10-05", // Substitute holiday
    "2026-10-09", // Hangeul Day
    "2026-12-25", // Christmas Day
  ]),
  "2027": new Set([
    "2027-01-01",
    "2027-02-06", // Seollal
    "2027-02-07",
    "2027-02-08",
    "2027-02-09", // Substitute holiday
    "2027-03-01",
    "2027-05-01", // Labor Day
    "2027-05-03", // Substitute holiday
    "2027-05-05",
    "2027-05-13", // Buddha's Birthday
    "2027-06-06",
    "2027-07-17", // Constitution Day
    "2027-07-19", // Substitute holiday
    "2027-08-15",
    "2027-08-16", // Substitute holiday
    "2027-09-14", // Chuseok
    "2027-09-15",
    "2027-09-16",
    "2027-10-03",
    "2027-10-04", // Substitute holiday
    "2027-10-09",
    "2027-10-11", // Substitute holiday
    "2027-12-25",
    "2027-12-27", // Substitute holiday
  ]),
};

export const workLogReminderSupportedYears = Object.freeze(
  Object.keys(koreanPublicHolidays),
);

/** A cron delay may deliver during 09:00–09:59 KST; daily deduplication is separate. */
export function getWorkLogReminderDecision(now: Date): WorkLogReminderDecision {
  const parts = getKoreanDateTimeParts(now);

  if (!parts) {
    return { date: "", shouldSend: false, reason: "invalid-date" };
  }

  const date = `${parts.year}-${parts.month}-${parts.day}`;

  if (parts.hour !== 9) {
    return { date, shouldSend: false, reason: "outside-send-window" };
  }

  const holidays = koreanPublicHolidays[parts.year];

  if (!holidays) {
    return { date, shouldSend: false, reason: "unsupported-year" };
  }

  const weekday = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  ).getUTCDay();

  if (weekday === 0 || weekday === 6) {
    return { date, shouldSend: false, reason: "weekend" };
  }

  if (holidays.has(date)) {
    return { date, shouldSend: false, reason: "holiday" };
  }

  return { date, shouldSend: true, reason: "working-day" };
}
