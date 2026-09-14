import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", testMatch: "daily-reports.spec.ts", outputDir: "outputs/daily-reports/test-results",
  fullyParallel: false, workers: 1, reporter: "list", timeout: 30000, expect: { timeout: 10000 },
  use: { browserName: "chromium", screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1366, height: 768 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
