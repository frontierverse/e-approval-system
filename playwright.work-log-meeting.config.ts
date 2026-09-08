import { defineConfig } from "@playwright/test";
import workLogConfig from "./playwright.work-log.config";

export default defineConfig({
  ...workLogConfig,
  testMatch: "work-log-meeting-link.spec.ts",
  outputDir: "outputs/work-log-meeting-link/test-results",
});
