import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { UserStatus } from "@/generated/prisma/client";
import { isLunchBoxDate } from "@/lib/lunch-box-counts-core";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { getSupabaseRealtimeServerClient } from "@/lib/supabase-realtime-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

const heartbeatIntervalMs = 20_000;
const reconnectBeforeFunctionTimeoutMs = 240_000;

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? "";

  if (!isLunchBoxDate(date)) {
    return new Response("Invalid date.", { status: 400 });
  }

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
    console.error("[lunch-box-realtime] Configuration error.", {
      message:
        error instanceof Error
          ? error.message
          : "Unknown configuration error.",
    });
    return new Response("Realtime is not configured.", { status: 503 });
  }

  const encoder = new TextEncoder();
  const channel = supabase.channel(
    `lunch-box-checks:${date}:${randomUUID()}`,
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

  function sendEvent(event: string, data: Record<string, unknown>) {
    enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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
            filter: `date=eq.${date}`,
            schema: "public",
            table: "LunchBoxCount",
          },
          () => {
            sendEvent("change", { date });
          },
        )
        .subscribe((status, error) => {
          if (closed) {
            return;
          }

          if (status === "SUBSCRIBED") {
            sendEvent("ready", { date });
            return;
          }

          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            console.error("[lunch-box-realtime] Channel disconnected.", {
              date,
              message:
                error instanceof Error
                  ? error.message
                  : "No channel error detail.",
              status,
            });
            sendEvent("reconnect", { date });
            setTimeout(() => void closeStream(), 0);
          }
        });

      heartbeatTimer = setInterval(() => {
        enqueue(`: heartbeat ${Date.now()}\n\n`);
      }, heartbeatIntervalMs);
      reconnectTimer = setTimeout(() => {
        sendEvent("reconnect", { date });
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
