import { ApiError, apiUrl } from './api';
export type LunchCafeRequestOptions = { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; signal?: AbortSignal; timeoutMs?: number };
export function lunchCafeAbort() { const error = new Error('요청을 취소했습니다.'); error.name = 'AbortError'; return error; }
export async function lunchCafeRequest<T>(path: string, token: string, options: LunchCafeRequestOptions = {}): Promise<T> {
  const endpoint = path.split('?')[0];
  if (!/^\/(?:meal-menu|cafe\/(?:items(?:\/[A-Za-z0-9_-]{1,128}(?:\/hold)?)?|history|notes(?:\/[A-Za-z0-9_-]{1,128})?|mutations\/[A-Za-z0-9_-]{1,128}))$/.test(endpoint) || /[#\r\n\\]/.test(path)) throw new ApiError('요청 경로를 확인하세요.', 400);
  if (!token) throw new ApiError('로그인이 필요합니다.', 401);
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  let rejectStopped!: (cause: Error) => void;
  const stopped = new Promise<never>((_resolve, reject) => { rejectStopped = reject; });
  const stop = () => rejectStopped(timedOut ? new ApiError('요청 시간이 초과되었습니다. 저장 중이었다면 원래 요청의 결과를 확인하세요.', 0) : lunchCafeAbort());
  controller.signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 30000);
  try {
    let body: string | undefined;
    try { body = options.body === undefined ? undefined : JSON.stringify(options.body); }
    catch { throw new ApiError('요청 내용을 확인하세요.', 400); }
    if (body && new TextEncoder().encode(body).length > 65536) throw new ApiError('내용이 전송 한계를 넘었습니다. 내용을 줄여 주세요.', 413);
    if (controller.signal.aborted) throw lunchCafeAbort();
    return await Promise.race([(async () => {
      let response: Response;
      try {
        response = await fetch(apiUrl(path), { method: options.method ?? 'GET', body, signal: controller.signal, cache: 'no-store', redirect: 'error', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } });
      } catch {
        if (controller.signal.aborted) throw timedOut ? new ApiError('요청 시간이 초과되었습니다. 원래 요청의 결과를 확인하세요.', 0) : lunchCafeAbort();
        throw new ApiError('연결을 확인하세요. 저장 중이었다면 원래 요청의 결과부터 확인하세요.', 0);
      }
      const value: unknown = await response.json().catch(() => null);
      if (controller.signal.aborted) throw lunchCafeAbort();
      const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
      if (!response.ok) throw new ApiError(typeof record?.error === 'string' ? record.error : '요청을 처리하지 못했습니다.', response.status, record?.fields && typeof record.fields === 'object' && !Array.isArray(record.fields) ? Object.fromEntries(Object.entries(record.fields).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : undefined, typeof record?.code === 'string' ? record.code : undefined);
      if (!record) throw new ApiError('응답을 확인하지 못했습니다. 원래 요청의 결과를 확인하세요.', response.status);
      return record as T;
    })(), stopped]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', stop);
  }
}
