import { logServerEvent } from "@/lib/observability";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const readinessTimeoutMs = 2_000;

export async function GET() {
  const startedAt = performance.now();

  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, readinessTimeoutMs);

    return Response.json(
      { status: "ok" },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    logServerEvent("error", "health.readiness_failed", {
      durationMs: Math.round(performance.now() - startedAt),
    });

    return Response.json(
      { status: "unavailable" },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Readiness check timed out.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
