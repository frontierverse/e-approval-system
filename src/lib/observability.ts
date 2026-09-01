export type ServerLogLevel = "error" | "info" | "warn";

export type ServerLogDetails = Record<
  string,
  boolean | number | string | null | undefined
>;

const safeDigestPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export function createLogId(prefix = "evt") {
  const randomId = globalThis.crypto?.randomUUID?.();

  if (randomId) {
    return `${prefix}_${randomId}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 14)}`;
}

export function getSafeErrorDigest(error: unknown) {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return null;
  }

  let digestValue: unknown;

  try {
    digestValue = error.digest;
  } catch {
    return null;
  }

  if (typeof digestValue !== "string" && typeof digestValue !== "number") {
    return null;
  }

  const digest = String(digestValue);

  return safeDigestPattern.test(digest) ? digest : null;
}

/**
 * Writes one-line JSON that log collectors can index. Callers must only pass
 * operational metadata; raw request headers, query strings, exception messages,
 * and user-entered values are intentionally excluded.
 */
export function logServerEvent(
  level: ServerLogLevel,
  event: string,
  details: ServerLogDetails = {},
) {
  const safeDetails = Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  );
  const entry = JSON.stringify({
    ...safeDetails,
    timestamp: new Date().toISOString(),
    level,
    event,
    eventId: createLogId(),
  });

  if (level === "error") {
    console.error(entry);
    return;
  }

  if (level === "warn") {
    console.warn(entry);
    return;
  }

  console.info(entry);
}
