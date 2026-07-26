import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { UserStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { getSupabaseRealtimeServerClient } from "@/lib/supabase-realtime-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

const heartbeatIntervalMs = 20_000;
const reconnectBeforeFunctionTimeoutMs = 240_000;

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  const activeUser = userId
    ? await prisma.user.findFirst({
        where: {
          id: userId,
          status: UserStatus.ACTIVE,
        },
        select: { id: true },
      })
    : null;

  if (!activeUser) {
    return new Response("Authentication required.", { status: 401 });
  }

  let supabase: ReturnType<typeof getSupabaseRealtimeServerClient>;

  try {
    supabase = getSupabaseRealtimeServerClient();
  } catch (error) {
    console.error("[lunch-box-school-realtime] Configuration error.", {
      message:
        error instanceof Error ? error.message : "Unknown configuration error.",
    });
    return new Response("Realtime is not configured.", { status: 503 });
  }

  const encoder = new TextEncoder();
  const channel = supabase.channel(
    `lunch-box-school-checks:${randomUUID()}`,
  );
  let closed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let streamController:
    | ReadableStreamDefaultController<Uint8Array>
    | undefined;

  function enqueue(value: string) {
    if (closed || !streamController) {
      return;
    }

    try {
      streamController.enqueue(encoder.encode(value));
    } catch {
      void closeStream();
    }
  }

  function sendEvent(event: string) {
    enqueue(`event: ${event}\ndata: {}\n\n`);
  }

  async function closeStream() {
    if (closed) {
      return;
    }

    closed = true;

    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    request.signal.removeEventListener("abort", handleAbort);

    try {
      streamController?.close();
    } catch {
      // The browser may have already closed the stream.
    }

    await supabase.removeChannel(channel).catch(() => undefined);
  }

  function handleAbort() {
    void closeStream();
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      request.signal.addEventListener("abort", handleAbort, { once: true });

      if (request.signal.aborted) {
        void closeStream();
        return;
      }

      enqueue("retry: 1000\n\n");

      channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "LunchBoxSchoolCheck",
          },
          () => {
            sendEvent("change");
          },
        )
        .subscribe((status, error) => {
          if (closed) {
            return;
          }

          if (status === "SUBSCRIBED") {
            sendEvent("ready");
            return;
          }

          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            console.error("[lunch-box-school-realtime] Channel disconnected.", {
              message:
                error instanceof Error
                  ? error.message
                  : "No channel error detail.",
              status,
            });
            sendEvent("reconnect");
            setTimeout(() => void closeStream(), 0);
          }
        });

      heartbeatTimer = setInterval(() => {
        enqueue(`: heartbeat ${Date.now()}\n\n`);
      }, heartbeatIntervalMs);
      reconnectTimer = setTimeout(() => {
        sendEvent("reconnect");
        setTimeout(() => void closeStream(), 0);
      }, reconnectBeforeFunctionTimeoutMs);
    },
    cancel() {
      return closeStream();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
