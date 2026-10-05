export function isDraftDeleteResult(value: unknown, documentId: string): boolean {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return result.ok === true && result.deleted === true && result.documentId === documentId;
}
