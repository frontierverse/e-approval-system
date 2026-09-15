import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { startDailyReportFixture } from "./helpers/daily-report-fixture";
import { dailyReportPath, type DailyReportEntry, type DailyReportPageData } from "../src/lib/daily-report-core";

const today = "2026-09-14";
const report: DailyReportEntry = {
  id: "report-1", workDate: today, mainContent: "오전 생활지도 및 학습 상담을 진행했습니다.\n개별 지원이 필요한 사항은 내일 담당자와 협의할 예정입니다.",
  youthReports: [{ youthId: "youth-1", youthName: "김청소년", content: "오전 수업에 참여하고 친구와 함께 과제를 마쳤습니다.\n‘다음 활동도 참여하고 싶다’고 이야기했습니다." }],
  authorId: "employee-1", authorName: "신담당", departmentName: "생활지원팀", version: 1,
  submittedAt: "2026-09-14T07:00:00.000Z", reviewedAt: null, reviewedByName: null, updatedAt: "2026-09-14T07:00:00.000Z",
};
function data(mode: "employee" | "director" = "employee"): DailyReportPageData {
  return {
    mode, today, selectedDate: today, userName: mode === "director" ? "시설장" : "신담당", canWrite: mode === "employee", recipients: ["안시설"],
    youths: [{ id: "youth-1", name: "김청소년" }, { id: "youth-2", name: "이청소년" }, { id: "youth-3", name: "박청소년" }],
    selectedReport: null, reports: mode === "director" ? [report, { ...report, id: "report-2", authorId: "employee-2", authorName: "김직원", reviewedAt: report.updatedAt, reviewedByName: "안시설", youthReports: [] }] : [],
    staff: [{ id: "employee-1", name: "신담당", departmentName: "생활지원팀" }, { id: "employee-2", name: "김직원", departmentName: "생활지원팀" }, { id: "employee-3", name: "이직원", departmentName: "운영팀" }],
    history: [{ id: "old-1", workDate: "2026-09-13", submittedAt: report.submittedAt, reviewedAt: null }], historyPage: 1, historyHasMore: false,
  };
}
let fixture: Awaited<ReturnType<typeof startDailyReportFixture>>;
test.beforeAll(async () => { fixture = await startDailyReportFixture(); await mkdir("outputs/daily-reports", { recursive: true }); });
test.afterAll(async () => { await fixture?.close(); });
async function prepare(page: Page, initial = data(), suffix = "") {
  await page.addInitScript(initial => { (window as unknown as { __dailyReportInitial: typeof initial }).__dailyReportInitial = initial; }, initial);
  await page.goto(`${fixture.url}${dailyReportPath}${suffix}`);
  await expect(page.getByRole("heading", { name: "일일 업무보고", exact: true })).toBeVisible();
}
async function noOverflow(page: Page) {
  const overflowing = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("main, form, section, textarea")].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.tagName + ":" + element.className));
  expect(overflowing).toEqual([]);
}

test("home: daily report status and direct action stay ahead of personal work", async ({ page }, info) => {
  for (const [state, selectedReport, label, action] of [
    ["missing", null, "미제출", "작성하기"],
    ["draft", { ...report, submittedAt: null }, "임시저장 · 미제출", "이어서 작성"],
    ["submitted", report, "제출 완료", "보고서 보기"],
    ["reviewed", { ...report, reviewedAt: report.updatedAt }, "확인 완료", "보고서 보기"],
  ] as const) {
    const initial = { ...data(), selectedReport };
    await page.addInitScript(initial => { (window as unknown as { __dailyReportInitial: typeof initial }).__dailyReportInitial = initial; }, initial);
    await page.goto(fixture.url);
    const summary = page.getByRole("region", { name: "일일 업무보고", exact: true });
    await expect(summary).toContainText(label);
    const link = summary.getByRole("link", { name: `오늘 일일 업무보고 ${action}` });
    await expect(link).toBeInViewport();
    await expect(link).toHaveAttribute("href", `${dailyReportPath}?date=${today}`);
    const main = await page.locator("main").boundingBox();
    const list = await page.getByRole("heading", { name: "내 할 일 0건" }).boundingBox();
    expect(list!.y - main!.y).toBeLessThan((page.viewportSize()!.height - main!.y) * 0.4);
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await noOverflow(page);
    await page.screenshot({ path: `outputs/daily-reports/${info.project.name}-home-${state}.png` });
  }
  await page.getByRole("link", { name: "오늘 일일 업무보고 보고서 보기" }).click();
  await expect(page.getByRole("heading", { name: "일일 업무보고", exact: true })).toBeVisible();
  await expect(page.getByLabel("주요 업무보고 제출 시 필수")).toBeVisible();
});

test("navigation: reports stay visible outside work management and open directly", async ({ page }, info) => {
  await prepare(page);
  for (const path of ["/", "/youth/roster", "/work-schedule"]) {
    await page.goto(`${fixture.url}${path}`);
    const nav = info.project.name === "mobile" ? page.locator("header").first() : page.locator("aside").first();
    const link = nav.getByRole("link", { name: "일일 업무보고", exact: true });
    await expect(link).toBeInViewport();
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${dailyReportPath}$`));
    await expect(link).toHaveAttribute("aria-current", "page");
    await noOverflow(page);
  }
  if (info.project.name === "mobile") {
    const trigger = page.getByRole("button", { name: "전체 메뉴 열기" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("link", { name: "일일 업무보고", exact: true })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
});

test("home: director, loading, error, dark theme and narrow viewport remain usable", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "Shared boundary checks run once");
  const initial = data("director");
  await page.addInitScript(initial => { (window as unknown as { __dailyReportInitial: typeof initial }).__dailyReportInitial = initial; }, initial);
  for (const [name, width, height] of [["wide", 1440, 900], ["small", 360, 800], ["narrow", 320, 800], ["zoom-200", 683, 384]] as const) {
    await page.setViewportSize({ width, height });
    for (const theme of ["light", "dark"]) {
      await page.goto(`${fixture.url}/?admin`);
      await page.evaluate(theme => { document.documentElement.classList.toggle("dark", theme === "dark"); document.documentElement.dataset.theme = theme; }, theme);
      await expect(page.getByRole("region", { name: "일일 업무보고", exact: true })).toContainText("제출 2건 · 미확인 1건");
      await expect(page.getByRole("link", { name: "오늘 일일 업무보고 보고 확인" })).toBeInViewport();
      await noOverflow(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `outputs/daily-reports/home-${name}-${theme}.png` });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${fixture.url}/?loading`);
  await expect(page.getByRole("region", { name: "일일 업무보고 상태 불러오는 중" })).toBeInViewport();
  await page.screenshot({ path: "outputs/daily-reports/home-loading.png" });
  await page.goto(`${fixture.url}/?unavailable`);
  await expect(page.getByText("상태 확인 필요", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "오늘 일일 업무보고 보고 화면 열기" })).toBeInViewport();
  await noOverflow(page);
  await page.screenshot({ path: "outputs/daily-reports/home-unavailable.png" });
});

test("employee: optional youth notes persist through search, errors, and duplicate submission", async ({ page }, info) => {
  await prepare(page);
  let requests = 0;
  await page.route("**/fixture-action/save", async route => {
    requests++;
    const sent = route.request().postDataJSON();
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.fulfill({ json: requests === 1 ? { error: "주요 업무보고 내용을 입력해 주세요.", fieldErrors: { mainContent: "주요 업무보고 내용을 입력해 주세요." } } : {
      success: "시설장에게 업무보고를 제출했습니다.", entry: { ...report, mainContent: sent.mainContent, youthReports: JSON.parse(sent.youthReports).filter((item: { content: string }) => item.content).map((item: { youthId: string; content: string }) => ({ ...item, youthName: "김청소년" })) },
    } });
  });
  await page.getByLabel("김청소년선택", { exact: false }).fill("오늘 활동과 대화 기록");
  await page.getByRole("searchbox", { name: "작성할 청소년 이름 찾기" }).fill("이청소년");
  await expect(page.getByLabel("김청소년선택", { exact: false })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "작성할 청소년 이름 찾기" }).fill("");
  await expect(page.getByLabel("김청소년선택", { exact: false })).toHaveValue("오늘 활동과 대화 기록");
  await page.getByRole("button", { name: "시설장에게 제출" }).click();
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(page.getByLabel("김청소년선택", { exact: false })).toHaveValue("오늘 활동과 대화 기록");
  await page.getByLabel("주요 업무보고 제출 시 필수").fill("주요 업무 내용");
  await page.getByRole("button", { name: "시설장에게 제출" }).click();
  await expect(page.getByRole("button", { name: "저장 중…" })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("시설장에게 업무보고를 제출했습니다.");
  expect(requests).toBe(2);
  await expect(page.getByRole("button", { name: "수정 제출" })).toBeVisible();
  await expect(page.getByText("저장하지 않은 변경", { exact: false })).toHaveCount(0);
  await noOverflow(page);
  await page.evaluate(() => { document.querySelector("main")?.scrollTo(0, 0); window.scrollTo(0, 0); });
  await page.screenshot({ path: `outputs/daily-reports/${info.project.name}-employee.png` });
});

test("director: first viewport summary, employee filters, full youth notes and review", async ({ page }, info) => {
  await prepare(page, data("director"));
  await page.route("**/fixture-action/review", route => route.fulfill({ json: { success: "확인 완료로 표시했습니다." } }));
  await expect(page.locator("textarea")).toHaveCount(0);
  const main = await page.locator("main").boundingBox();
  const list = await page.locator("[data-daily-report-list]").boundingBox();
  const viewport = page.viewportSize()!;
  expect(list!.y - main!.y).toBeLessThan((viewport.height - main!.y) * 0.4);
  await expect(page.getByText("신담당", { exact: true })).toBeVisible();
  await page.screenshot({ path: `outputs/daily-reports/${info.project.name}-director.png` });
  await page.getByLabel("제출 상태 필터").selectOption("missing");
  await expect(page.getByText("이직원", { exact: true })).toBeVisible();
  await expect(page.getByText("신담당", { exact: true })).toHaveCount(0);
  await page.getByLabel("제출 상태 필터").selectOption("all");
  await page.getByRole("searchbox", { name: "직원 및 보고 내용 검색" }).fill("김청소년");
  await expect(page.getByText("김직원", { exact: true })).toHaveCount(0);
  await page.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(report.youthReports[0].content, { exact: true })).toBeVisible();
  await page.screenshot({ path: `outputs/daily-reports/${info.project.name}-expanded.png` });
  await page.getByRole("button", { name: "확인 완료로 표시", exact: true }).click();
  await expect(page.locator("summary")).toContainText("확인 완료");
  await noOverflow(page);
});

test("employee: leaving unsaved input can be cancelled, date archive opens a fresh report", async ({ page }) => {
  await prepare(page);
  await page.getByLabel("주요 업무보고 제출 시 필수").fill("보관할 입력");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("link", { name: /2026-09-13/ }).click();
  await expect(page.getByLabel("주요 업무보고 제출 시 필수")).toHaveValue("보관할 입력");
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("link", { name: /2026-09-13/ }).click();
  await expect(page).toHaveURL(/date=2026-09-13/);
  await expect(page.getByLabel("보고 날짜")).toHaveValue("2026-09-13");
  await expect(page.getByLabel("주요 업무보고 제출 시 필수")).toHaveValue("");
});

test("visual baselines: many records, long names, dark mode, narrow and zoom layouts", async ({ page }) => {
  const initial = data("director");
  initial.reports = Array.from({ length: 30 }, (_, i) => ({ ...report, id: `report-${i}`, authorId: `employee-${i}`, authorName: i ? `직원 ${i}` : "긴이름의생활지도담당직원", mainContent: "아주 긴 한글 업무보고 내용입니다. ".repeat(100) }));
  initial.staff = initial.reports.map(entry => ({ id: entry.authorId, name: entry.authorName, departmentName: entry.departmentName }));
  await prepare(page, initial);
  for (const [name, width, height] of [["wide", 1440, 900], ["small", 360, 800], ["narrow", 320, 800], ["zoom", 683, 384]] as const) {
    await page.setViewportSize({ width, height });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => document.documentElement.classList.toggle("dark", theme === "dark"), theme);
      await noOverflow(page);
      await page.screenshot({ path: `outputs/daily-reports/${name}-${theme}.png` });
    }
  }
});

test("empty, loading, error, and employee form on small dark screens", async ({ page }, info) => {
  const initial = data(); initial.youths = []; initial.history = [];
  await prepare(page, initial);
  await expect(page.getByText("해당 날짜에 보고할 청소년이 없습니다. 주요 업무만 제출할 수 있습니다.")).toBeVisible();
  await page.screenshot({ path: `outputs/daily-reports/${info.project.name}-empty.png` });
  await page.goto(`${fixture.url}${dailyReportPath}?loading`);
  await expect(page.getByLabel("일일 업무보고 불러오는 중")).toBeVisible();
  await page.screenshot({ path: `outputs/daily-reports/${info.project.name}-loading.png` });
  await page.goto(`${fixture.url}${dailyReportPath}?error`);
  await expect(page.getByRole("button", { name: "다시 불러오기" })).toBeVisible();
  await page.screenshot({ path: `outputs/daily-reports/${info.project.name}-error.png` });
  await page.goto(`${fixture.url}${dailyReportPath}`);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await noOverflow(page);
  await page.screenshot({ path: `outputs/daily-reports/${info.project.name}-form-small-dark.png` });
});

test("network failure preserves form input and allows retry", async ({ page }, info) => {
  await prepare(page);
  await page.route("**/fixture-action/save", route => route.abort("connectionrefused"));
  await page.getByLabel("주요 업무보고 제출 시 필수").fill("연결 오류가 발생해도 보관할 내용");
  await page.getByLabel("김청소년선택", { exact: false }).fill("나눈 대화 내용");
  await page.getByRole("button", { name: "시설장에게 제출" }).click();
  await expect(page.getByRole("alert")).toContainText("입력은 유지됩니다");
  await expect(page.getByLabel("주요 업무보고 제출 시 필수")).toHaveValue("연결 오류가 발생해도 보관할 내용");
  await expect(page.getByRole("button", { name: "시설장에게 제출" })).toBeEnabled();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => { document.documentElement.classList.add("dark"); document.querySelector("main")?.scrollTo(0, 0); window.scrollTo(0, 0); });
  await noOverflow(page);
  await page.screenshot({ path: `outputs/daily-reports/${info.project.name}-youth-form-small-dark.png` });
});

test("director with no submissions sees staff to follow up, with no employees sees a compact empty state", async ({ page }, info) => {
  const initial = data("director"); initial.reports = [];
  await prepare(page, initial);
  await expect(page.locator("[data-daily-report-list] span").filter({ hasText: /^미제출$/ })).toHaveCount(3);
  await expect(page.getByText("신담당", { exact: true })).toBeVisible();
  await page.screenshot({ path: `outputs/daily-reports/${info.project.name}-no-submissions.png` });
  const emptyPage = await page.context().newPage();
  await prepare(emptyPage, { ...initial, staff: [] });
  await expect(emptyPage.getByText("해당 날짜의 보고 대상 직원이 없습니다.")).toBeVisible();
  await noOverflow(emptyPage);
  await emptyPage.screenshot({ path: `outputs/daily-reports/${info.project.name}-no-staff.png` });
  await emptyPage.close();
});
