import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { startWorkLogTaskFixture } from "./helpers/work-log-task-fixture";
import type { WorkLogEntry } from "../src/lib/work-log-core";
import type { StaffTaskItem } from "../src/lib/staff-tasks-core";

const today = "2026-09-08";
const yesterday = "2026-09-07";
const completedAt = "2026-09-08T01:30:00.000Z";
const taskTitle = "주간 프로그램 결과 정리";
const automaticRegion = "완료한 할 일 자동 기록";
const task: StaffTaskItem = {
  id: "test-task-me", title: taskTitle, description: "참여 현황과 결과 자료 확인", meetingTitle: "주간 운영 회의",
  dueDate: "2026-09-05", assigneeId: "test-me", assigneeName: "검증 직원", departmentName: "운영지원팀",
  completedAt: null, deletedAt: null, createdAt: "2026-09-01T01:00:00.000Z", updatedAt: "2026-09-01T01:00:00.000Z", version: 1,
};

function automaticEntry(date = today, title = taskTitle): WorkLogEntry {
  const time = `${date}T01:30:00.000Z`;
  return {
    id: `tasks:test-me:${date}`, workDate: date, keyword: "할 일 완료 1건", content: "", authorName: "검증 직원",
    createdAt: time, updatedAt: time, updatedByName: null, manualLogId: null, manualUpdatedAt: null,
    completedTasks: [{ id: task.id, title, description: task.description, meetingTitle: task.meetingTitle, completedAt: time }],
  };
}

function manualEntry(date = today, includeTask = true): WorkLogEntry {
  return {
    ...automaticEntry(date), id: `manual-${date}`, keyword: "사례회의 및 인수인계", content: "수동으로 작성한 내용은 그대로 보존됩니다.\n다음 주 담당자에게 확인 사항 전달.",
    manualLogId: `manual-${date}`, manualUpdatedAt: `${date}T02:00:00.000Z`, updatedAt: `${date}T02:00:00.000Z`,
    completedTasks: includeTask ? automaticEntry(date).completedTasks : [],
  };
}

type ActionCall = { kind: string; body: Record<string, string | number | boolean> };
let fixture: Awaited<ReturnType<typeof startWorkLogTaskFixture>>;

test.beforeAll(async () => {
  fixture = await startWorkLogTaskFixture();
  await mkdir("outputs/work-log-task-link", { recursive: true });
});
test.afterAll(async () => { await fixture?.close(); });

async function prepare(page: Page, options: { entries?: WorkLogEntry[]; path?: string; contributionDates?: string[] } = {}) {
  const state = { today, entries: options.entries ?? [automaticEntry()], tasks: [{ ...task }], contributionDates: options.contributionDates };
  const calls: ActionCall[] = [];
  const detailDates: string[] = [];
  const errors: string[] = [];
  let actionHandler: ((route: Route, call: ActionCall) => Promise<void>) | undefined;
  let detailHandler: ((route: Route, date: string) => Promise<void>) | undefined;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((data) => {
    (window as unknown as { __workLogTaskInitial: typeof data }).__workLogTaskInitial = data;
  }, state);
  await page.route("**/fixture-actions/**", async (route) => {
    const call = { kind: new URL(route.request().url()).pathname.split("/").at(-1)!, body: route.request().postDataJSON() as ActionCall["body"] };
    calls.push(call);
    if (actionHandler) return actionHandler(route, call);
    if (call.kind === "task-complete") {
      state.tasks = [{ ...task, completedAt: completedAt, version: 2 }];
      state.entries = [automaticEntry()];
      return route.fulfill({ json: { state, result: { success: "할 일을 완료했습니다. 업무일지에 자동 반영되었습니다." } } });
    }
    throw new Error(`Unhandled fixture action: ${call.kind}`);
  });
  await page.route("**/api/work-logs/**", async (route) => {
    const date = new URL(route.request().url()).pathname.split("/").at(-1)!;
    detailDates.push(date);
    if (detailHandler) return detailHandler(route, date);
    const entry = state.entries.find((item) => item.workDate === date);
    return route.fulfill({ status: entry ? 200 : 404, json: entry ? { entry, linkedScheduleState: { status: "ready", schedules: [] } } : { error: "업무일지를 찾을 수 없습니다." } });
  });
  await page.goto(fixture.url + (options.path ?? "/work-schedule/work-log"));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return { state, calls, detailDates, errors,
    onAction(handler: typeof actionHandler) { actionHandler = handler; },
    onDetail(handler: typeof detailHandler) { detailHandler = handler; },
  };
}

function form(page: Page) { return page.locator('main form').first(); }
function grass(page: Page, date = today) { return page.locator(`[data-work-log-grass-cell="${date}"]`); }
async function openDetail(page: Page, date = today) {
  await grass(page, date).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("region", { name: automaticRegion })).toBeVisible();
  return dialog;
}

test("completing my checklist task shows an automatic record on its completion day", async ({ page }, info) => {
  const model = await prepare(page, { entries: [], path: "/tasks" });
  await page.getByRole("checkbox", { name: `${taskTitle} 완료 처리` }).click();
  await expect(page.getByRole("checkbox", { name: `${taskTitle} 완료 취소` })).toBeChecked();
  expect(model.calls).toEqual([{ kind: "task-complete", body: { id: task.id, completed: true, version: 1 } }]);
  await page.getByRole("link", { name: "업무일지", exact: true }).click();
  const panel = page.getByRole("region", { name: automaticRegion });
  await expect(panel.getByText(taskTitle, { exact: true })).toBeVisible();
  await expect(panel.getByRole("checkbox")).toHaveCount(0);
  await expect(grass(page)).toHaveAttribute("aria-haspopup", "dialog");
  await expect(grass(page, "2026-09-05")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("region", { name: "최근 업무일지" }).getByText(/할 일 완료 1건/)).toBeVisible();
  await expect(form(page).locator('[name="keyword"]')).toHaveValue("");
  await expect(form(page).locator('[name="content"]')).toHaveValue("");
  await expect(form(page).locator('[name="expectedUpdatedAt"]')).toHaveValue("");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `outputs/work-log-task-link/${info.project.name}-automatic.png` });
  expect(model.errors).toEqual([]);
});

test("manual content and automatic completed tasks stay separate in form and detail", async ({ page }, info) => {
  const entry = manualEntry();
  const model = await prepare(page, { entries: [entry] });
  await expect(form(page).locator('[name="keyword"]')).toHaveValue(entry.keyword);
  await expect(form(page).locator('[name="content"]')).toHaveValue(entry.content);
  await expect(form(page).locator('[name="expectedUpdatedAt"]')).toHaveValue(entry.manualUpdatedAt!);
  const dialog = await openDetail(page);
  await expect(dialog.getByText(entry.content, { exact: true })).toBeVisible();
  await expect(dialog.getByText(taskTitle, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "직접 작성 내용 삭제", exact: true })).toBeVisible();
  await expect.poll(() => model.detailDates).toContain(today);
  await page.screenshot({ path: `outputs/work-log-task-link/${info.project.name}-mixed-detail.png` });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(grass(page)).toBeFocused();
  expect(model.errors).toEqual([]);
});

test("automatic-only day accepts a manual note and deleting that note retains its automatic record", async ({ page }) => {
  const model = await prepare(page);
  let entry = automaticEntry();
  model.onAction(async (route, call) => {
    if (call.kind === "save") {
      expect(call.body.expectedUpdatedAt).toBe("");
      entry = { ...manualEntry(), keyword: String(call.body.keyword), content: String(call.body.content) };
      model.state.entries = [entry];
      return route.fulfill({ json: { state: model.state, result: { entry, values: call.body, success: "업무일지를 저장했습니다." } } });
    }
    expect(call.kind).toBe("delete");
    expect(call.body.workLogId).toBe(entry.manualLogId);
    expect(call.body.expectedUpdatedAt).toBe(entry.manualUpdatedAt);
    model.state.entries = [automaticEntry()];
    return route.fulfill({ json: { state: model.state, result: { deletedId: entry.manualLogId, success: "직접 작성한 내용을 삭제했습니다." } } });
  });
  let dialog = await openDetail(page);
  await expect(dialog.getByRole("button", { name: /삭제/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "추가 기록", exact: true }).click();
  await expect(dialog.locator('[name="keyword"]')).toHaveValue("");
  await expect(dialog.locator('[name="content"]')).toHaveValue("");
  await dialog.locator('[name="keyword"]').fill("추가 인수인계");
  await dialog.locator('[name="content"]').fill("완료한 업무 외에 다음 담당자에게 전달할 사항");
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog.getByText("추가 인수인계", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("region", { name: automaticRegion })).toBeVisible();
  await dialog.getByRole("button", { name: "직접 작성 내용 삭제", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "취소", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "삭제하기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("region", { name: automaticRegion }).getByText(taskTitle, { exact: true })).toBeVisible();
  await expect(form(page).locator('[name="keyword"]')).toHaveValue("");
  await expect(grass(page)).toHaveAttribute("aria-haspopup", "dialog");
  dialog = await openDetail(page);
  await expect(dialog.getByRole("button", { name: /삭제/ })).toHaveCount(0);
  expect(model.calls.map((call) => call.kind)).toEqual(["save", "delete"]);
  expect(model.errors).toEqual([]);
});

test("failed manual save preserves the draft, prevents duplicates, and focuses its error", async ({ page }) => {
  const model = await prepare(page);
  let release: (() => void) | undefined;
  model.onAction(async (route, call) => {
    await new Promise<void>((resolve) => { release = resolve; });
    return route.fulfill({ json: { result: { error: "저장하지 못했습니다. 다시 시도해 주세요.", values: call.body } } });
  });
  const editor = form(page);
  await editor.locator('[name="keyword"]').fill("보존할 키워드");
  await editor.locator('[name="content"]').fill("연결이 끊겨도 보존할 내용");
  await editor.locator('button[type="submit"]').click();
  await expect(editor.locator('button[type="submit"]')).toBeDisabled();
  await expect.poll(() => model.calls.length).toBe(1);
  release!();
  await expect(editor.getByRole("alert")).toBeFocused();
  await expect(editor.locator('[name="keyword"]')).toHaveValue("보존할 키워드");
  await expect(editor.locator('[name="content"]')).toHaveValue("연결이 끊겨도 보존할 내용");
  await expect(page.getByRole("region", { name: automaticRegion }).getByText(taskTitle, { exact: true })).toBeVisible();
  expect(model.calls[0].body.expectedUpdatedAt).toBe("");
  expect(model.errors).toEqual([]);
});

test("changing the selected date replaces the automatic task list and protects an unsaved note", async ({ page }) => {
  const prior = manualEntry(yesterday, false);
  const model = await prepare(page, { entries: [automaticEntry(), prior] });
  const editor = form(page);
  await editor.locator('[name="keyword"]').fill("오늘 작성 중");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("region", { name: automaticRegion }).getByRole("link").click();
  await expect(page).toHaveURL(/\/work-schedule\/work-log$/);
  await expect(editor.locator('[name="keyword"]')).toHaveValue("오늘 작성 중");
  const detail = await openDetail(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await detail.getByRole("region", { name: automaticRegion }).getByRole("link").click();
  await expect(detail).toBeVisible();
  await expect(page).toHaveURL(/\/work-schedule\/work-log$/);
  await page.keyboard.press("Escape");
  await expect(editor.locator('[name="keyword"]')).toHaveValue("오늘 작성 중");
  page.once("dialog", (dialog) => dialog.dismiss());
  await editor.locator('[name="workDate"]').fill(yesterday);
  await expect(editor.locator('[name="workDate"]')).toHaveValue(today);
  await expect(editor.locator('[name="keyword"]')).toHaveValue("오늘 작성 중");
  page.once("dialog", (dialog) => dialog.accept());
  await editor.locator('[name="workDate"]').fill(yesterday);
  await expect(page).toHaveURL(new RegExp(`date=${yesterday}`));
  await expect(form(page).locator('[name="content"]')).toHaveValue(prior.content);
  await expect(page.getByRole("region", { name: automaticRegion }).getByText(taskTitle, { exact: true })).toHaveCount(0);
  await form(page).locator('[name="workDate"]').fill(today);
  await expect(page.getByRole("region", { name: automaticRegion }).getByText(taskTitle, { exact: true })).toBeVisible();
  await expect(form(page).locator('[name="content"]')).toHaveValue("");
  expect(model.calls).toHaveLength(0);
  expect(model.errors).toEqual([]);
});

test("detail loads an automatic-only day outside the recent list and can retry a load error", async ({ page }) => {
  const oldDate = "2026-09-01";
  const model = await prepare(page, { entries: [], contributionDates: [oldDate] });
  let failed = true;
  model.onDetail(async (route, date) => {
    expect(date).toBe(oldDate);
    return route.fulfill({ status: failed ? 503 : 200, json: failed ? { error: "일시적으로 업무일지를 불러오지 못했습니다." } : { entry: automaticEntry(oldDate), linkedScheduleState: { status: "ready", schedules: [] } } });
  });
  await grass(page, oldDate).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toBeFocused();
  failed = false;
  await dialog.getByRole("button", { name: "다시 불러오기" }).click();
  await expect(dialog.getByRole("region", { name: automaticRegion }).getByText(taskTitle, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "추가 기록", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /삭제/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(grass(page, oldDate)).toBeFocused();
  expect(model.detailDates).toEqual([oldDate, oldDate]);
  expect(model.errors).toEqual([]);
});

test("long automatic task details remain usable across light, dark, narrow and zoom layouts", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("desktop"), "One explicit viewport matrix is sufficient.");
  test.setTimeout(60_000);
  const longTitle = "긴제목_프로그램참여자별_주간운영결과_정리및담당자확인_".repeat(4);
  const entry = automaticEntry(today, longTitle);
  entry.completedTasks = [entry.completedTasks![0], { ...entry.completedTasks![0], id: "second-task", title: "시설 안전 점검 결과 전달" }];
  entry.keyword = "할 일 완료 2건";
  const model = await prepare(page, { entries: [entry] });
  for (const [name, width, height] of [["desktop", 1366, 768], ["mobile", 390, 844], ["narrow", 320, 800], ["zoom", 683, 384]] as const) {
    await page.setViewportSize({ width, height });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((dark) => { document.documentElement.classList.toggle("dark", dark); window.scrollTo(0, 0); }, theme === "dark");
      const panel = page.getByRole("region", { name: automaticRegion });
      await expect(panel.getByRole("heading", { name: "완료한 할 일 2건" })).toBeVisible();
      const headingBounds = await panel.getByRole("heading", { name: "완료한 할 일 2건" }).boundingBox();
      expect(headingBounds?.y).toBeLessThan(height * 0.4);
      await expect(panel.getByText(longTitle, { exact: true })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `outputs/work-log-task-link/${name}-${theme}.png` });
      const dialog = await openDetail(page);
      await expect(dialog.getByRole("button", { name: "닫기", exact: true }).first()).toBeFocused();
      const actions = dialog.locator("button");
      for (let index = 0; index < await actions.count(); index++) {
        const actionBounds = await actions.nth(index).boundingBox();
        expect(actionBounds!.height).toBeGreaterThanOrEqual(44);
        expect(actionBounds!.width).toBeGreaterThanOrEqual(44);
      }
      await page.keyboard.press("Shift+Tab");
      await expect(dialog.getByRole("button", { name: "추가 기록", exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("button", { name: "닫기", exact: true }).first()).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `outputs/work-log-task-link/${name}-${theme}-detail.png` });
      await page.keyboard.press("Escape");
      await expect(grass(page)).toBeFocused();
    }
  }
  expect(model.errors).toEqual([]);
});
