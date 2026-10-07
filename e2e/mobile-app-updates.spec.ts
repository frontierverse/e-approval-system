import { test, expect } from '@playwright/test';
import { startMobileAppUpdatesFixture } from './helpers/mobile-app-updates-fixture';

declare global {
  interface Window {
    qa: { reloads: number; native: { isUpdatePending: boolean }; setDirty(value: boolean): void; finishRequest(): void };
  }
}

test.describe('mobile update application', () => {
  let fixture: Awaited<ReturnType<typeof startMobileAppUpdatesFixture>>;
  test.beforeAll(async () => { fixture = await startMobileAppUpdatesFixture(); });
  test.afterAll(async () => { await fixture?.close(); });

  test('ready offers apply or later, and explicit apply locks against duplicate taps', async ({ page }) => {
    await page.goto(fixture.url);
    const apply = page.getByRole('button', { name: '업데이트 적용', exact: true });
    await expect(apply).toBeEnabled();
    expect(await page.evaluate(() => window.qa.reloads)).toBe(0);
    await apply.click();
    await expect(page.getByRole('button', { name: '적용 중…' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '나중에', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => window.qa.reloads)).toBe(1);
    await expect(page.getByText('11111111', { exact: true })).toBeVisible();
  });

  test('unsaved work and pending mutations disable application with an explanation', async ({ page }) => {
    for (const state of ['dirty', 'request']) {
      await page.goto(fixture.url + '?' + state);
      const apply = page.getByRole('button', { name: '업데이트 적용', exact: true });
      await expect(apply).toBeDisabled();
      await expect(page.getByText(state === 'dirty' ? /작성 중인 내용이나/ : /요청을 처리 중/)).toBeVisible();
      await page.evaluate(state => state === 'dirty' ? window.qa.setDirty(false) : window.qa.finishRequest(), state);
      await expect(apply).toBeEnabled();
      expect(await page.evaluate(() => window.qa.reloads)).toBe(0);
    }
  });

  test('native failure retains current code, reports safely, and enables retry', async ({ page }) => {
    await page.goto(fixture.url + '?error');
    await page.getByRole('button', { name: '업데이트 적용', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('현재 화면은 유지됩니다');
    await expect(page.getByRole('button', { name: '업데이트 적용', exact: true })).toBeEnabled();
    await expect(page.getByText('11111111', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '업데이트 적용', exact: true }).click();
    expect(await page.evaluate(() => window.qa.reloads)).toBe(2);
  });

  test('later dismisses the footer and preserves the downloaded update', async ({ page }) => {
    await page.goto(fixture.url + '?screen=footer');
    await page.getByRole('button', { name: '업데이트 나중에 적용', exact: true }).click();
    await expect(page.getByRole('button', { name: '업데이트 적용', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.qa.reloads)).toBe(0);
    expect(await page.evaluate(() => window.qa.native.isUpdatePending)).toBe(true);
  });

  for (const [width, height, theme, scale] of [[390, 844, 'light', 1], [320, 800, 'dark', 1], [360, 800, 'light', 2], [1366, 768, 'dark', 1], [195, 422, 'light', 1]] as const) {
    test(`readable controls at ${width}px ${theme} font scale ${scale}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height }); await page.emulateMedia({ colorScheme: theme });
      await page.goto(fixture.url + '?fontScale=' + scale);
      const apply = page.getByRole('button', { name: '업데이트 적용', exact: true });
      await expect(apply).toBeVisible();
      await apply.focus(); await expect(apply).toBeFocused();
      const box = await apply.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      expect(await page.evaluate(() => [...document.querySelectorAll('div')].filter(node => node.getBoundingClientRect().right > innerWidth + 1).length)).toBe(0);
      await page.screenshot({ path: testInfo.outputPath(`page-${width}-${theme}-${scale}.png`) });
      await page.goto(fixture.url + '?screen=footer&fontScale=' + scale);
      for (const name of ['업데이트 적용', '업데이트 나중에 적용', '앱 업데이트 상태 보기']) {
        const action = page.getByRole('button', { name, exact: true });
        await expect(action).toBeVisible();
        const target = await action.boundingBox(); expect(target!.height).toBeGreaterThanOrEqual(44); expect(target!.width).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      expect(await page.evaluate(() => [...document.querySelectorAll('div')].filter(node => node.getBoundingClientRect().right > innerWidth + 1).length)).toBe(0);
      await page.screenshot({ path: testInfo.outputPath(`footer-${width}-${theme}-${scale}.png`) });
    });
  }
});
