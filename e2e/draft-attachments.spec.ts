import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { startDraftAttachmentFixture } from "./helpers/draft-attachment-fixture";

let fixture: Awaited<ReturnType<typeof startDraftAttachmentFixture>>;

test.beforeAll(async () => {
  fixture = await startDraftAttachmentFixture();
  await mkdir("outputs/draft-attachments", { recursive: true });
});

test.afterAll(async () => {
  await fixture?.close();
});

type DragOptions = {
  names?: string[];
  size?: number;
  textOnly?: boolean;
};

async function dragAttachment(
  page: Page,
  eventType: "dragenter" | "dragover" | "dragleave" | "drop",
  options: DragOptions = {},
) {
  return page.evaluate(
    ({ eventType, options }) => {
      const transfer = new DataTransfer();

      if (options.textOnly) {
        transfer.setData("text/plain", "ordinary selected text");
      } else {
        for (const name of options.names ?? ["드롭자료.pdf"]) {
          transfer.items.add(
            new File(
              [options.size === undefined ? "draft attachment" : new Uint8Array(options.size)],
              name,
              { type: "application/pdf", lastModified: 1_700_000_000_000 },
            ),
          );
        }
      }

      const target = document.querySelector('[data-testid="draft-attachment-dropzone"]');
      if (!target) throw new Error("Draft attachment drop zone was not rendered");

      const event = new DragEvent(eventType, {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      });

      return !target.dispatchEvent(event);
    },
    { eventType, options },
  );
}

async function stagedFileNames(page: Page) {
  return page.locator('input[name="attachments"]').evaluate((element) =>
    Array.from((element as HTMLInputElement).files ?? [], (file) => file.name),
  );
}

test("dropped files are staged, merged with picker files, and not submitted", async ({ page }) => {
  const pageErrors: string[] = [];
  const postRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST") postRequests.push(request.url());
  });
  await page.goto(fixture.url);

  const title = page.locator('input[name="title"]');
  const initialTitle = await title.inputValue();
  expect(await dragAttachment(page, "drop")).toBe(true);
  await expect(page.getByText("새 파일 1개 선택됨")).toBeVisible();
  expect(await stagedFileNames(page)).toEqual(["드롭자료.pdf"]);

  await page.locator('input[name="attachments"]').setInputFiles({
    name: "선택자료.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("picker attachment"),
  });
  await expect(page.getByText("새 파일 2개 선택됨")).toBeVisible();
  expect(await stagedFileNames(page)).toEqual(["드롭자료.pdf", "선택자료.pdf"]);

  await dragAttachment(page, "drop", { names: ["추가자료.pdf"] });
  await expect(page.getByText("새 파일 3개 선택됨")).toBeVisible();
  expect(await stagedFileNames(page)).toEqual([
    "드롭자료.pdf",
    "선택자료.pdf",
    "추가자료.pdf",
  ]);

  await dragAttachment(page, "drop");
  expect(await stagedFileNames(page)).toEqual([
    "드롭자료.pdf",
    "선택자료.pdf",
    "추가자료.pdf",
  ]);
  await expect(title).toHaveValue(initialTitle);
  expect(page.url()).toBe(fixture.url + "/");
  expect(postRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("invalid and text-only drops preserve the previously selected file", async ({ page }) => {
  await page.goto(fixture.url);

  expect(await dragAttachment(page, "drop", { textOnly: true })).toBe(false);
  expect(await stagedFileNames(page)).toEqual([]);

  await dragAttachment(page, "drop");
  await expect(page.getByText("새 파일 1개 선택됨")).toBeVisible();

  await dragAttachment(page, "drop", { names: ["차단.exe"] });
  await expect(page.getByRole("alert")).toHaveText("허용되지 않는 파일 형식입니다: 차단.exe");
  await expect(page.getByRole("alert")).toBeFocused();
  expect(await stagedFileNames(page)).toEqual(["드롭자료.pdf"]);

  await dragAttachment(page, "drop", {
    names: ["초과.pdf"],
    size: 10 * 1024 * 1024 + 1,
  });
  await expect(page.getByRole("alert")).toHaveText("파일은 10MB 이하만 등록할 수 있습니다: 초과.pdf");
  expect(await stagedFileNames(page)).toEqual(["드롭자료.pdf"]);

  await dragAttachment(page, "drop", {
    names: ["추가1.pdf", "추가2.pdf", "추가3.pdf"],
  });
  await expect(page.getByRole("alert")).toHaveText("첨부파일은 최대 3개까지 등록할 수 있습니다.");
  expect(await stagedFileNames(page)).toEqual(["드롭자료.pdf"]);
  await expect(page.getByText("새 파일 1개 선택됨")).toBeVisible();
});

test("selected attachment stays usable at desktop and narrow mobile sizes", async ({ page }, info) => {
  await page.goto(fixture.url);
  await dragAttachment(page, "dragenter");
  const dropZone = page.getByTestId("draft-attachment-dropzone");
  await expect(dropZone).toContainText("놓으면");
  await dragAttachment(page, "drop", {
    names: [`긴제목${"첨부자료".repeat(16)}.pdf`],
  });
  await expect(page.getByText("새 파일 1개 선택됨")).toBeVisible();

  for (const viewport of [page.viewportSize()!, { width: 320, height: 800 }]) {
    await page.setViewportSize(viewport);
    await dropZone.scrollIntoViewIfNeeded();
    const fileSelect = page.getByRole("button", { name: "파일 선택", exact: true });
    await expect(fileSelect).toBeVisible();
    expect((await fileSelect.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowing: Array.from(document.querySelectorAll("body *"))
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .sort((a, b) => b.scrollWidth - b.clientWidth - (a.scrollWidth - a.clientWidth))
        .slice(0, 10)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          text: element.textContent?.slice(0, 30),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })),
    }));
    expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width);
    await page.screenshot({
      path: `outputs/draft-attachments/${info.project.name}-${viewport.width}-selected.png`,
      fullPage: true,
    });
  }

  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await dropZone.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `outputs/draft-attachments/${info.project.name}-320-selected-dark.png`,
    fullPage: true,
  });
});
