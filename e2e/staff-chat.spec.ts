import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { startStaffChatFixture } from "./helpers/staff-chat-fixture";
import type { ChatEmployee, ChatMessage } from "../src/lib/staff-chat-types";

type SendBody = { peerId: string; body: string; requestId: string };
const employees: ChatEmployee[] = [
  { id: "test-a", name: "검증직원 가", departmentName: "운영지원팀", positionName: "주임", active: true },
  { id: "test-b", name: "검증직원 나", departmentName: "생활지원팀", positionName: "대리", active: true },
];
const firstMessage: ChatMessage = {
  id: "message-a-1", sequence: "1", senderId: "test-a", recipientId: "test-me", body: "회의 자료를 확인해 주세요.",
  createdAt: "2026-09-08T01:00:00.000Z", readAt: null,
};
let fixture: Awaited<ReturnType<typeof startStaffChatFixture>>;

test.beforeAll(async () => { fixture = await startStaffChatFixture(); await mkdir("outputs/chat", { recursive: true }); });
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
