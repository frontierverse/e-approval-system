import { test, expect } from "@playwright/test";
import { startMobileAppUpdatesFixture } from "./helpers/mobile-app-updates-fixture";

test.describe("public mobile information", () => {
  let fixture: Awaited<ReturnType<typeof startMobileAppUpdatesFixture>>;
  test.beforeAll(async () => { fixture = await startMobileAppUpdatesFixture(); });
  test.afterAll(async () => { await fixture?.close(); });

  test("login links open both public pages without requesting employee APIs", async ({ page }) => {
    const apiRequests: string[] = [];
    page.on("request", request => { if (request.url().includes("/api/")) apiRequests.push(request.url()); });
    await page.goto(fixture.url + "?screen=public-login");
    await page.context().setOffline(true);
    await page.getByRole("link", { name: "개인정보처리방침", exact: true }).click();
    await expect(page.getByRole("heading", { name: "바자울 개인정보처리방침", exact: true })).toBeVisible();
    await expect(page.getByText("1. 처리 목적과 개인정보 항목", { exact: true })).toBeVisible();
    await page.getByText("8. 방침 변경", { exact: true }).scrollIntoViewIfNeeded();
    await page.getByRole("link", { name: "앱 지원", exact: true }).click();
    await expect(page.getByRole("heading", { name: "바자울 앱 지원", exact: true })).toBeVisible();
    await expect(page.getByText("artemismars2@gmail.com", { exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(apiRequests).toEqual([]);
  });

  for (const [width, height, theme, scale] of [[390, 844, "light", 1], [320, 800, "dark", 1], [360, 800, "light", 2], [1366, 768, "dark", 1], [195, 422, "light", 1]] as const) {
    test(`public content at ${width}px ${theme} font scale ${scale}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height }); await page.emulateMedia({ colorScheme: theme });
      for (const name of ["privacy", "support"]) {
        await page.goto(fixture.url + "?screen=public-" + name + "&fontScale=" + scale);
        const back = page.getByRole("button", { name: "이전 화면으로", exact: true });
        await expect(back).toBeVisible(); await back.focus(); await expect(back).toBeFocused();
        const target = await back.boundingBox(); expect(target!.height).toBeGreaterThanOrEqual(44); expect(target!.width).toBeGreaterThanOrEqual(44);
        await expect(page.getByRole("heading", { name: name === "privacy" ? "바자울 개인정보처리방침" : "바자울 앱 지원", exact: true })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`${name}-${width}-${theme}-${scale}-top.png`) });
        const related = page.getByRole("link", { name: "앱 지원", exact: true });
        await related.scrollIntoViewIfNeeded(); await expect(related).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        expect(await page.evaluate(() => [...document.querySelectorAll("div")].filter(node => node.getBoundingClientRect().right > innerWidth + 1).length)).toBe(0);
        const linkTarget = await related.boundingBox(); expect(linkTarget!.height).toBeGreaterThanOrEqual(44);
        await page.screenshot({ path: testInfo.outputPath(`${name}-${width}-${theme}-${scale}-bottom.png`) });
      }
    });
  }
});
