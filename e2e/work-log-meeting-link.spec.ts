import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";
import sharp from "sharp";
import { startWorkLogTaskFixture } from "./helpers/work-log-task-fixture";
import type { WorkLogEntry, WorkLogMeetingDocument } from "../src/lib/work-log-core";

const today = "2026-09-08";
const meetingDate = "2026-09-07";
const meetingTitle = "운영 개선 및 주간 프로그램 회의";
const pdfName = "주간 운영 회의록.pdf";
const imageName = "회의 결과 참고 이미지.png";
const panelName = "회의록 파일 자동 기록";
type MeetingEntry = WorkLogEntry & { meetingDocuments: WorkLogMeetingDocument[] };
let pdfBytes: Buffer;
let imageBytes: Buffer;
let fixture: Awaited<ReturnType<typeof startWorkLogTaskFixture>>;

test.beforeAll(async () => {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < 2; index++) {
    const page = pdf.addPage([400, 260]);
    page.drawRectangle({ x: 0, y: 0, width: 400, height: 260, color: index ? rgb(0.1, 0.45, 0.3) : rgb(0.1, 0.3, 0.6) });
    page.drawText(index ? "Synthetic meeting record: second page" : "Synthetic meeting record: first page", { x: 24, y: 200, size: 15, color: rgb(1, 1, 1) });
  }
  [pdfBytes, imageBytes, fixture] = await Promise.all([
    pdf.save().then((bytes) => Buffer.from(bytes)),
    sharp({ create: { width: 240, height: 160, channels: 3, background: { r: 20, g: 130, b: 110 } } }).png().toBuffer(),
    startWorkLogTaskFixture(),
  ]);
  await mkdir("outputs/work-log-meeting-link", { recursive: true });
});
test.afterAll(async () => { await fixture?.close(); });

function meetingEntry(options: { manual?: boolean; task?: boolean; date?: string; longName?: boolean } = {}): MeetingEntry {
  const date = options.date ?? meetingDate;
  return {
    id: options.manual ? `manual-${date}` : `meetings:test-me:${date}`,
    workDate: date, keyword: options.manual ? "기존 업무 내용" : "회의록 1건", content: options.manual ? "직접 작성한 업무 내용은 변경하지 않습니다." : "",
    authorName: "검증 직원", createdAt: `${date}T01:00:00.000Z`, updatedAt: `${date}T02:00:00.000Z`, updatedByName: null,
    manualLogId: options.manual ? `manual-${date}` : null, manualUpdatedAt: options.manual ? `${date}T02:00:00.000Z` : null,
    completedTasks: options.task ? [{ id: "test-task-me", title: "프로그램 결과 정리", description: "성과 지표 확인", meetingTitle: null, completedAt: `${date}T00:30:00.000Z` }] : [],
    meetingDocuments: [{ id: "test-meeting", title: meetingTitle, meetingDate: date, documentNo: "MEETING-2026-0907", status: "APPROVED", attachments: [
      { id: "test-meeting-pdf", originalName: options.longName ? `${"길고자세한_참여자별회의결과_".repeat(6)}.pdf` : pdfName, mimeType: "application/pdf", size: pdfBytes.length, isSigned: false },
      { id: "test-meeting-image", originalName: imageName, mimeType: "image/png", size: imageBytes.length, isSigned: true },
    ] }],
  };
}

async function prepare(page: Page, entry = meetingEntry(), options: { initialEntry?: boolean } = {}) {
  const entries = options.initialEntry === false ? [] : [entry];
  const data = { today, entries, tasks: [], contributionDates: [entry.workDate] };
  const errors: string[] = [];
  const fileRequests: { id: string; preview: boolean; method: string }[] = [];
  const actionCalls: { kind: string; body: Record<string, string> }[] = [];
  let fileHandler: ((route: Route, id: string, preview: boolean) => Promise<boolean>) | undefined;
  let actionHandler: ((route: Route, body: Record<string, string>) => Promise<void>) | undefined;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((state) => {
    (window as unknown as { __workLogTaskInitial: typeof state }).__workLogTaskInitial = state;
  }, data);
  await page.route("**/api/work-logs/**", (route) => route.fulfill({ json: { entry, linkedScheduleState: { status: "ready", schedules: [] } } }));
  await page.route("**/attachments/**", async (route) => {
    const parts = new URL(route.request().url()).pathname.split("/");
    const id = parts[2];
    const preview = parts[3] === "preview";
    fileRequests.push({ id, preview, method: route.request().method() });
    if (fileHandler && await fileHandler(route, id, preview)) return;
    const attachment = entry.meetingDocuments.flatMap((document) => document.attachments).find((item) => item.id === id);
    if (!attachment) throw new Error(`Unexpected synthetic attachment: ${id}`);
    return route.fulfill({ contentType: attachment.mimeType, body: id === "test-meeting-image" ? imageBytes : pdfBytes });
  });
  await page.route("**/fixture-actions/**", async (route) => {
    const body = route.request().postDataJSON() as Record<string, string>;
    actionCalls.push({ kind: new URL(route.request().url()).pathname.split("/").at(-1)!, body });
    if (actionHandler) return actionHandler(route, body);
    throw new Error("Meeting automatic record must not mutate without an explicit test action");
  });
  await page.goto(`${fixture.url}/work-schedule/work-log?date=${entry.workDate}`);
  await expect(page.getByRole("heading", { level: 1, name: "업무일지" })).toBeVisible();
  return { data, entry, errors, fileRequests, actionCalls,
    onFile(handler: typeof fileHandler) { fileHandler = handler; },
    onAction(handler: typeof actionHandler) { actionHandler = handler; },
  };
}

function grass(page: Page) { return page.locator(`[data-work-log-grass-cell="${meetingDate}"]`); }
async function openWorkLog(page: Page) {
  await grass(page).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("region", { name: panelName })).toBeVisible();
  return dialog;
}

test("a meeting-only work day appears in its panel, recent records, grass and freshly loaded detail", async ({ page }, info) => {
  const model = await prepare(page);
  const panel = page.getByRole("region", { name: panelName });
  await expect(panel.getByText(meetingTitle, { exact: true })).toBeVisible();
  await expect(panel.getByText(pdfName, { exact: true })).toBeVisible();
  await expect(panel.getByText(imageName, { exact: true })).toBeVisible();
  await expect(grass(page)).toHaveAttribute("aria-haspopup", "dialog");
  await expect(page.locator(`[data-work-log-grass-cell="${today}"]`)).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("region", { name: "최근 업무일지" }).getByText(/회의록/).first()).toBeVisible();
  await expect(page.locator('main form [name="keyword"]')).toHaveValue("");
  await expect(page.locator('main form [name="content"]')).toHaveValue("");
  await expect(page.locator('main form [name="expectedUpdatedAt"]')).toHaveValue("");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `outputs/work-log-meeting-link/${info.project.name}-meeting-only.png` });
  const dialog = await openWorkLog(page);
  await expect(dialog.getByRole("button", { name: "추가 기록", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /삭제/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(grass(page)).toBeFocused();
  expect(model.actionCalls).toHaveLength(0);
  expect(model.errors).toEqual([]);
});

test("meeting files coexist with completed tasks and preserve manually written content", async ({ page }, info) => {
  const entry = meetingEntry({ manual: true, task: true });
  const model = await prepare(page, entry);
  await expect(page.locator('main form [name="keyword"]')).toHaveValue(entry.keyword);
  await expect(page.locator('main form [name="content"]')).toHaveValue(entry.content);
  await expect(page.locator('main form [name="expectedUpdatedAt"]')).toHaveValue(entry.manualUpdatedAt!);
  await expect(page.getByRole("region", { name: "완료한 할 일 자동 기록" }).getByText("프로그램 결과 정리", { exact: true })).toBeVisible();
  const draft = `${entry.content}\n추가로 작성 중인 전달 사항`;
  await page.locator('main form [name="content"]').fill(draft);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("region", { name: panelName }).getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`date=${meetingDate}$`));
  await expect(page.locator('main form [name="content"]')).toHaveValue(draft);
  const dialog = await openWorkLog(page);
  await expect(dialog.getByRole("region", { name: panelName }).getByText(pdfName, { exact: true })).toBeVisible();
  await expect(dialog.getByText(entry.content, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "직접 작성 내용 삭제", exact: true })).toBeVisible();
  page.once("dialog", (confirmation) => confirmation.dismiss());
  await dialog.getByRole("region", { name: panelName }).getByRole("link").click();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`date=${meetingDate}$`));
  await expect(page.locator('main form [name="content"]')).toHaveValue(draft);
  await page.screenshot({ path: `outputs/work-log-meeting-link/${info.project.name}-combined-detail.png` });
  expect(model.actionCalls).toHaveLength(0);
  expect(model.errors).toEqual([]);
});

test("PDF preview inside work-log detail renders pages and preserves both modal focus levels", async ({ page }, info) => {
  const model = await prepare(page, meetingEntry(), { initialEntry: false });
  const originalOverflow = await page.locator("body").evaluate((body) => body.style.overflow);
  const outer = await openWorkLog(page);
  const trigger = outer.getByRole("button", { name: `${pdfName} 미리보기`, exact: true });
  await trigger.click();
  const preview = page.getByRole("dialog", { name: `${pdfName} 미리보기`, exact: true });
  await expect(preview.getByRole("button", { name: "미리보기 닫기" })).toBeFocused();
  await expect(preview.getByRole("img", { name: `${pdfName} 1 / 2쪽` })).toBeVisible();
  await preview.getByRole("button", { name: "다음 페이지" }).click();
  await expect(preview.getByRole("img", { name: `${pdfName} 2 / 2쪽` })).toBeVisible();
  await page.screenshot({ path: `outputs/work-log-meeting-link/${info.project.name}-pdf-preview.png` });
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(outer).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(outer).toHaveCount(0);
  await expect(grass(page)).toBeFocused();
  await expect.poll(() => page.locator("body").evaluate((body) => body.style.overflow)).toBe(originalOverflow);
  expect(model.fileRequests.some((item) => item.id === "test-meeting-pdf" && item.preview)).toBe(true);
  expect(model.fileRequests.every((item) => item.method === "GET")).toBe(true);
  expect(model.actionCalls).toHaveLength(0);
  expect(model.errors).toEqual([]);
});

test("image previews and repeat downloads leave the linked meeting file available", async ({ page }) => {
  const model = await prepare(page);
  const panel = page.getByRole("region", { name: panelName });
  const trigger = panel.getByRole("button", { name: `${imageName} 미리보기`, exact: true });
  await trigger.click();
  const preview = page.getByRole("dialog", { name: `${imageName} 미리보기`, exact: true });
  const image = preview.getByRole("img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(240);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  for (let attempt = 0; attempt < 2; attempt++) {
    const event = page.waitForEvent("download");
    await panel.getByRole("button", { name: `${pdfName} 다운로드`, exact: true }).click();
    const download = await event;
    expect(download.suggestedFilename()).toBe(pdfName);
    expect(await download.failure()).toBeNull();
    await expect(panel.getByText(pdfName, { exact: true })).toBeVisible();
  }
  expect(model.fileRequests.filter((item) => !item.preview)).toHaveLength(2);
  expect(model.fileRequests.every((item) => item.method === "GET")).toBe(true);
  expect(model.actionCalls).toHaveLength(0);
  expect(model.errors).toEqual([]);
});

test("leaving the page while nested previews are open restores page scrolling", async ({ page }) => {
  const model = await prepare(page);
  const originalOverflow = await page.locator("body").evaluate((body) => body.style.overflow);
  for (const overflow of [originalOverflow, "auto"]) {
    await page.evaluate(({ value, date }) => {
      document.body.style.overflow = value;
      (window as unknown as { __workLogTaskNavigate: (url: string) => void }).__workLogTaskNavigate(`/work-schedule/work-log?date=${date}`);
    }, { value: overflow, date: meetingDate });
    const outer = await openWorkLog(page);
    await outer.getByRole("button", { name: `${pdfName} 미리보기`, exact: true }).click();
    const preview = page.getByRole("dialog", { name: `${pdfName} 미리보기`, exact: true });
    await expect(preview.getByRole("img", { name: `${pdfName} 1 / 2쪽` })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(2);
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

    // A router change (for example browser history) unmounts both production
    // modals together, without executing either modal's own close button.
    await page.evaluate(() => {
      (window as unknown as { __workLogTaskNavigate: (url: string) => void }).__workLogTaskNavigate("/tasks");
    });
    await expect(page.getByRole("heading", { level: 1, name: "내 할 일" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => page.locator("body").evaluate((body) => body.style.overflow)).toBe(overflow);
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  }
  expect(model.errors).toEqual([]);
});

test("preview and download permission failures keep the user in the work log and support recovery", async ({ page }) => {
  const model = await prepare(page);
  let denied = true;
  model.onFile(async (route) => {
    if (!denied) return false;
    await route.fulfill({ status: 403, json: { error: "이 파일을 열람할 권한이 없습니다." } });
    return true;
  });
  const panel = page.getByRole("region", { name: panelName });
  await panel.getByRole("button", { name: `${pdfName} 다운로드`, exact: true }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`date=${meetingDate}$`));
  await panel.getByRole("button", { name: `${pdfName} 미리보기`, exact: true }).click();
  const preview = page.getByRole("dialog", { name: `${pdfName} 미리보기`, exact: true });
  await expect(preview.getByRole("alert")).toBeVisible();
  await expect(preview.getByRole("img")).toHaveCount(0);
  denied = false;
  await preview.getByRole("button", { name: /다시/ }).click();
  await expect(preview.getByRole("img", { name: `${pdfName} 1 / 2쪽` })).toBeVisible();
  await page.keyboard.press("Escape");
  const event = page.waitForEvent("download");
  await panel.getByRole("button", { name: `${pdfName} 다운로드`, exact: true }).click();
  expect(await (await event).failure()).toBeNull();
  expect(model.errors).toEqual([]);
});

test("meeting files and nested previews remain accessible across light, dark, narrow and zoom layouts", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("desktop"), "One explicit viewport matrix is sufficient.");
  test.setTimeout(60_000);
  const entry = meetingEntry({ longName: true });
  const longName = entry.meetingDocuments[0].attachments[0].originalName;
  const model = await prepare(page, entry);
  for (const [name, width, height] of [["desktop", 1366, 768], ["mobile", 390, 844], ["narrow", 320, 800], ["zoom", 683, 384]] as const) {
    await page.setViewportSize({ width, height });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((dark) => { document.documentElement.classList.toggle("dark", dark); window.scrollTo(0, 0); }, theme === "dark");
      const panel = page.getByRole("region", { name: panelName });
      await expect(panel.getByText(meetingTitle, { exact: true })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `outputs/work-log-meeting-link/${name}-${theme}.png` });
      const outer = await openWorkLog(page);
      await outer.getByRole("button", { name: `${longName} 미리보기`, exact: true }).click();
      const preview = page.getByRole("dialog", { name: `${longName} 미리보기`, exact: true });
      await expect(preview.getByRole("img", { name: `${longName} 1 / 2쪽` })).toBeVisible();
      await expect(preview.getByRole("button", { name: "미리보기 닫기" })).toBeInViewport();
      const actions = preview.locator("button");
      for (let index = 0; index < await actions.count(); index++) {
        const bounds = await actions.nth(index).boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `outputs/work-log-meeting-link/${name}-${theme}-preview.png` });
      await page.keyboard.press("Escape");
      await expect(outer.getByRole("button", { name: `${longName} 미리보기`, exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(grass(page)).toBeFocused();
    }
  }
  expect(model.errors).toEqual([]);
});
