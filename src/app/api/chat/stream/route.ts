import type { NextRequest } from "next/server";
import { UserStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { verifySessionValue } from "@/lib/session";
import { sessionCookieName } from "@/lib/session-constants";
import { isStaffChatEmployeeActive } from "@/lib/staff-chat-core";
import { subscribeStaffChatChanges } from "@/lib/staff-chat-events";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

const heartbeatIntervalMs = 20_000;
const reconnectBeforeFunctionTimeoutMs = 240_000;

export async function GET(request: NextRequest) {
  const sessionValue = request.cookies.get(sessionCookieName)?.value ?? "";
  const session = verifySessionValue(sessionValue);
  const activeUser = session
    ? await prisma.user.findFirst({
        where: { id: session.userId, status: UserStatus.ACTIVE },
        select: { id: true, status: true, resignationDate: true },
      })
    : null;

  if (!activeUser || !session || !isStaffChatEmployeeActive(activeUser)) {
    return new Response("Authentication required.", { status: 401 });
  }
  const userId = activeUser.id;

  const encoder = new TextEncoder();
  let closed = false;
  let validating = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => Promise<void>) | undefined;
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

  function enqueue(value: string) {
    if (closed || !streamController) return;
    try {
      streamController.enqueue(encoder.encode(value));
    } catch {
      void closeStream();
    }
  }

  function sendEvent(event: "ready" | "change" | "reconnect" | "auth-expired") {
    enqueue(`event: ${event}\ndata: {}\n\n`);
  }

  async function closeStream() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeatTimer);
    clearTimeout(reconnectTimer);
    request.signal.removeEventListener("abort", handleAbort);
    try {
      streamController?.close();
    } catch {
      // Cancellation can close the controller before the abort handler runs.
    }
    await unsubscribe?.();
  }

  function handleAbort() {
    void closeStream();
  }

  function expireAuthentication() {
    sendEvent("auth-expired");
    void closeStream();
  }

  async function heartbeat() {
    if (closed || validating) return;
    if (!verifySessionValue(sessionValue)) {
      expireAuthentication();
      return;
    }

    validating = true;
    try {
      const stillActive = await prisma.user.findFirst({
        where: { id: userId, status: UserStatus.ACTIVE },
        select: { id: true, status: true, resignationDate: true },
      });
      if (!stillActive || !isStaffChatEmployeeActive(stillActive)) expireAuthentication();
      else enqueue(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      sendEvent("reconnect");
      void closeStream();
    } finally {
      validating = false;
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      streamController = controller;
      request.signal.addEventListener("abort", handleAbort, { once: true });
      if (request.signal.aborted) {
        await closeStream();
        return;
      }

      enqueue("retry: 3000\n\n");
      heartbeatTimer = setInterval(() => void heartbeat(), heartbeatIntervalMs);
      reconnectTimer = setTimeout(() => {
        sendEvent("reconnect");
        void closeStream();
      }, reconnectBeforeFunctionTimeoutMs);

      try {
        unsubscribe = await subscribeStaffChatChanges(userId, {
          onChange() {
            if (!verifySessionValue(sessionValue)) expireAuthentication();
            else sendEvent("change");
          },
          onStatus(status) {
            sendEvent(status);
            if (status === "reconnect") void closeStream();
          },
        });
        if (closed) await unsubscribe();
      } catch {
        sendEvent("reconnect");
        await closeStream();
      }
    },
    cancel() {
      return closeStream();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "private, no-store, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
