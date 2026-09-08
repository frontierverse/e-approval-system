import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { startStaffChatFixture } from "./helpers/staff-chat-fixture";
import type { ChatEmployee, ChatMessage } from "../src/lib/staff-chat-types";

type SendBody = { peerId: string; body: string; requestId: string };
const filePolicy = { maxFileSize: 4 * 1024 * 1024, allowedExtensions: [".pdf", ".txt", ".docx", ".xlsx", ".png", ".jpg"], maxFileCount: 1 };
const employees: ChatEmployee[] = [
  { id: "test-a", name: "검증직원 가", departmentName: "운영지원팀", positionName: "주임", active: true },
  { id: "test-b", name: "검증직원 나", departmentName: "생활지원팀", positionName: "대리", active: true },
];
const firstMessage: ChatMessage = {
  id: "message-a-1", sequence: "1", senderId: "test-a", recipientId: "test-me", body: "회의 자료를 확인해 주세요.",
  createdAt: "2026-09-08T01:00:00.000Z", readAt: null,
};
let fixture: Awaited<ReturnType<typeof startStaffChatFixture>>;

test.beforeAll(async () => {
  fixture = await startStaffChatFixture();
  await Promise.all([mkdir("outputs/chat", { recursive: true }), mkdir("outputs/chat-files", { recursive: true })]);
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

type FileSendBody = SendBody & { fileName: string; size: number; content: string };
type DownloadBody = { requestId: string };
const attachmentBytes = Buffer.from("%PDF-1.4\nchat attachment test document\n%%EOF");
const attachmentName = "회의자료.pdf";

function attachmentMessage(options: { mine?: boolean; status?: NonNullable<ChatMessage["attachment"]>["status"]; name?: string } = {}): ChatMessage {
  return {
    ...firstMessage,
    id: "message-file-1",
    body: "",
    senderId: options.mine ? "test-me" : "test-a",
    recipientId: options.mine ? "test-a" : "test-me",
    attachment: { id: "file-1", originalName: options.name ?? attachmentName, size: attachmentBytes.length, status: options.status ?? "available" },
  };
}

async function prepareFiles(page: Page, initial: ChatMessage[] = []) {
  const state = await prepare(page, { empty: true });
  state.messages.push(...initial);
  const uploads: FileSendBody[] = [];
  const downloads: DownloadBody[] = [];
  const completions: { token: string }[] = [];
  let uploadHandler: ((route: Route, body: FileSendBody) => Promise<boolean>) | undefined;
  let downloadHandler: ((route: Route, body: DownloadBody) => Promise<boolean>) | undefined;
  let completeHandler: ((route: Route, body: { token: string }) => Promise<boolean>) | undefined;
  await page.route("**/api/chat/files**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/chat/files" && request.method() === "GET") return route.fulfill({ json: filePolicy });
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
        ...attachmentMessage({ mine: true, name: body.fileName }),
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
        contentType: "application/octet-stream", body: attachmentBytes,
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
    ...state, uploads, downloads, completions,
    onUpload(handler: typeof uploadHandler) { uploadHandler = handler; },
    onDownload(handler: typeof downloadHandler) { downloadHandler = handler; },
    onComplete(handler: typeof completeHandler) { completeHandler = handler; },
  };
}

async function selectAttachment(page: Page, name = attachmentName, bytes = attachmentBytes) {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "application/pdf", buffer: bytes });
}

async function attachmentScreenshot(page: Page, name: string, project: string) {
  await page.screenshot({ path: `outputs/chat-files/${project}-${name}.png`, fullPage: true });
}

async function startRecipientDownload(page: Page, name = attachmentName) {
  await page.getByRole("button", { name: `${name} 다운로드`, exact: true }).click();
  await expect(page.getByText("파일을 받으면 원본이 삭제됩니다. 저장 창에서 취소하면 다시 받을 수 없습니다.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "다운로드하고 원본 삭제", exact: true }).click();
}

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
