import type { Instrumentation } from "next";
import {
  createLogId,
  getSafeErrorDigest,
  logServerEvent,
} from "@/lib/observability";

export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  logServerEvent("error", "request.failed", {
    requestId: createLogId("req"),
    method: request.method.toUpperCase(),
    route: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
    digest: getSafeErrorDigest(error),
  });
};
