import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PDFDocument, rgb } from "pdf-lib";
import sharp from "sharp";
import { startStaffChatFixture } from "./helpers/staff-chat-fixture";
import type { ChatEmployee, ChatMessage } from "../src/lib/staff-chat-types";

type SendBody = { peerId: string; body: string; requestId: string };
const filePolicy = { maxFileSize: 4 * 1024 * 1024, zipMaxFileSize: 100 * 1024 * 1024, uploadChunkSize: 4 * 1024 * 1024, allowedExtensions: [".pdf", ".txt", ".docx", ".xlsx", ".png", ".jpg", ".zip"], maxFileCount: 1 };
const employees: ChatEmployee[] = [
  { id: "test-a", name: "검증직원 가", departmentName: "운영지원팀", positionName: "주임", active: true },
  { id: "test-b", name: "검증직원 나", departmentName: "생활지원팀", positionName: "대리", active: true },
];
const firstMessage: ChatMessage = {
  id: "message-a-1", sequence: "1", senderId: "test-a", recipientId: "test-me", body: "회의 자료를 확인해 주세요.",
  createdAt: "2026-09-08T01:00:00.000Z", readAt: null,
};
let fixture: Awaited<ReturnType<typeof startStaffChatFixture>>;
let previewImageBytes: Buffer;
let previewPdfBytes: Buffer;

test.beforeAll(async () => {
  fixture = await startStaffChatFixture();
  const pdf = await PDFDocument.create();
  for (let index = 0; index < 2; index++) {
    const page = pdf.addPage([360, 240]);
    page.drawRectangle({ x: 0, y: 0, width: 360, height: 240, color: index ? rgb(0.1, 0.6, 0.3) : rgb(0.1, 0.3, 0.8) });
    page.drawText(index ? "Second preview page" : "First preview page", { x: 25, y: 180, size: 20, color: rgb(1, 1, 1) });
  }
  [previewImageBytes, previewPdfBytes] = await Promise.all([
    sharp({ create: { width: 240, height: 160, channels: 3, background: { r: 20, g: 130, b: 110 } } }).png().toBuffer(),
    pdf.save().then((bytes) => Buffer.from(bytes)),
  ]);
  await Promise.all([mkdir("outputs/chat", { recursive: true }), mkdir("outputs/chat-files", { recursive: true }), mkdir("outputs/chat-previews", { recursive: true })]);
});
test.afterAll(async () => { await fixture?.close(); });

async function prepare(page: Page, options: { empty?: boolean; initialFailure?: boolean } = {}) {
  const messages: ChatMessage[] = options.empty ? [] : [{ ...firstMessage }];
  const sent: SendBody[] = [];
  const olderCursors: string[] = [];
  const errors: string[] = [];
  let failLoad = options.initialFailure ?? false;
  let sendHandler: ((route: Route, body: SendBody) => Promise<void>) | undefined;
  let messageHandler: ((route: Route, peerId: string) => Promise<boolean>) | undefined;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const sources: EventTarget[] = [];
    class FixtureEventSource extends EventTarget {
      readyState = 1;
      constructor() {
        super(); sources.push(this);
        setTimeout(() => this.dispatchEvent(new MessageEvent("ready", { data: "{}" })), 20);
      }
      close() { this.readyState = 2; }
    }
    Object.defineProperty(window, "EventSource", { value: FixtureEventSource });
    Object.defineProperty(window, "emitChatEvent", { value: (name: string) => {
      for (const source of sources) source.dispatchEvent(new MessageEvent(name, { data: "{}" }));
    }});
  });
  await page.route("**/api/chat**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/chat/files" && route.request().method() === "GET") {
      return route.fulfill({ json: filePolicy });
    }
    if (url.pathname === "/api/chat") {
      if (failLoad) return route.fulfill({ status: 503, json: { error: "채팅을 불러오지 못했습니다. 다시 시도해 주세요." } });
      const conversations = employees.flatMap((peer) => {
        const thread = messages.filter((message) => message.senderId === peer.id || message.recipientId === peer.id);
        return thread.length ? [{ peer, lastMessage: thread.at(-1), unreadCount: thread.filter((message) => message.senderId === peer.id && !message.readAt).length }] : [];
      });
      return route.fulfill({ json: { employees, conversations, unreadCount: conversations.reduce((sum, row) => sum + row.unreadCount, 0) } });
    }
    if (url.pathname === "/api/chat/messages" && route.request().method() === "GET") {
      const peerId = url.searchParams.get("peerId") ?? "";
      if (messageHandler && await messageHandler(route, peerId)) return;
      const thread = messages
        .filter((message) => message.senderId === peerId || message.recipientId === peerId)
        .sort((left, right) => Number(BigInt(left.sequence) - BigInt(right.sequence)));
      const before = url.searchParams.get("before");
      if (before) olderCursors.push(before);
      const end = before ? thread.findIndex((message) => message.id === before) : thread.length;
      if (end < 0) return route.fulfill({ status: 404, json: { error: "메시지를 찾을 수 없습니다." } });
      return route.fulfill({ json: { messages: thread.slice(Math.max(0, end - 50), end), hasMore: end > 50 } });
    }
    if (url.pathname === "/api/chat/messages" && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as SendBody;
      sent.push(body);
      if (sendHandler) return sendHandler(route, body);
      const message: ChatMessage = { id: `sent-${sent.length}`, sequence: String(messages.length + 1), senderId: "test-me", recipientId: body.peerId, body: body.body, createdAt: new Date().toISOString(), readAt: null };
      messages.push(message);
      return route.fulfill({ json: { message } });
    }
    if (url.pathname === "/api/chat/read") {
      const body = route.request().postDataJSON() as { peerId: string; messageId: string };
      const index = messages.findIndex((message) => message.id === body.messageId);
      messages.forEach((message, position) => { if (position <= index && message.senderId === body.peerId) message.readAt = new Date().toISOString(); });
      return route.fulfill({ json: { ok: true } });
    }
    throw new Error(`Unexpected chat fixture request: ${route.request().method()} ${url.pathname}`);
  });
  await page.goto(fixture.url);
  return {
    messages, sent, errors, olderCursors,
    setLoadFailure(value: boolean) { failLoad = value; },
    onSend(handler: typeof sendHandler) { sendHandler = handler; },
    onMessages(handler: typeof messageHandler) { messageHandler = handler; },
    emit: (name = "change") => page.evaluate((eventName) => {
      (window as unknown as { emitChatEvent: (name: string) => void }).emitChatEvent(eventName);
    }, name),
  };
}

async function openEmployee(page: Page, name: string) {
  const dialog = page.getByRole("dialog", { name: "직원 채팅", exact: true });
  if (!await dialog.isVisible()) await page.getByRole("button", { name: /^직원 채팅/ }).click();
  await page.getByRole("button", { name: /^직원 \d+$/ }).click();
  await page.getByRole("button", { name: `${name} 대화 열기`, exact: true }).click();
}

async function screenshot(page: Page, name: string, project: string) {
  await page.screenshot({ path: `outputs/chat/${project}-${name}.png`, fullPage: true });
}

async function controlUploadProgress(page: Page) {
  // Keep the real XHR and intercepted request/response. Only control upload
  // events, since localhost otherwise transmits each part before a frame paints.
  await page.addInitScript(() => {
    let current: XMLHttpRequestUpload | undefined;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      current = this.upload;
      this.upload.addEventListener("progress", (event) => {
        if (event.isTrusted) event.stopImmediatePropagation();
      }, true);
      send.call(this, body);
    };
    Object.defineProperty(window, "emitUploadProgress", { value: (percent: number) => {
      if (!current) throw new Error("No upload is active");
      current.dispatchEvent(new ProgressEvent("progress", { lengthComputable: true, loaded: percent * 100, total: 10_000 }));
    } });
  });
  return (percent: number) => page.evaluate((value) => {
    (window as unknown as { emitUploadProgress: (value: number) => void }).emitUploadProgress(value);
  }, percent);
}

async function expectUploadGauge(page: Page, percent: number) {
  const gauge = page.getByRole("progressbar");
  await expect(gauge).toBeVisible();
  await expect(gauge).toHaveAttribute("aria-valuemin", "0");
  await expect(gauge).toHaveAttribute("aria-valuemax", "100");
  await expect(gauge).toHaveAttribute("aria-valuenow", String(percent));
  await expect(gauge).toHaveAttribute("aria-valuetext", new RegExp(`${percent}%$`));
  // Measure the rendered fill after the transition, not just its inline style.
  await expect.poll(() => gauge.evaluate((element) => {
    const fill = element.firstElementChild!.getBoundingClientRect();
    return Math.round(fill.width / element.getBoundingClientRect().width * 100);
  })).toBe(percent);
}

type FileSendBody = SendBody & { fileName: string; size: number; content: string };
type DownloadBody = { requestId: string };
const attachmentBytes = Buffer.from("%PDF-1.4\nchat attachment test document\n%%EOF");
const attachmentName = "회의자료.pdf";
// A valid empty ZIP archive, including its end-of-central-directory record.
const zipBytes = Buffer.from("504b0506000000000000000000000000000000000000", "hex");

function attachmentMessage(options: { mine?: boolean; status?: NonNullable<ChatMessage["attachment"]>["status"]; name?: string; size?: number } = {}): ChatMessage {
  return {
    ...firstMessage,
    id: "message-file-1",
    body: "",
    senderId: options.mine ? "test-me" : "test-a",
    recipientId: options.mine ? "test-a" : "test-me",
    attachment: { id: "file-1", originalName: options.name ?? attachmentName, size: options.size ?? attachmentBytes.length, status: options.status ?? "available" },
  };
}

async function prepareFiles(page: Page, initial: ChatMessage[] = []) {
  const state = await prepare(page, { empty: true });
  state.messages.push(...initial);
  const uploads: FileSendBody[] = [];
  const downloads: DownloadBody[] = [];
  const completions: { token: string }[] = [];
  const previews: string[] = [];
  const binaries = new Map<string, { bytes: Buffer; contentType: string }>();
  let uploadHandler: ((route: Route, body: FileSendBody) => Promise<boolean>) | undefined;
  let downloadHandler: ((route: Route, body: DownloadBody) => Promise<boolean>) | undefined;
  let completeHandler: ((route: Route, body: { token: string }) => Promise<boolean>) | undefined;
  let previewHandler: ((route: Route, id: string) => Promise<boolean>) | undefined;
  await page.route("**/api/chat/files**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/chat/files" && request.method() === "GET") return route.fulfill({ json: filePolicy });
    const previewMatch = /^\/api\/chat\/files\/([^/]+)\/preview$/.exec(url.pathname);
    if (previewMatch) {
      expect(request.method()).toBe("GET");
      const id = previewMatch[1];
      previews.push(id);
      if (previewHandler && await previewHandler(route, id)) return;
      const attachment = state.messages.find((message) => message.attachment?.id === id)?.attachment;
      if (!attachment || attachment.status === "deleted" || attachment.status === "deleting") {
        return route.fulfill({ status: 410, json: { error: "이미 삭제된 파일입니다." } });
      }
      const file = binaries.get(id);
      if (!file) throw new Error(`Missing preview fixture bytes for ${id}`);
      return route.fulfill({ contentType: file.contentType, body: file.bytes });
    }
    expect(request.method()).toBe("POST");
    if (url.pathname === "/api/chat/files") {
      const form = await new Response(new Uint8Array(request.postDataBuffer()!), {
        headers: { "Content-Type": request.headers()["content-type"] },
      }).formData();
      const file = form.get("file") as File;
      const body: FileSendBody = {
        peerId: String(form.get("peerId")), body: String(form.get("body") ?? ""), requestId: String(form.get("requestId")),
        fileName: file.name, size: file.size, content: await file.text(),
      };
      uploads.push(body);
      if (uploadHandler && await uploadHandler(route, body)) return;
      const message: ChatMessage = {
        ...attachmentMessage({ mine: true, name: body.fileName, size: body.size }),
        id: `uploaded-${uploads.length}`, sequence: String(state.messages.length + 1), recipientId: body.peerId, body: body.body,
      };
      state.messages.push(message);
      return route.fulfill({ json: { message } });
    }
    const match = /^\/api\/chat\/files\/([^/]+)\/(download|complete)$/.exec(url.pathname);
    if (!match) throw new Error(`Unexpected attachment fixture request: ${url.pathname}`);
    const message = state.messages.find((item) => item.attachment?.id === match[1]);
    if (!message?.attachment) return route.fulfill({ status: 404, json: { error: "파일을 찾을 수 없습니다." } });
    if (match[2] === "download") {
      const body = request.postDataJSON() as DownloadBody;
      downloads.push(body);
      if (downloadHandler && await downloadHandler(route, body)) return;
      if (message.attachment.status === "deleted") return route.fulfill({ status: 410, json: { error: "이미 다운로드하여 삭제된 파일입니다." } });
      return route.fulfill({
        contentType: "application/octet-stream", body: binaries.get(match[1])?.bytes ?? attachmentBytes,
        headers: message.recipientId === "test-me" ? { "X-Chat-Download-Token": "test-download-token" } : {},
      });
    }
    const body = request.postDataJSON() as { token: string };
    completions.push(body);
    if (completeHandler && await completeHandler(route, body)) return;
    message.attachment.status = "deleted";
    return route.fulfill({ json: { message } });
  });
  return {
    ...state, uploads, downloads, completions, previews, binaries,
    onUpload(handler: typeof uploadHandler) { uploadHandler = handler; },
    onDownload(handler: typeof downloadHandler) { downloadHandler = handler; },
    onComplete(handler: typeof completeHandler) { completeHandler = handler; },
    onPreview(handler: typeof previewHandler) { previewHandler = handler; },
  };
}

async function selectAttachment(page: Page, name = attachmentName, bytes = attachmentBytes) {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/pdf", buffer: bytes });
}

async function attachmentScreenshot(page: Page, name: string, project: string) {
  await page.screenshot({ path: `outputs/chat-files/${project}-${name}.png`, fullPage: true });
}

async function fileDrag(page: Page, type: string, options: {
  target?: string; related?: string; names?: readonly string[]; size?: number; bytes?: readonly number[]; directory?: boolean; textOnly?: boolean;
} = {}) {
  return page.evaluate(({ type, options }) => {
    const transfer = new DataTransfer();
    if (options.textOnly) transfer.setData("text/plain", "dragged text");
    else for (const name of options.names ?? ["드롭자료.txt"]) {
      transfer.items.add(new File([options.bytes ? new Uint8Array(options.bytes) : options.size === undefined ? "dragged file" : new Uint8Array(options.size)], name));
    }
    // Chromium can return a new wrapper each time a transfer item is read.
    // Override the platform method only during this synthetic directory drop.
    const entryMethod = Object.getOwnPropertyDescriptor(DataTransferItem.prototype, "webkitGetAsEntry");
    if (options.directory) Object.defineProperty(DataTransferItem.prototype, "webkitGetAsEntry", {
      configurable: true, value: () => ({ isDirectory: true }),
    });
    const target = document.querySelector(options.target ?? "#staff-chat-window")!;
    const event = new DragEvent(type, {
      dataTransfer: transfer, bubbles: true, cancelable: true,
      relatedTarget: options.related ? document.querySelector(options.related) : null,
    });
    try { return !target.dispatchEvent(event); }
    finally {
      if (options.directory && entryMethod) Object.defineProperty(DataTransferItem.prototype, "webkitGetAsEntry", entryMethod);
    }
  }, { type, options });
}

async function startRecipientDownload(page: Page, name = attachmentName) {
  await page.getByRole("button", { name: `${name} 다운로드`, exact: true }).click();
  await expect(page.getByText("파일을 받으면 원본이 삭제됩니다. 저장 창에서 취소하면 다시 받을 수 없습니다.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "다운로드하고 원본 삭제", exact: true }).click();
}

async function preparePreview(page: Page, kind: "image" | "pdf") {
  const name = kind === "image" ? "직원안내이미지.png" : "두페이지업무자료.pdf";
  const bytes = kind === "image" ? previewImageBytes : previewPdfBytes;
  const message = attachmentMessage({ name, size: bytes.length });
  const state = await prepareFiles(page, [message]);
  state.binaries.set("file-1", { bytes, contentType: kind === "image" ? "image/png" : "application/pdf" });
  return { ...state, message, name };
}

async function previewScreenshot(page: Page, name: string, project: string) {
  await page.screenshot({ path: `outputs/chat-previews/${project}-${name}.png`, fullPage: true });
}

async function canvasColor(page: Page, name: string) {
  return page.getByRole("img", { name, exact: true }).evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const pixel = canvas.getContext("2d")!.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
    return pixel[1] > pixel[2] ? "green" : pixel[2] > pixel[1] ? "blue" : "blank";
  });
}

async function chatBounds(page: Page) {
  const bounds = await page.getByRole("dialog", { name: "직원 채팅", exact: true }).boundingBox();
  expect(bounds).not.toBeNull();
  return bounds!;
}

async function expectChatInViewport(page: Page) {
  const dialog = page.getByRole("dialog", { name: "직원 채팅", exact: true });
  await expect.poll(async () => {
    const bounds = await dialog.boundingBox();
    const viewport = await page.evaluate(() => ({ width: Math.min(document.documentElement.clientWidth, document.documentElement.getBoundingClientRect().width), height: document.documentElement.clientHeight }));
    return Boolean(bounds && bounds.x >= -1 && bounds.y >= -1
      && bounds.x + bounds.width <= viewport.width + 1
      && bounds.y + bounds.height <= viewport.height + 1);
  }).toBe(true);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "채팅창 이동", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "채팅창 최소화", exact: true })).toBeInViewport({ ratio: 1 });
  for (const name of ["채팅창 이동", "채팅창 위치 초기화", "채팅창 최소화"]) {
    const bounds = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
}

test("moving the open window keeps launcher anchored and preserves draft, position and reset", async ({ page }, info) => {
  const state = await prepare(page);
  await openEmployee(page, employees[0].name);
  const editor = page.getByRole("textbox", { name: "메시지", exact: true });
  const launcher = page.getByRole("button", { name: /^직원 채팅/ });
  await editor.fill("위치를 옮겨도 보존할 작성 중인 메시지");
  const original = await chatBounds(page);
  const launcherBefore = (await launcher.boundingBox())!;
  const handle = (await page.getByRole("button", { name: "채팅창 이동", exact: true }).boundingBox())!;
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - Math.min(160, original.x - 8), start.y - 96, { steps: 8 });
  await page.mouse.up();
  const moved = await chatBounds(page);
  expect(moved.y).toBeLessThan(original.y - 40);
  const launcherAfter = (await launcher.boundingBox())!;
  expect(launcherAfter.x).toBeCloseTo(launcherBefore.x, 0);
  expect(launcherAfter.y).toBeCloseTo(launcherBefore.y, 0);
  await expectChatInViewport(page);
  await expect(editor).toHaveValue("위치를 옮겨도 보존할 작성 중인 메시지");
  await screenshot(page, "dragged-thread-light", info.project.name);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await screenshot(page, "dragged-thread-dark", info.project.name);
  await page.getByRole("button", { name: "채팅창 최소화", exact: true }).click();
  await expect(launcher).toBeFocused();
  await launcher.click();
  await expect(editor).toHaveValue("위치를 옮겨도 보존할 작성 중인 메시지");
  const reopened = await chatBounds(page);
  expect(reopened.x).toBeCloseTo(moved.x, 0);
  expect(reopened.y).toBeCloseTo(moved.y, 0);
  await page.reload();
  await launcher.click();
  await expect.poll(async () => Math.abs((await chatBounds(page)).x - moved.x)).toBeLessThan(1);
  await expect.poll(async () => Math.abs((await chatBounds(page)).y - moved.y)).toBeLessThan(1);
  await page.getByRole("button", { name: "채팅창 위치 초기화", exact: true }).click();
  await expect.poll(async () => Math.abs((await chatBounds(page)).x - original.x)).toBeLessThan(1);
  await expect.poll(async () => Math.abs((await chatBounds(page)).y - original.y)).toBeLessThan(1);
  expect(state.sent).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("keyboard movement uses small and large steps and resize keeps controls in bounds", async ({ page }, info) => {
  const state = await prepare(page);
  await openEmployee(page, employees[0].name);
  const handle = page.getByRole("button", { name: "채팅창 이동", exact: true });
  await handle.focus();
  const initial = await chatBounds(page);
  await handle.press("ArrowUp");
  expect((await chatBounds(page)).y).toBeCloseTo(initial.y - 16, 0);
  await handle.press("Shift+ArrowUp");
  expect((await chatBounds(page)).y).toBeCloseTo(initial.y - 64, 0);
  await expect(handle).toBeFocused();
  for (let index = 0; index < 40; index++) await handle.press("Shift+ArrowLeft");
  for (let index = 0; index < 20; index++) await handle.press("Shift+ArrowUp");
  await expectChatInViewport(page);
  for (let index = 0; index < 40; index++) await handle.press("Shift+ArrowRight");
  for (let index = 0; index < 20; index++) await handle.press("Shift+ArrowDown");
  await expectChatInViewport(page);
  if (info.project.name === "desktop") {
    await page.setViewportSize({ width: 1440, height: 900 });
    await expectChatInViewport(page);
    await screenshot(page, "moved-wide-1440", info.project.name);
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await expectChatInViewport(page);
  await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toBeInViewport({ ratio: 1 });
  await screenshot(page, "moved-small-320", info.project.name);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.setViewportSize({ width: 683, height: 384 });
  await expectChatInViewport(page);
  await page.getByRole("button", { name: "전송", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "전송", exact: true })).toBeInViewport({ ratio: 1 });
  await screenshot(page, "moved-zoom-200-dark", info.project.name);
  expect(state.errors).toEqual([]);
});

test("Escape cancels a drag before normal Escape minimizes and restores launcher focus", async ({ page }) => {
  const state = await prepare(page);
  await openEmployee(page, employees[0].name);
  const original = await chatBounds(page);
  const handle = (await page.getByRole("button", { name: "채팅창 이동", exact: true }).boundingBox())!;
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y - 80, { steps: 5 });
  expect((await chatBounds(page)).y).toBeLessThan(original.y - 40);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "직원 채팅", exact: true })).toBeVisible();
  expect((await chatBounds(page)).x).toBeCloseTo(original.x, 0);
  expect((await chatBounds(page)).y).toBeCloseTo(original.y, 0);
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "직원 채팅", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^직원 채팅/ })).toBeFocused();
  expect(state.errors).toEqual([]);
});

test("touch dragging moves only the open chat without scrolling the page", async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, "Touch input is exercised in the mobile project.");
  const state = await prepare(page);
  await openEmployee(page, employees[0].name);
  const original = await chatBounds(page);
  const launcher = (await page.getByRole("button", { name: /^직원 채팅/ }).boundingBox())!;
  const handle = (await page.getByRole("button", { name: "채팅창 이동", exact: true }).boundingBox())!;
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 1 }] });
    for (let step = 1; step <= 6; step++) {
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x, y: start.y - step * 16, id: 1 }] });
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await session.detach();
  }
  expect((await chatBounds(page)).y).toBeLessThan(original.y - 40);
  const launcherAfter = (await page.getByRole("button", { name: /^직원 채팅/ }).boundingBox())!;
  expect(launcherAfter.x).toBeCloseTo(launcher.x, 0);
  expect(launcherAfter.y).toBeCloseTo(launcher.y, 0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expectChatInViewport(page);
  await screenshot(page, "touch-dragged", info.project.name);
  expect(state.errors).toEqual([]);
});

test("blocked browser storage still preserves position through minimize and reopen", async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem", "removeItem"]) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value: () => { throw new DOMException("Storage is disabled for this browser session", "SecurityError"); },
      });
    }
  });
  const state = await prepare(page);
  await openEmployee(page, employees[0].name);
  const original = await chatBounds(page);
  const handle = page.getByRole("button", { name: "채팅창 이동", exact: true });
  await handle.press("Shift+ArrowUp");
  const moved = await chatBounds(page);
  expect(moved.y).toBeCloseTo(original.y - 48, 0);
  await page.getByRole("button", { name: "채팅창 최소화", exact: true }).click();
  await page.getByRole("button", { name: /^직원 채팅/ }).click();
  expect((await chatBounds(page)).x).toBeCloseTo(moved.x, 0);
  expect((await chatBounds(page)).y).toBeCloseTo(moved.y, 0);
  await page.getByRole("button", { name: "채팅창 위치 초기화", exact: true }).click();
  expect((await chatBounds(page)).y).toBeCloseTo(original.y, 0);
  await expectChatInViewport(page);
  expect(state.errors).toEqual([]);
});

test("malformed or offscreen saved positions recover within computed safe-area insets", async ({ page }) => {
  const state = await prepare(page);
  await page.evaluate(() => localStorage.setItem("staff-chat-position:v1:test-me", "{malformed saved position"));
  await page.getByRole("button", { name: /^직원 채팅/ }).click();
  await expectChatInViewport(page);
  await page.evaluate(() => localStorage.setItem("staff-chat-position:v1:test-me", JSON.stringify({ x: -100_000, y: 100_000 })));
  await page.reload();
  await page.getByRole("button", { name: /^직원 채팅/ }).click();
  await expectChatInViewport(page);
  const dialog = page.getByRole("dialog", { name: "직원 채팅", exact: true });
  await dialog.evaluate((element) => {
    for (const edge of ["left", "right", "top", "bottom"]) {
      (element as HTMLElement).style.setProperty(`--chat-inset-${edge}`, "max(8px, 40px)");
    }
    window.dispatchEvent(new Event("resize"));
  });
  await expect.poll(async () => {
    const bounds = await chatBounds(page);
    const viewport = page.viewportSize()!;
    return bounds.x >= 39 && bounds.y >= 39
      && bounds.x + bounds.width <= viewport.width - 39
      && bounds.y + bounds.height <= viewport.height - 39;
  }).toBe(true);
  await expectChatInViewport(page);
  expect(state.errors).toEqual([]);
});

test("unread launch, keyboard close, incoming updates and read status", async ({ page }, info) => {
  const state = await prepare(page);
  await expect(page.getByRole("button", { name: /^직원 채팅/ })).toContainText("1");
  await screenshot(page, "minimized", info.project.name);
  await page.getByRole("button", { name: /^직원 채팅/ }).click();
  await screenshot(page, "conversations", info.project.name);
  await openEmployee(page, employees[0].name);
  await expect(page.getByRole("log").getByText(firstMessage.body)).toBeVisible();
  await screenshot(page, "thread-light", info.project.name);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await screenshot(page, "thread-dark", info.project.name);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "직원 채팅", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^직원 채팅/ })).toBeFocused();
  state.messages.push({ ...firstMessage, id: "message-a-2", sequence: "2", body: "확인 후 답장 부탁드립니다.", readAt: null });
  await state.emit();
  await expect(page.getByRole("button", { name: /^직원 채팅/ })).toContainText("1");
  await page.getByRole("button", { name: /^직원 채팅/ }).click();
  await expect(page.getByRole("log").getByText("확인 후 답장 부탁드립니다.")).toBeVisible();
  expect(state.errors).toEqual([]);
});

test("failed send preserves draft and a pending send prevents duplicates", async ({ page }, info) => {
  const state = await prepare(page);
  await openEmployee(page, employees[0].name);
  await expect(page.getByRole("log").getByText(firstMessage.body)).toBeVisible();
  let releaseSend!: () => void;
  state.onSend(async (route) => {
    await new Promise<void>((resolve) => { releaseSend = resolve; });
    await route.fulfill({ status: 503, json: { error: "메시지를 보내지 못했습니다. 다시 시도해 주세요." } });
  });
  const editor = page.getByRole("textbox", { name: "메시지", exact: true });
  await editor.fill("확인했습니다. 잠시 후 전달하겠습니다.");
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect.poll(() => state.sent.length).toBe(1);
  await expect(page.getByRole("button", { name: /전송/ })).toBeDisabled();
  await editor.press("Enter");
  expect(state.sent).toHaveLength(1);
  releaseSend();
  await expect(page.getByRole("alert")).toContainText("보내지 못했습니다");
  await expect(editor).toHaveValue("확인했습니다. 잠시 후 전달하겠습니다.");
  await screenshot(page, "send-error", info.project.name);
  state.onSend(undefined);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(editor).toHaveValue("");
  await expect(page.getByRole("log").getByText("확인했습니다. 잠시 후 전달하겠습니다.")).toBeVisible();
  expect(state.sent).toHaveLength(2);
  expect(state.sent[1].requestId).toBe(state.sent[0].requestId);
  expect(state.errors).toEqual([]);
});

test("drafts and delayed responses stay with their own recipient", async ({ page }) => {
  const state = await prepare(page);
  let releaseMessages!: () => void;
  state.onMessages(async (route, peerId) => {
    if (peerId !== "test-a") return false;
    await new Promise<void>((resolve) => { releaseMessages = resolve; });
    await route.fulfill({ json: { messages: [{ ...firstMessage }], hasMore: false } });
    return true;
  });
  await openEmployee(page, employees[0].name);
  await expect.poll(() => Boolean(releaseMessages)).toBe(true);
  await page.getByRole("button", { name: "대화 목록으로", exact: true }).click();
  await openEmployee(page, employees[1].name);
  releaseMessages();
  const editor = page.getByRole("textbox", { name: "메시지", exact: true });
  await editor.fill("나 직원에게만 보낼 초안");
  await expect(page.getByRole("log").getByText(firstMessage.body)).toHaveCount(0);
  await page.getByRole("button", { name: "대화 목록으로", exact: true }).click();
  state.onMessages(undefined);
  await openEmployee(page, employees[0].name);
  await expect(editor).toHaveValue("");
  await editor.fill("가 직원의 별도 초안");
  await page.getByRole("button", { name: "대화 목록으로", exact: true }).click();
  await openEmployee(page, employees[1].name);
  await expect(editor).toHaveValue("나 직원에게만 보낼 초안");
  expect(state.sent).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("empty, long text, small viewport and zoom keep chat controls reachable", async ({ page }, info) => {
  const state = await prepare(page, { empty: true });
  await page.getByRole("button", { name: /^직원 채팅/ }).click();
  await expect(page.getByText("아직 대화가 없습니다.")).toBeVisible();
  await screenshot(page, "empty", info.project.name);
  await openEmployee(page, employees[0].name);
  const longBody = "긴한글메시지".repeat(120);
  state.messages.push({ ...firstMessage, body: longBody });
  await state.emit();
  await expect(page.getByRole("log").getByText(longBody)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.getByRole("button", { name: "전송", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await screenshot(page, "small-320", info.project.name);
  await page.setViewportSize({ width: 683, height: 384 });
  await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "채팅창 최소화", exact: true })).toBeInViewport();
  await screenshot(page, "zoom-200-equivalent", info.project.name);
  expect(state.errors).toEqual([]);
});

test("load failures recover and expiration removes private chat content", async ({ page }, info) => {
  const state = await prepare(page, { initialFailure: true });
  await page.getByRole("button", { name: /^직원 채팅/ }).click();
  await expect(page.getByRole("alert")).toContainText("불러오지 못했습니다");
  await screenshot(page, "load-error", info.project.name);
  state.setLoadFailure(false);
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByRole("button", { name: `${employees[0].name} 대화 열기`, exact: true })).toBeVisible();
  let releaseMessages!: () => void;
  state.onMessages(async (route) => {
    await new Promise<void>((resolve) => { releaseMessages = resolve; });
    await route.fulfill({ json: { messages: [{ ...firstMessage }], hasMore: false } });
    return true;
  });
  await openEmployee(page, employees[0].name);
  await expect(page.getByText("채팅 불러오는 중")).toBeAttached();
  await screenshot(page, "loading", info.project.name);
  await expect.poll(() => Boolean(releaseMessages)).toBe(true);
  state.onMessages(undefined);
  releaseMessages();
  await expect(page.getByRole("log").getByText(firstMessage.body)).toBeVisible();
  await page.route("**/api/chat**", (route) => route.fulfill({ status: 401, json: { error: "인증이 필요합니다." } }));
  await state.emit("auth-expired");
  await expect(page.getByRole("alert")).toContainText("로그인이 만료되었습니다");
  await expect(page.getByRole("log")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "다시 로그인" })).toBeVisible();
  await screenshot(page, "auth-expired", info.project.name);
  expect(state.errors).toEqual([]);
});

test("catching up beyond one page keeps every older message reachable", async ({ page }) => {
  const state = await prepare(page);
  state.messages[0].body = "연속 메시지 001";
  await openEmployee(page, employees[0].name);
  const log = page.getByRole("log");
  await expect(log.getByText("연속 메시지 001")).toBeVisible();
  await page.getByRole("button", { name: "채팅창 최소화", exact: true }).click();

  // The client retains message 1 while missing 120 incoming messages. Equal
  // timestamps also exercise sequence-based ordering at both page boundaries.
  for (let sequence = 2; sequence <= 121; sequence++) {
    state.messages.push({
      ...firstMessage,
      id: `message-a-${sequence}`,
      sequence: String(sequence),
      body: `연속 메시지 ${String(sequence).padStart(3, "0")}`,
      readAt: null,
    });
  }
  await state.emit();
  await expect(page.getByRole("button", { name: /^직원 채팅/ })).toHaveAccessibleName(/안 읽은 메시지 120개/);
  await page.getByRole("button", { name: /^직원 채팅/ }).click();
  await expect(log.getByText("연속 메시지 121")).toBeVisible();
  await expect(log.locator("time")).toHaveCount(50);
  await expect(log.getByText("연속 메시지 001")).toHaveCount(0);

  await page.getByRole("button", { name: "이전 대화 보기", exact: true }).click();
  await expect(log.locator("time")).toHaveCount(100);
  await expect(log.getByText("연속 메시지 022")).toBeAttached();
  await page.getByRole("button", { name: "이전 대화 보기", exact: true }).click();
  await expect(log.locator("time")).toHaveCount(121);
  await expect(page.getByRole("button", { name: "이전 대화 보기", exact: true })).toHaveCount(0);
  expect(state.olderCursors).toEqual(["message-a-72", "message-a-22"]);
  expect(await log.getByText(/연속 메시지 \d{3}/).allTextContents()).toEqual(
    Array.from({ length: 121 }, (_, index) => `${employees[0].name}: 연속 메시지 ${String(index + 1).padStart(3, "0")}`),
  );
  expect(state.errors).toEqual([]);
});

test("ZIP file drop sends immediately without sending the draft and shows responsive recipient guidance", async ({ page }, info) => {
  const state = await prepareFiles(page);
  await openEmployee(page, employees[0].name);
  await expect(page.getByRole("button", { name: "파일 첨부", exact: true })).toBeEnabled();
  const editor = page.getByRole("textbox", { name: "메시지", exact: true });
  await editor.fill("아직 작성 중인 글");
  await fileDrag(page, "dragenter");
  const overlay = page.getByRole("status", { name: "파일 놓기 안내" });
  await expect(overlay).toContainText(`${employees[0].name}님에게 파일 전송`);
  await expect(overlay).toContainText("여기에 놓으면 바로 전송됩니다.");
  await expect(overlay).toContainText("ZIP 100.0 MB · 기타 4.0 MB");
  // Child transitions must not dismiss the window's drop guidance.
  await fileDrag(page, "dragenter", { target: "#staff-chat-message" });
  await fileDrag(page, "dragleave", { target: "#staff-chat-message", related: "#staff-chat-window header" });
  await expect(overlay).toBeVisible();
  await attachmentScreenshot(page, "drop-guidance-light", info.project.name);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await attachmentScreenshot(page, "drop-guidance-dark", info.project.name);
  const originalSize = page.viewportSize()!;
  for (const viewport of [{ width: 320, height: 800 }, { width: 683, height: 384 }]) {
    await page.setViewportSize(viewport);
    await expect(overlay).toBeInViewport({ ratio: 1 });
    expect(await overlay.evaluate((element) => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight)).toBe(true);
    await attachmentScreenshot(page, `drop-guidance-${viewport.width}`, info.project.name);
  }
  await page.setViewportSize(originalSize);
  expect(await fileDrag(page, "drop", { target: "#staff-chat-message", names: ["드롭자료.zip"], bytes: [...zipBytes] })).toBe(true);
  await expect(overlay).toHaveCount(0);
  await expect(page.getByRole("log").getByText("드롭자료.zip", { exact: true })).toBeVisible();
  await expect(editor).toHaveValue("아직 작성 중인 글");
  expect(state.uploads).toHaveLength(1);
  expect(state.uploads[0]).toMatchObject({ peerId: "test-a", body: "", fileName: "드롭자료.zip", size: zipBytes.length, content: zipBytes.toString() });
  expect(state.previews).toHaveLength(0);
  expect(state.sent).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("file drop blocks duplicate uploads and retries the same file while preserving edited draft", async ({ page }, info) => {
  const state = await prepareFiles(page);
  await openEmployee(page, employees[0].name);
  await expect(page.getByRole("button", { name: "파일 첨부", exact: true })).toBeEnabled();
  const editor = page.getByRole("textbox", { name: "메시지", exact: true });
  await editor.fill("전송하지 않을 초안");
  let release!: () => void;
  state.onUpload(async (route) => {
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ status: 503, json: { error: "파일을 전송하지 못했습니다. 다시 전송해 주세요." } });
    return true;
  });
  await fileDrag(page, "drop");
  await expect.poll(() => state.uploads.length).toBe(1);
  await fileDrag(page, "drop", { names: ["추가파일.txt"] });
  await editor.press("Enter");
  expect(state.uploads).toHaveLength(1);
  release();
  const retry = page.getByRole("button", { name: "파일 다시 전송", exact: true });
  await expect(retry).toBeEnabled();
  await expect(editor).toHaveValue("전송하지 않을 초안");
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(retry).toBeInViewport({ ratio: 1 });
  await attachmentScreenshot(page, "drop-retry-320", info.project.name);
  await editor.fill("계속 작성한 초안");
  state.onUpload(undefined);
  await retry.click();
  await expect(page.getByRole("log").getByText("드롭자료.txt", { exact: true })).toBeVisible();
  await expect(editor).toHaveValue("계속 작성한 초안");
  expect(state.uploads).toHaveLength(2);
  expect(state.uploads[1]).toEqual(state.uploads[0]);
  expect(state.sent).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("file drop rejects invalid files and preserves an already selected attachment", async ({ page }) => {
  const state = await prepareFiles(page);
  await openEmployee(page, employees[0].name);
  await expect(page.getByRole("button", { name: "파일 첨부", exact: true })).toBeEnabled();
  const editor = page.getByRole("textbox", { name: "메시지", exact: true });
  await editor.fill("보존할 글");
  for (const [options, message] of [
    [{ names: ["one.txt", "two.txt"] }, "한 번에 1개"],
    [{ directory: true }, "폴더"],
    [{ names: ["unsafe.exe"] }, "허용되지 않는"],
    [{ size: 0 }, "0바이트"],
    [{ size: 4 * 1024 * 1024 + 1 }, "4.0 MB"],
  ] as const) {
    await fileDrag(page, "drop", options);
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(editor).toHaveValue("보존할 글");
  }
  await selectAttachment(page);
  await fileDrag(page, "drop");
  await expect(page.getByRole("alert")).toContainText("첨부한 파일을 먼저");
  await expect(page.getByText(attachmentName, { exact: true })).toBeVisible();
  expect(state.uploads).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("file drop requires a recipient and policy and ignores text, outside and cancelled drags", async ({ page }) => {
  const state = await prepareFiles(page);
  await page.getByRole("button", { name: /^직원 채팅/ }).click();
  await fileDrag(page, "drop");
  await expect(page.getByRole("alert")).toContainText("직원을 먼저 선택");
  const originalUrl = page.url();
  expect(await fileDrag(page, "drop", { target: "body" })).toBe(true);
  expect(page.url()).toBe(originalUrl);
  await page.route("**/api/chat/files", (route) => route.fulfill({ status: 503, json: { error: "파일 설정 오류" } }));
  await page.reload();
  await openEmployee(page, employees[0].name);
  await expect(page.getByRole("button", { name: "파일 첨부", exact: true })).toBeDisabled();
  await fileDrag(page, "drop");
  await expect(page.getByRole("alert")).toContainText("첨부 설정");
  await page.unroute("**/api/chat/files");
  await page.getByRole("button", { name: "설정 다시 불러오기" }).click();
  await expect(page.getByRole("button", { name: "파일 첨부", exact: true })).toBeEnabled();
  await fileDrag(page, "dragenter", { textOnly: true });
  await fileDrag(page, "drop", { textOnly: true });
  const overlay = page.getByRole("status", { name: "파일 놓기 안내" });
  await expect(overlay).toHaveCount(0);
  await fileDrag(page, "dragenter");
  await expect(overlay).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0);
  await fileDrag(page, "drop");
  await expect(page.getByRole("dialog", { name: "직원 채팅", exact: true })).toBeVisible();
  await fileDrag(page, "dragenter");
  await fileDrag(page, "dragleave");
  await expect(overlay).toHaveCount(0);
  await fileDrag(page, "dragenter");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(overlay).toHaveCount(0);
  expect(state.uploads).toHaveLength(0);
  expect(state.sent).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("file drop cannot send after a recipient becomes inactive or authentication expires", async ({ page }) => {
  const state = await prepareFiles(page, [{ ...firstMessage }]);
  await openEmployee(page, employees[0].name);
  const inactive = { ...employees[0], active: false };
  await page.route("**/api/chat", (route) => route.fulfill({ json: {
    employees: [], conversations: [{ peer: inactive, lastMessage: firstMessage, unreadCount: 0 }], unreadCount: 0,
  } }));
  await state.emit();
  await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toBeDisabled();
  await fileDrag(page, "drop");
  await expect(page.getByRole("alert")).toContainText("파일을 받을 수 없는 직원");
  await page.route("**/api/chat**", (route) => route.fulfill({ status: 401, json: { error: "인증이 필요합니다." } }));
  await state.emit("auth-expired");
  await expect(page.getByRole("link", { name: "다시 로그인" })).toBeVisible();
  await fileDrag(page, "drop");
  expect(state.uploads).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("ZIP picker accepts uppercase extension and Windows MIME, sends and downloads unchanged bytes", async ({ page }, info) => {
  const state = await prepareFiles(page);
  const name = "업무 묶음.ZIP";
  await openEmployee(page, employees[0].name);
  await expect(page.getByLabel("채팅 파일 선택", { exact: true })).toHaveAttribute("accept", /(?:^|,)\.zip(?:,|$)/);
  const chooserReady = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "파일 첨부", exact: true }).click();
  await (await chooserReady).setFiles({ name, mimeType: "application/x-zip-compressed", buffer: zipBytes });
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  const send = page.getByRole("button", { name: "전송", exact: true });
  await expect(send).toBeEnabled();
  expect(state.uploads).toHaveLength(0);
  await attachmentScreenshot(page, "zip-selected", info.project.name);
  await send.click();
  await expect(page.getByRole("log").getByText(name, { exact: true })).toBeVisible();
  await expect(send).toBeDisabled();
  expect(state.uploads).toHaveLength(1);
  expect(state.uploads[0]).toMatchObject({ peerId: "test-a", body: "", fileName: name, size: zipBytes.length, content: zipBytes.toString() });
  expect(state.previews).toHaveLength(0);
  state.binaries.set("file-1", { bytes: zipBytes, contentType: "application/zip" });
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("button", { name: `${name} 다운로드`, exact: true }).click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toBe(name);
  expect(await readFile((await download.path())!)).toEqual(zipBytes);
  expect(state.completions).toHaveLength(0);
  await expectChatInViewport(page);
  await attachmentScreenshot(page, "zip-sent", info.project.name);
  expect(state.sent).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("large ZIP upload resumes verified chunks and a lost completion without duplicate messages", async ({ page }, info) => {
  const emitProgress = await controlUploadProgress(page);
  const state = await prepareFiles(page);
  const name = "대용량 업무 자료.ZIP";
  const bytes = Buffer.alloc(filePolicy.uploadChunkSize + 1024 * 1024, 7);
  zipBytes.copy(bytes);
  const initializations: (SendBody & { originalName: string; mimeType: string; size: number; chunkDigests: string[] })[] = [];
  const uploaded = new Map<number, Buffer>();
  const parts: number[] = [];
  let completions = 0;
  let releaseFirstPart!: () => void;
  let releasePart!: () => void;
  let releaseComplete!: () => void;
  let completedMessage: ChatMessage | undefined;
  await page.route("**/api/chat/uploads**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/chat/uploads") {
      expect(request.method()).toBe("POST");
      initializations.push(request.postDataJSON());
      return route.fulfill({ json: { uploadId: "large-zip", uploadedParts: [...uploaded.keys()], ...(completedMessage ? { message: completedMessage } : {}) } });
    }
    const match = /^\/api\/chat\/uploads\/large-zip\/parts\/(\d+)$/.exec(url.pathname);
    if (match) {
      expect(request.method()).toBe("PUT");
      expect(request.headers()["content-type"]).toBe("application/octet-stream");
      const index = Number(match[1]);
      parts.push(index);
      const chunk = request.postDataBuffer()!;
      expect(chunk.equals(bytes.subarray(index * filePolicy.uploadChunkSize, (index + 1) * filePolicy.uploadChunkSize))).toBe(true);
      expect(createHash("sha256").update(chunk).digest("hex")).toBe(initializations[0].chunkDigests[index]);
      if (index === 0) await new Promise<void>((resolve) => { releaseFirstPart = resolve; });
      if (index === 1 && parts.length === 2) {
        await new Promise<void>((resolve) => { releasePart = resolve; });
        return route.fulfill({ status: 503, json: { error: "연결이 끊겼습니다. 다시 전송해 주세요." } });
      }
      uploaded.set(index, chunk);
      return route.fulfill({ json: { ok: true } });
    }
    expect(url.pathname).toBe("/api/chat/uploads/large-zip/complete");
    completions++;
    expect(Buffer.concat([...uploaded.values()]).equals(bytes)).toBe(true);
    completedMessage = { ...attachmentMessage({ mine: true, name, size: bytes.length }), body: initializations[0].body };
    state.messages.push(completedMessage);
    await new Promise<void>((resolve) => { releaseComplete = resolve; });
    return route.abort("failed");
  });
  await openEmployee(page, employees[0].name);
  const editor = page.getByRole("textbox", { name: "메시지", exact: true });
  await editor.fill("용량이 큰 업무 자료입니다.");
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/x-zip-compressed", buffer: bytes });
  const send = page.getByRole("button", { name: "전송", exact: true });
  await send.click();
  await expect.poll(() => Boolean(releaseFirstPart)).toBe(true);
  const progress = page.getByRole("progressbar", { name: `${name} 업로드 진행률`, exact: true });
  await emitProgress(25);
  await expectUploadGauge(page, 20);
  await attachmentScreenshot(page, "large-zip-progress-20", info.project.name);
  await emitProgress(81.25);
  await expectUploadGauge(page, 65);
  await attachmentScreenshot(page, "large-zip-progress-65", info.project.name);
  releaseFirstPart();
  await expect.poll(() => Boolean(releasePart)).toBe(true);
  await emitProgress(100);
  await expectUploadGauge(page, 99);
  await expect(editor).toHaveAttribute("readonly", "");
  await expect(page.getByRole("button", { name: "첨부파일 제거", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "전송 중…", exact: true })).toBeDisabled();
  await editor.press("Enter");
  expect(initializations).toHaveLength(1);
  await expectChatInViewport(page);
  await expect(progress).toBeInViewport({ ratio: 1 });
  await attachmentScreenshot(page, "large-zip-progress", info.project.name);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await attachmentScreenshot(page, "large-zip-progress-dark", info.project.name);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(progress.locator("div")).toHaveCSS("transition-property", "none");
  const viewport = page.viewportSize()!;
  for (const size of [{ width: 320, height: 800 }, { width: 683, height: 384 }]) {
    await page.setViewportSize(size);
    await expectChatInViewport(page);
    // The existing short-viewport layout scrolls the conversation and composer
    // together, so verify every upload control remains reachable there.
    await page.getByRole("button", { name: "전송 중…", exact: true }).scrollIntoViewIfNeeded();
    await expect(progress).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "전송 중…", exact: true })).toBeInViewport({ ratio: 1 });
    await attachmentScreenshot(page, `large-zip-progress-${size.width}`, info.project.name);
  }
  await page.setViewportSize(viewport);
  releasePart();
  await expect(page.getByRole("alert")).toContainText("다시 전송");
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(editor).toHaveValue("용량이 큰 업무 자료입니다.");
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await send.click();
  await expect(page.getByRole("status").filter({ hasText: "전송 마무리 중" })).toBeVisible();
  await expectUploadGauge(page, 100);
  await expect.poll(() => Boolean(releaseComplete)).toBe(true);
  releaseComplete();
  await expect(page.getByRole("alert")).toContainText("다시 전송");
  await expect(editor).toHaveValue("용량이 큰 업무 자료입니다.");
  await send.click();
  await expect(page.getByRole("log").getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(editor).toHaveValue("");
  expect(initializations).toHaveLength(3);
  expect(initializations[0]).toMatchObject({ peerId: "test-a", body: "용량이 큰 업무 자료입니다.", originalName: name, size: bytes.length, mimeType: "application/x-zip-compressed" });
  expect(initializations[1]).toEqual(initializations[0]);
  expect(initializations[2]).toEqual(initializations[0]);
  expect(parts).toEqual([0, 1, 1]);
  expect(completions).toBe(1);
  expect(state.messages).toHaveLength(1);
  expect(state.uploads).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("multipart file upload fills its gauge and retains draft and attachment after failure", async ({ page }, info) => {
  const emitProgress = await controlUploadProgress(page);
  const state = await prepareFiles(page);
  await openEmployee(page, employees[0].name);
  const name = "부서별 회의 자료와 업무 전달 사항을 모은 첨부파일.zip";
  const bytes = Buffer.alloc(1_000_000);
  zipBytes.copy(bytes);
  const editor = page.getByRole("textbox", { name: "메시지", exact: true });
  await editor.fill("첨부 자료 검토 부탁드립니다.");
  await page.getByLabel("채팅 파일 선택", { exact: true }).setInputFiles({ name, mimeType: "application/zip", buffer: bytes });
  let releaseUpload!: () => void;
  state.onUpload(async (route) => {
    await new Promise<void>((resolve) => { releaseUpload = resolve; });
    await route.fulfill({ status: 503, json: { error: "전송하지 못했습니다. 다시 전송해 주세요." } });
    return true;
  });
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect.poll(() => Boolean(releaseUpload)).toBe(true);
  await emitProgress(25);
  await expectUploadGauge(page, 25);
  await attachmentScreenshot(page, "multipart-progress-25", info.project.name);
  await emitProgress(65);
  await expectUploadGauge(page, 65);
  await attachmentScreenshot(page, "multipart-progress-65", info.project.name);
  await expectChatInViewport(page);
  await expect(page.getByRole("button", { name: "첨부파일 제거", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "전송 중…", exact: true })).toBeDisabled();
  await editor.press("Enter");
  expect(state.uploads).toHaveLength(1);
  await emitProgress(100);
  await expectUploadGauge(page, 99);
  releaseUpload();
  await expect(page.getByRole("alert")).toContainText("다시 전송");
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(editor).toHaveValue("첨부 자료 검토 부탁드립니다.");
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  state.onUpload(undefined);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByRole("log").getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(editor).toHaveValue("");
  expect(state.uploads).toHaveLength(2);
  expect(state.uploads[1]).toEqual(state.uploads[0]);
  expect(state.errors).toEqual([]);
});

test("ZIP size validation accepts exactly 100 MB and rejects larger ZIPs while other files retain 4 MB", async ({ page }, info) => {
  const state = await prepareFiles(page);
  await openEmployee(page, employees[0].name);
  const editor = page.getByRole("textbox", { name: "메시지", exact: true });
  await editor.fill("보존할 초안");
  await fileDrag(page, "drop", { names: ["한도초과.ZIP"], size: filePolicy.zipMaxFileSize + 1 });
  await expect(page.getByRole("alert")).toContainText("100.0 MB");
  await expect(page.getByText("한도초과.ZIP", { exact: true })).toHaveCount(0);
  await fileDrag(page, "drop", { names: ["한도초과.pdf"], size: filePolicy.maxFileSize + 1 });
  await expect(page.getByRole("alert")).toContainText("4.0 MB");
  await expect(editor).toHaveValue("보존할 초안");
  await page.locator('input[type="file"]').evaluate((input, size) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(size)], "최대용량.ZIP", { type: "application/zip" }));
    (input as HTMLInputElement).files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, filePolicy.zipMaxFileSize);
  await expect(page.getByText("최대용량.ZIP", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "전송", exact: true })).toBeEnabled();
  await expect(page.locator("#staff-chat-input-help")).toContainText("ZIP 100.0 MB · 기타 4.0 MB");
  await expectChatInViewport(page);
  await attachmentScreenshot(page, "zip-100mb-selected", info.project.name);
  expect(state.uploads).toHaveLength(0);
  expect(state.sent).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("attachment-only upload retains the file and retry id after failure and prevents duplicates", async ({ page }, info) => {
  const state = await prepareFiles(page);
  await openEmployee(page, employees[0].name);
  const send = page.getByRole("button", { name: "전송", exact: true });
  await expect(send).toBeDisabled();
  await selectAttachment(page);
  await expect(page.getByText(attachmentName, { exact: true })).toBeVisible();
  await expect(send).toBeEnabled();
  await attachmentScreenshot(page, "selected-file", info.project.name);

  let releaseUpload!: () => void;
  state.onUpload(async (route) => {
    await new Promise<void>((resolve) => { releaseUpload = resolve; });
    await route.fulfill({ status: 503, json: { error: "파일을 전송하지 못했습니다. 다시 전송해 주세요." } });
    return true;
  });
  await send.click();
  await expect.poll(() => state.uploads.length).toBe(1);
  await expect(page.getByRole("button", { name: /^전송/ })).toBeDisabled();
  await page.getByRole("textbox", { name: "메시지", exact: true }).press("Enter");
  expect(state.uploads).toHaveLength(1);
  releaseUpload();
  await expect(page.getByRole("alert")).toContainText("파일을 전송하지 못했습니다");
  await expect(page.getByText(attachmentName, { exact: true })).toBeVisible();
  await attachmentScreenshot(page, "upload-error", info.project.name);
  state.onUpload(undefined);
  await send.click();
  await expect(page.getByRole("log").getByText(attachmentName, { exact: true })).toBeVisible();
  await expect(send).toBeDisabled();
  expect(state.uploads).toHaveLength(2);
  expect(state.uploads[1]).toEqual(state.uploads[0]);
  expect(state.uploads[0]).toMatchObject({ peerId: "test-a", body: "", fileName: attachmentName, size: attachmentBytes.length, content: attachmentBytes.toString() });
  expect(state.uploads[0].requestId).toMatch(/^[a-f\d-]{36}$/i);
  expect(state.sent).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("attachment validation blocks unsafe and oversized files without losing the draft", async ({ page }) => {
  const state = await prepareFiles(page);
  await openEmployee(page, employees[0].name);
  const editor = page.getByRole("textbox", { name: "메시지", exact: true });
  await editor.fill("검토 부탁드립니다.");
  await selectAttachment(page, "실행파일.exe");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("실행파일.exe", { exact: true })).toHaveCount(0);
  await expect(editor).toHaveValue("검토 부탁드립니다.");
  await selectAttachment(page, "큰파일.pdf", Buffer.alloc(4 * 1024 * 1024 + 1));
  await expect(page.getByRole("alert")).toContainText(/4(?:\.0)?\s?MB/i);
  await expect(page.getByText("큰파일.pdf", { exact: true })).toHaveCount(0);
  await expect(editor).toHaveValue("검토 부탁드립니다.");
  expect(state.uploads).toHaveLength(0);
  expect(state.sent).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("selected attachments stay with their own recipient", async ({ page }) => {
  const state = await prepareFiles(page);
  await openEmployee(page, employees[0].name);
  await selectAttachment(page);
  await page.getByRole("button", { name: "대화 목록으로", exact: true }).click();
  await openEmployee(page, employees[1].name);
  await expect(page.getByText(attachmentName, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "전송", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "대화 목록으로", exact: true }).click();
  await openEmployee(page, employees[0].name);
  await expect(page.getByText(attachmentName, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "전송", exact: true })).toBeEnabled();
  expect(state.uploads).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("recipient download confirms deletion, saves complete bytes and leaves a tombstone", async ({ page }, info) => {
  const state = await prepareFiles(page, [attachmentMessage()]);
  await openEmployee(page, employees[0].name);
  const downloadButton = page.getByRole("button", { name: `${attachmentName} 다운로드`, exact: true });
  await downloadButton.click();
  await expect(page.getByText("파일을 받으면 원본이 삭제됩니다. 저장 창에서 취소하면 다시 받을 수 없습니다.", { exact: true })).toBeVisible();
  await attachmentScreenshot(page, "delete-confirmation", info.project.name);
  await page.getByRole("button", { name: "취소", exact: true }).click();
  expect(state.downloads).toHaveLength(0);
  expect(state.completions).toHaveLength(0);

  let releaseDownload!: () => void;
  state.onDownload(async () => {
    await new Promise<void>((resolve) => { releaseDownload = resolve; });
    return false;
  });
  const saved = page.waitForEvent("download");
  await startRecipientDownload(page);
  await expect.poll(() => state.downloads.length).toBe(1);
  await expect(downloadButton).toBeDisabled();
  expect(state.completions).toHaveLength(0);
  releaseDownload();
  const download = await saved;
  expect(download.suggestedFilename()).toBe(attachmentName);
  expect(await download.failure()).toBeNull();
  expect(await readFile((await download.path())!)).toEqual(attachmentBytes);
  await expect(page.getByRole("log").getByText(/^파일 삭제됨/)).toBeVisible();
  await expect(downloadButton).toHaveCount(0);
  expect(state.downloads).toHaveLength(1);
  expect(state.completions).toEqual([{ token: "test-download-token" }]);
  await attachmentScreenshot(page, "deleted-file", info.project.name);
  await page.getByRole("button", { name: "대화 목록으로", exact: true }).click();
  await page.getByRole("button", { name: /^대화 \d+$/ }).click();
  await expect(page.getByRole("list", { name: "대화 목록" })).toContainText("파일 삭제됨");
  expect(state.errors).toEqual([]);
});

test("failed attachment transfer never acknowledges deletion and reuses the download attempt", async ({ page }, info) => {
  const state = await prepareFiles(page, [attachmentMessage()]);
  state.onDownload(async (route) => { await route.abort("failed"); return true; });
  await openEmployee(page, employees[0].name);
  await startRecipientDownload(page);
  await expect(page.getByRole("alert")).toContainText("다운로드하지 못했습니다");
  expect(state.downloads).toHaveLength(1);
  expect(state.completions).toHaveLength(0);
  await expect(page.getByRole("log").getByText(/^파일 삭제됨/)).toHaveCount(0);
  await attachmentScreenshot(page, "download-error", info.project.name);

  // Even a 200 response with a valid deletion token is unsafe to acknowledge
  // when the browser did not receive every byte of the original attachment.
  state.onDownload(async (route) => {
    await route.fulfill({ status: 200, body: attachmentBytes.subarray(0, 10), headers: { "X-Chat-Download-Token": "test-download-token" } });
    return true;
  });
  await startRecipientDownload(page);
  await expect(page.getByRole("alert")).toContainText("다운로드하지 못했습니다");
  expect(state.downloads).toHaveLength(2);
  expect(state.completions).toHaveLength(0);

  state.onDownload(undefined);
  const saved = page.waitForEvent("download");
  await startRecipientDownload(page);
  await saved;
  await expect(page.getByRole("log").getByText(/^파일 삭제됨/)).toBeVisible();
  expect(state.downloads).toHaveLength(3);
  expect(state.downloads[1].requestId).toBe(state.downloads[0].requestId);
  expect(state.downloads[2].requestId).toBe(state.downloads[0].requestId);
  expect(state.completions).toHaveLength(1);
  expect(state.errors).toEqual([]);
});

test("failed attachment cleanup retries deletion without fetching or saving the file twice", async ({ page }, info) => {
  const state = await prepareFiles(page, [attachmentMessage()]);
  let browserDownloads = 0;
  page.on("download", () => { browserDownloads++; });
  state.onComplete(async (route) => {
    await route.fulfill({ status: 503, json: { error: "원본 파일을 삭제하지 못했습니다. 다시 시도해 주세요." } });
    return true;
  });
  await openEmployee(page, employees[0].name);
  await startRecipientDownload(page);
  await expect(page.getByRole("alert")).toContainText("파일은 받았습니다");
  await expect(page.getByRole("button", { name: "원본 삭제 재시도", exact: true })).toBeVisible();
  expect(state.downloads).toHaveLength(1);
  expect(state.completions).toHaveLength(1);
  await attachmentScreenshot(page, "cleanup-error", info.project.name);

  state.onComplete(undefined);
  await page.getByRole("button", { name: "원본 삭제 재시도", exact: true }).click();
  await expect(page.getByRole("log").getByText(/^파일 삭제됨/)).toBeVisible();
  expect(state.downloads).toHaveLength(1);
  expect(state.completions).toEqual([{ token: "test-download-token" }, { token: "test-download-token" }]);
  expect(browserDownloads).toBe(1);
  expect(state.errors).toEqual([]);
});

test("sender download preserves the file and incoming consumption removes the download action", async ({ page }) => {
  const message = attachmentMessage({ mine: true });
  const state = await prepareFiles(page, [message]);
  await openEmployee(page, employees[0].name);
  const downloadButton = page.getByRole("button", { name: `${attachmentName} 다운로드`, exact: true });
  const saved = page.waitForEvent("download");
  await downloadButton.click();
  await saved;
  await expect(downloadButton).toBeEnabled();
  expect(state.downloads).toHaveLength(1);
  expect(state.completions).toHaveLength(0);
  message.attachment!.status = "deleted";
  await state.emit();
  await expect(page.getByRole("log").getByText(/^파일 삭제됨/)).toBeVisible();
  await expect(downloadButton).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test("long filenames, selected attachments and confirmation stay usable in light, dark and narrow layouts", async ({ page }, info) => {
  const name = `${"긴한글회의자료_".repeat(8)}최종.pdf`;
  const state = await prepareFiles(page, [attachmentMessage({ name })]);
  await openEmployee(page, employees[0].name);
  await selectAttachment(page, "답장자료.pdf");
  const checkLayout = async () => {
    await expect(page.getByRole("button", { name: "파일 첨부", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "첨부파일 제거", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "전송", exact: true })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const dialog = page.getByRole("dialog", { name: "직원 채팅", exact: true });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const dialogBounds = (await dialog.boundingBox())!;
    expect(dialogBounds.x).toBeGreaterThanOrEqual(0);
    expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    for (const button of await page.getByRole("dialog", { name: "직원 채팅", exact: true }).getByRole("button").all()) {
      const box = await button.boundingBox();
      if (box) { expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44); }
    }
  };
  await checkLayout();
  await attachmentScreenshot(page, "long-file-light", info.project.name);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await checkLayout();
  await attachmentScreenshot(page, "long-file-dark", info.project.name);
  await page.setViewportSize({ width: 320, height: 800 });
  await checkLayout();
  await attachmentScreenshot(page, "long-file-320-dark", info.project.name);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.getByRole("button", { name: `${name} 다운로드`, exact: true }).click();
  await expect.soft(page.getByRole("button", { name: "다운로드하고 원본 삭제", exact: true })).toBeInViewport({ ratio: 1 });
  await checkLayout();
  await attachmentScreenshot(page, "confirm-320-light", info.project.name);
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.setViewportSize({ width: 683, height: 384 });
  const zoomDownload = page.getByRole("button", { name: `${name} 다운로드`, exact: true });
  await zoomDownload.scrollIntoViewIfNeeded();
  await expect(zoomDownload).toBeInViewport({ ratio: 1 });
  await attachmentScreenshot(page, "file-zoom-200-messages", info.project.name);
  await page.getByRole("button", { name: "전송", exact: true }).scrollIntoViewIfNeeded();
  await attachmentScreenshot(page, "file-zoom-200-equivalent", info.project.name);
  await expect(page.getByRole("textbox", { name: "메시지", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "전송", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "파일 첨부", exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "첨부파일 제거", exact: true }).click();
  await expect(page.getByText("답장자료.pdf", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "전송", exact: true })).toBeDisabled();
  expect(state.errors).toEqual([]);
});

test("image preview loads inline without consuming the file and enlargement returns keyboard focus", async ({ page }, info) => {
  const state = await preparePreview(page, "image");
  let releaseImage!: () => void;
  state.onPreview(async () => { await new Promise<void>((resolve) => { releaseImage = resolve; }); return false; });
  await openEmployee(page, employees[0].name);
  await expect(page.getByText("이미지 불러오는 중…", { exact: true })).toBeVisible();
  await expect.poll(() => Boolean(releaseImage)).toBe(true);
  await previewScreenshot(page, "image-loading", info.project.name);
  releaseImage();
  const thumbnail = page.getByRole("log").getByRole("img", { name: state.name, exact: true });
  await expect(thumbnail).toBeVisible();
  await expect.poll(() => thumbnail.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(240);
  expect(state.previews).toEqual(["file-1"]);
  expect(state.downloads).toHaveLength(0);
  expect(state.completions).toHaveLength(0);
  await previewScreenshot(page, "image-inline", info.project.name);

  const trigger = page.getByRole("button", { name: `${state.name} 크게 보기`, exact: true });
  await trigger.click();
  const modal = page.getByRole("dialog", { name: `${state.name} 미리보기`, exact: true });
  const enlarged = modal.getByRole("img", { name: `${state.name} 확대 이미지`, exact: true });
  await expect(enlarged).toBeVisible();
  await expect.poll(() => enlarged.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(240);
  await expect(modal.getByRole("button", { name: "미리보기 닫기", exact: true })).toBeFocused();
  for (let count = 0; count < 5; count++) {
    await page.keyboard.press("Tab");
    expect(await modal.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await previewScreenshot(page, "image-enlarged-light", info.project.name);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await previewScreenshot(page, "image-enlarged-dark", info.project.name);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("dialog", { name: "직원 채팅", exact: true })).toBeVisible();
  expect(state.previews).toEqual(["file-1"]);
  expect(state.downloads).toHaveLength(0);
  expect(state.completions).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("image preview failure retries and consumed files discard the inline and enlarged image", async ({ page }, info) => {
  const state = await preparePreview(page, "image");
  state.onPreview(async (route) => { await route.fulfill({ status: 503, json: { error: "잠시 후 다시 시도해 주세요." } }); return true; });
  await openEmployee(page, employees[0].name);
  await expect(page.getByRole("alert")).toContainText("이미지를 불러오지 못했습니다");
  expect(state.previews).toHaveLength(1);
  expect(state.downloads).toHaveLength(0);
  expect(state.completions).toHaveLength(0);
  await previewScreenshot(page, "image-error", info.project.name);
  state.onPreview(undefined);
  await page.getByRole("button", { name: "이미지 다시 불러오기", exact: true }).click();
  const trigger = page.getByRole("button", { name: `${state.name} 크게 보기`, exact: true });
  await expect(trigger).toBeVisible();
  expect(state.previews).toHaveLength(2);
  await trigger.click();
  const modal = page.getByRole("dialog", { name: `${state.name} 미리보기`, exact: true });
  await expect(modal).toBeVisible();
  state.message.attachment!.status = "deleted";
  await state.emit();
  await expect(modal).toHaveCount(0);
  await expect(trigger).toHaveCount(0);
  await expect(page.getByRole("log").getByRole("img")).toHaveCount(0);
  await expect(page.getByRole("log").getByText(/^파일 삭제됨/)).toBeVisible();
  expect(state.downloads).toHaveLength(0);
  expect(state.completions).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

for (const kind of ["image", "pdf"] as const) test(`${kind} preview authorization failures remove private conversation content`, async ({ page }) => {
  const state = await preparePreview(page, kind);
  state.onPreview(async (route) => { await route.fulfill({ status: 401, json: { error: "인증이 필요합니다." } }); return true; });
  await openEmployee(page, employees[0].name);
  if (kind === "pdf") await page.getByRole("button", { name: `${state.name} 미리보기`, exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("로그인이 만료되었습니다");
  await expect(page.getByRole("log")).toHaveCount(0);
  await expect(page.getByRole("img", { name: state.name, exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "다시 로그인" })).toBeVisible();
  expect(state.downloads).toHaveLength(0);
  expect(state.completions).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("PDF preview renders both real pages without consuming and download returns to deletion confirmation", async ({ page }, info) => {
  const state = await preparePreview(page, "pdf");
  await openEmployee(page, employees[0].name);
  const trigger = page.getByRole("button", { name: `${state.name} 미리보기`, exact: true });
  await expect(trigger).toBeVisible();
  expect(state.previews).toHaveLength(0);
  await trigger.click();
  const modal = page.getByRole("dialog", { name: `${state.name} 미리보기`, exact: true });
  await expect(modal).toBeVisible();
  await expect.poll(() => canvasColor(page, `${state.name} 1 / 2쪽`)).toBe("blue");
  await expect(modal.getByRole("button", { name: "이전 페이지", exact: true })).toBeDisabled();
  await previewScreenshot(page, "pdf-page-one", info.project.name);
  await modal.getByText("페이지 텍스트", { exact: true }).click();
  await expect(modal.getByText("First preview page", { exact: true })).toBeVisible();
  await modal.getByRole("button", { name: "다음 페이지", exact: true }).click();
  await expect.poll(() => canvasColor(page, `${state.name} 2 / 2쪽`)).toBe("green");
  if (!await modal.locator("details").evaluate((element) => (element as HTMLDetailsElement).open)) {
    await modal.getByText("페이지 텍스트", { exact: true }).click();
  }
  await expect(modal.getByText("Second preview page", { exact: true })).toBeVisible();
  await expect(modal.getByRole("button", { name: "다음 페이지", exact: true })).toBeDisabled();
  await previewScreenshot(page, "pdf-page-two", info.project.name);
  expect(state.downloads).toHaveLength(0);
  expect(state.completions).toHaveLength(0);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("dialog", { name: "직원 채팅", exact: true })).toBeVisible();
  await trigger.click();
  await expect.poll(() => canvasColor(page, `${state.name} 1 / 2쪽`)).toBe("blue");
  await modal.getByRole("button", { name: "다운로드", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole("button", { name: "다운로드하고 원본 삭제", exact: true })).toBeFocused();
  expect(state.downloads).toHaveLength(0);
  expect(state.completions).toHaveLength(0);
  await page.getByRole("button", { name: "취소", exact: true }).click();
  expect(state.message.attachment!.status).toBe("available");
  expect(state.errors).toEqual([]);
});

test("PDF preview can retry a failed response and removes the modal when the file is consumed", async ({ page }, info) => {
  const state = await preparePreview(page, "pdf");
  state.onPreview(async (route) => { await route.fulfill({ status: 503, json: { error: "미리보기를 불러오지 못했습니다." } }); return true; });
  await openEmployee(page, employees[0].name);
  await page.getByRole("button", { name: `${state.name} 미리보기`, exact: true }).click();
  const modal = page.getByRole("dialog", { name: `${state.name} 미리보기`, exact: true });
  await expect(modal.getByRole("alert")).toBeVisible();
  await previewScreenshot(page, "pdf-error", info.project.name);
  let releaseCancelled!: () => void;
  state.onPreview(async (route) => {
    await new Promise<void>((resolve) => { releaseCancelled = resolve; });
    await route.abort("aborted");
    return true;
  });
  await modal.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect.poll(() => Boolean(releaseCancelled)).toBe(true);
  await expect(modal.getByText("PDF 불러오는 중…", { exact: true })).toBeVisible();
  await previewScreenshot(page, "pdf-loading", info.project.name);
  await modal.getByRole("button", { name: "불러오기 취소", exact: true }).click();
  await expect(modal.getByText("미리보기 불러오기를 취소했습니다.", { exact: true })).toBeVisible();
  await expect(modal.getByRole("button", { name: "다시 시도", exact: true })).toBeFocused();
  releaseCancelled();
  state.onPreview(undefined);
  await modal.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect.poll(() => canvasColor(page, `${state.name} 1 / 2쪽`)).toBe("blue");
  state.message.attachment!.status = "deleting";
  await state.emit();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole("button", { name: `${state.name} 미리보기`, exact: true })).toHaveCount(0);
  await expect(page.getByRole("log").getByRole("img")).toHaveCount(0);
  expect(state.downloads).toHaveLength(0);
  expect(state.completions).toHaveLength(0);
  expect(state.errors).toEqual([]);
});

test("preview modal controls remain visible at desktop, mobile, 320px and zoom in both themes", async ({ page }, info) => {
  const state = await preparePreview(page, "pdf");
  await openEmployee(page, employees[0].name);
  await page.getByRole("button", { name: `${state.name} 미리보기`, exact: true }).click();
  const modal = page.getByRole("dialog", { name: `${state.name} 미리보기`, exact: true });
  await expect.poll(() => canvasColor(page, `${state.name} 1 / 2쪽`)).toBe("blue");
  const checkControls = async () => {
    for (const name of ["미리보기 닫기", "다운로드", "이전 페이지", "다음 페이지"]) {
      const button = modal.getByRole("button", { name, exact: true });
      await expect(button).toBeInViewport({ ratio: 1 });
      const bounds = (await button.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    const bounds = (await modal.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  };
  await checkControls();
  await previewScreenshot(page, "pdf-layout-light", info.project.name);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await checkControls();
  await previewScreenshot(page, "pdf-layout-dark", info.project.name);
  await page.setViewportSize({ width: 320, height: 800 });
  await checkControls();
  await previewScreenshot(page, "pdf-320-dark", info.project.name);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await previewScreenshot(page, "pdf-320-light", info.project.name);
  await page.setViewportSize({ width: 683, height: 384 });
  await checkControls();
  await previewScreenshot(page, "pdf-zoom-200", info.project.name);
  await modal.getByRole("button", { name: "미리보기 닫기", exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "직원 채팅", exact: true })).toBeVisible();
  expect(state.downloads).toHaveLength(0);
  expect(state.completions).toHaveLength(0);
  expect(state.errors).toEqual([]);
});
