// Local design preview with synthetic records. Does not connect to the application database.
import { startDailyReportFixture } from "../e2e/helpers/daily-report-fixture";
import type { DailyReportEntry, DailyReportPageData } from "../src/lib/daily-report-core";

const today = "2026-09-17";
const staff = [
  { id: "preview-1", name: "김담당", departmentName: "생활지원팀" },
  { id: "preview-2", name: "이담당", departmentName: "교육지원팀" },
  { id: "preview-3", name: "박담당", departmentName: "운영지원팀" },
  { id: "preview-4", name: "최담당", departmentName: "생활지원팀" },
  { id: "preview-5", name: "정담당", departmentName: "교육지원팀" },
];
const report: DailyReportEntry = {
  id: "preview-report-1", workDate: today, authorId: staff[0].id, authorName: staff[0].name, departmentName: staff[0].departmentName,
  mainContent: "오전 생활지도 및 개별 학습 상담을 진행했습니다.\n\n학습 자료를 정리하고, 다음 주 자립 활동 일정을 조율했습니다.\n추가 지원이 필요한 사항은 담당자와 협의할 예정입니다.",
  youthReports: [{ youthId: "preview-youth-1", youthName: "김청소년", content: "오전 수업에 참여하고 주어진 과제를 마쳤습니다. 다음 활동에도 참여하고 싶다는 의사를 표현했습니다." }],
  version: 1, submittedAt: "2026-09-17T06:30:00Z", updatedAt: "2026-09-17T06:30:00Z", reviewedAt: null, reviewedByName: null,
};
const employee: DailyReportPageData = {
  mode: "employee", today, selectedDate: today, userName: "김담당", canWrite: true, recipients: ["안시설"],
  youths: ["김청소년", "이청소년", "박청소년", "최청소년", "정청소년", "한청소년"].map((name, index) => ({ id: `preview-youth-${index + 1}`, name })),
  selectedReport: null, reports: [], staff: [],
  history: [16, 15, 14, 11].map(day => ({ id: `preview-history-${day}`, workDate: `2026-09-${day}`, submittedAt: report.submittedAt, reviewedAt: day === 16 ? null : report.updatedAt })),
  historyPage: 1, historyHasMore: false,
};
const director: DailyReportPageData = {
  ...employee, mode: "director", canWrite: false, userName: "안시설", staff,
  reports: [report, { ...report, id: "preview-report-2", authorId: staff[1].id, authorName: staff[1].name, departmentName: staff[1].departmentName, mainContent: "자격증 준비반 교육 진행 및 출결 관리\n학습 진도와 다음 주 교육 계획을 점검했습니다.", youthReports: [] },
    { ...report, id: "preview-report-3", authorId: staff[2].id, authorName: staff[2].name, departmentName: staff[2].departmentName, mainContent: "공용 비품 재고 점검 및 구매 요청 내역 정리", reviewedAt: "2026-09-17T07:30:00Z", reviewedByName: "안시설" }],
};
const fixture = await startDailyReportFixture({ employee, director });
console.log(`Daily report preview: ${fixture.url}/work-schedule/daily-reports`);
console.log(`Director preview: ${fixture.url}/work-schedule/daily-reports?mode=director`);
