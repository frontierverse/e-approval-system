import { expect, test, type Page } from "@playwright/test";
import { startYouthRetentionFixture } from "./helpers/youth-retention-fixture";
let fixture: Awaited<ReturnType<typeof startYouthRetentionFixture>>;
test.beforeAll(async () => { fixture = await startYouthRetentionFixture(); });
test.afterAll(async () => { await fixture?.close(); });
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}
test("summary, priority rows, long text, filters and empty/loading states", async ({ page }, info) => {
  await page.goto(fixture.url);
  await expect(page.getByRole("heading", { name: "퇴소기록 관리" })).toBeVisible();
  const list = page.getByRole("region", { name: "처리할 퇴소기록" });
  expect((await list.boundingBox())!.y).toBeLessThan(page.viewportSize()!.height * .4);
  await expect(list.getByRole("listitem").first()).toContainText("검토청소년");
  await noOverflow(page);
  await page.screenshot({ path: `output/retention-${info.project.name}.png`, fullPage: true });
  await page.getByLabel("퇴소기록 이름 검색").fill("없음");
  await expect(page.getByText("검색 조건에 맞는 기록이 없습니다.")).toBeVisible();
  await page.goto(`${fixture.url}/?empty`); await expect(page.getByText("퇴소 확인이 필요한 기록이 없습니다.")).toBeVisible();
  await noOverflow(page);
  await page.goto(`${fixture.url}/?loading`); await noOverflow(page);
});
test("modal preserves errors, prevents duplicate saves and restores keyboard focus", async ({ page }) => {
  await page.goto(`${fixture.url}/?error`);
  const trigger = page.getByRole("button", { name: "확인청소년 보존 관리" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(dialog.getByRole("button", { name: "퇴소·보존 정보 저장" })).toBeFocused();
  await dialog.getByLabel("상담·사후관리 완료일", { exact: false }).fill("2026-10-01");
  await dialog.getByLabel("보존 보류 사유").fill("추가 보존 검토 중");
  await dialog.getByRole("button", { name: "퇴소·보존 정보 저장" }).click();
  await expect(dialog.getByRole("button", { name: "처리 중…" })).toBeDisabled();
  await expect(dialog.getByRole("alert")).toBeFocused();
  await expect(dialog.getByLabel("보존 보류 사유")).toHaveValue("추가 보존 검토 중");
  expect(await page.evaluate(() => (window as unknown as { fixtureCalls: { save: number } }).fixtureCalls.save)).toBe(1);
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
});
test("read needs a reason and purge needs review plus exact target name", async ({ page }, info) => {
  await page.goto(fixture.url);
  expect(await page.getByText("관리자에게만 열람되는 기록").count()).toBe(0);
  await page.getByRole("button", { name: "보존청소년 보존 기록 열람" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("열람 사유").selectOption("RETENTION_REVIEW");
  await dialog.getByRole("button", { name: "사유를 기록하고 열람" }).click();
  await expect(dialog.getByText("관리자에게만 열람되는 기록")).toBeVisible();
  await expect(dialog.getByText("보존된 업무보고")).toBeVisible(); await noOverflow(page);
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "검토청소년 개인정보 파기" }).click();
  dialog = page.getByRole("dialog");
  const submit = dialog.getByRole("button", { name: "개인정보 영구 파기" });
  await expect(submit).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByLabel("확인을 위해 청소년 이름 입력").fill("다른 이름"); await expect(submit).toBeDisabled();
  await dialog.getByLabel("확인을 위해 청소년 이름 입력").fill("검토청소년");
  await noOverflow(page); await page.screenshot({ path: `output/retention-purge-${info.project.name}.png` });
  await submit.click(); await expect(dialog).toHaveCount(0); await expect(page.getByRole("status")).toContainText("파기했습니다");
});
test("small mobile dark theme and 200 percent zoom keep actions reachable", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`${fixture.url}/?dark`); await noOverflow(page);
  await page.getByRole("button", { name: "검토청소년 개인정보 파기" }).click();
  await noOverflow(page); await page.screenshot({ path: `output/retention-small-dark-${info.project.name}.png` });
  await page.goto(`${fixture.url}/?zoom`); await noOverflow(page);
  const refresh = page.getByRole("button", { name: "상태 새로고침", exact: true });
  const discharge = page.getByLabel("조기 퇴소 대상 선택");
  for (const control of [discharge, refresh]) {
    await expect(control).toBeVisible();
    const bounds = (await control.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  await refresh.click();
  await expect(refresh).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { fixtureCalls: { refresh: number } }).fixtureCalls.refresh)).toBe(1);
  await expect(page.getByRole("button", { name: "검토청소년 보존 관리" })).toBeVisible();
  await page.screenshot({ path: `output/retention-small-zoom-${info.project.name}.png` });
});

test("pending purge ends processing without claiming completion and status refresh performs no purge", async ({ page }, info) => {
  await page.goto(`${fixture.url}/?pending-purge`);
  const trigger = page.getByRole("button", { name: "검토청소년 개인정보 파기" });
  await trigger.click();
  const confirmation = page.getByRole("dialog");
  await confirmation.getByRole("checkbox").check();
  await confirmation.getByLabel("확인을 위해 청소년 이름 입력").fill("검토청소년");
  await confirmation.getByRole("button", { name: "개인정보 영구 파기" }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("파기 요청을 접수했습니다");
  await expect(page.getByRole("status")).not.toContainText("파기했습니다");
  const check = page.getByRole("button", { name: "검토청소년 파기 상태 확인" });
  await check.click();
  const progress = page.getByRole("dialog");
  await expect(progress.getByRole("status")).toContainText("파일 전송 종료");
  await expect(progress.getByRole("button", { name: "승인된 파기 재점검" })).toHaveCount(0);
  await expect(progress.getByRole("checkbox")).toHaveCount(0);
  await progress.getByRole("button", { name: "상태 새로고침", exact: true }).click();
  await expect(progress.getByRole("button", { name: "상태 확인 중…" })).toBeDisabled();
  await expect(progress.getByRole("button", { name: "상태 새로고침", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { fixtureCalls: { purge: number; refresh: number } }).fixtureCalls)).toMatchObject({ purge: 1, refresh: 1 });
  await noOverflow(page);
  await page.screenshot({ path: `output/retention-pending-${info.project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(progress).toHaveCount(0);
  await expect(check).toBeFocused();
});
