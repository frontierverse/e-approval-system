import { MobileDraftError } from "@/lib/mobile-draft-core";

/** JSON.parse validates grammar first; this bounded walk then detects duplicate decoded keys. */
function rejectDuplicateDraftJsonKeys(source: string) {
  let position = 0;
  const space = () => { while (/\s/.test(source[position] ?? "")) position++; };
  const string = () => { const start = position++; while (position < source.length) { if (source[position++] === "\\") position++; else if (source[position - 1] === '"') break; } return JSON.parse(source.slice(start, position)) as string; };
  const value = (depth: number) => {
    if (depth > 64) throw new MobileDraftError("입력 내용을 확인하세요.");
    space(); const token = source[position];
    if (token === "{") {
      position++; space(); const keys = new Set<string>();
      if (source[position] !== "}") while (true) { space(); const key = string(); if (keys.has(key)) throw new MobileDraftError("중복 입력 항목을 확인해 주세요."); keys.add(key); space(); position++; value(depth + 1); space(); if (source[position] !== ",") break; position++; }
      position++;
    } else if (token === "[") { position++; space(); if (source[position] !== "]") while (true) { value(depth + 1); space(); if (source[position] !== ",") break; position++; } position++; }
    else if (token === '"') string();
    else while (position < source.length && !/[\s,}\]]/.test(source[position])) position++;
  };
  value(0);
}
export async function readMobileDraftJson(request: Request): Promise<unknown> {
  if ((request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") throw new MobileDraftError("JSON 요청이 필요합니다.", 415, undefined, "UNSUPPORTED_MEDIA_TYPE");
  const declared = request.headers.get("content-length"), max = 1200000;
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw new MobileDraftError("입력 내용을 확인하세요.");
  if (declared !== null && Number(declared) > max) throw new MobileDraftError("요청이 너무 큽니다.", 413, undefined, "PAYLOAD_TOO_LARGE");
  if (!request.body) throw new MobileDraftError("입력 내용을 확인하세요.");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [], deadline = Date.now() + 10000;
  let size = 0;
  try {
    while (true) {
      if (Date.now() >= deadline) { void reader.cancel().catch(() => undefined); throw new MobileDraftError("요청 시간이 초과되었습니다. 입력을 보관하고 다시 시도해 주세요.", 408, undefined, "REQUEST_TIMEOUT"); }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new MobileDraftError("요청 시간이 초과되었습니다. 입력을 보관하고 다시 시도해 주세요.", 408, undefined, "REQUEST_TIMEOUT")); void reader.cancel().catch(() => undefined); }, Math.max(1, deadline - Date.now())); });
      const next = await Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
      if (Date.now() >= deadline) { void reader.cancel().catch(() => undefined); throw new MobileDraftError("요청 시간이 초과되었습니다. 입력을 보관하고 다시 시도해 주세요.", 408, undefined, "REQUEST_TIMEOUT"); }
      if (next.done) break;
      size += next.value.byteLength;
      if (size > max) { void reader.cancel().catch(() => undefined); throw new MobileDraftError("요청이 너무 큽니다.", 413, undefined, "PAYLOAD_TOO_LARGE"); }
      chunks.push(next.value);
    }
  } catch (error) { if (error instanceof MobileDraftError) throw error; throw new MobileDraftError("입력 내용을 확인하세요."); }
  finally { reader.releaseLock(); }
  if (declared !== null && Number(declared) !== size) throw new MobileDraftError("입력 내용을 확인하세요.");
  try { const source = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size)); if (source.length > 300000) throw new MobileDraftError("입력 내용이 너무 큽니다.", 413); const value = JSON.parse(source) as unknown; rejectDuplicateDraftJsonKeys(source); if (Date.now() >= deadline) throw new MobileDraftError("요청 시간이 초과되었습니다. 입력을 보관하고 다시 시도해 주세요.", 408, undefined, "REQUEST_TIMEOUT"); return value; }
  catch (error) { if (error instanceof MobileDraftError) throw error; throw new MobileDraftError("입력 내용을 확인하세요."); }
}
