import { expect, test, type Page } from "@playwright/test";

const testUserName = process.env.E2E_USER_NAME?.trim() || "김민준";
const testUserPassword = process.env.E2E_USER_PASSWORD || "password123";

test("로그인 후 청소년 명단 다단계 경로를 오류 없이 연다", async ({
  page,
}) => {
  const runtimeErrors = collectRuntimeErrors(page);

  const loginResponse = await page.goto("/login", {
    waitUntil: "domcontentloaded",
  });

  expect(loginResponse?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: /업무 시스템$/ }),
  ).toBeVisible();

  await page.getByLabel("이름").fill(testUserName);
  await page.getByLabel("비밀번호").fill(testUserPassword);
  await page.getByRole("button", { name: "로그인", exact: true }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "오늘의 업무" }),
  ).toBeVisible();

  const rosterResponse = await page.goto("/youth/roster", {
    waitUntil: "domcontentloaded",
  });

  expect(rosterResponse, "청소년 명단 문서 응답이 있어야 합니다.").not.toBeNull();
  expect(rosterResponse?.status(), "청소년 명단 경로가 404가 아니어야 합니다.").toBe(
    200,
  );
  await expect(
    page.getByRole("heading", { name: "청소년 명단", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "청소년 명단" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "요청한 화면을 찾을 수 없습니다" }),
  ).toHaveCount(0);

  // Exercise a client-only interaction so the test proves that the roster
  // hydrated, rather than only asserting against its server-rendered HTML.
  await page.getByRole("button", { name: "청소년 추가" }).click();
  await expect(page.getByRole("dialog", { name: "청소년 추가" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "청소년 추가" })).toHaveCount(0);

  // Give React two paint cycles to surface delayed hydration failures.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

  expect(runtimeErrors, formatRuntimeErrors(runtimeErrors)).toEqual([]);
});

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`[console.error] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`[pageerror] ${error.stack || error.message}`);
  });

  return errors;
}

function formatRuntimeErrors(errors: string[]) {
  return errors.length === 0
    ? "브라우저 런타임 오류가 없어야 합니다."
    : `브라우저 런타임 오류가 발생했습니다:\n${errors.join("\n\n")}`;
}
