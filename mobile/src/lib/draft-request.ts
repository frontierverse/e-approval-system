import { ApiError, apiUrl } from './api';
import { draftId, draftRequestId, recoveryAbort, recoveryObject, utf8Bytes } from './draft-recovery-core';
export type DraftRequestOptions = { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; signal?: AbortSignal; timeoutMs?: number };
function closedDraftPath(path: string, method: string) {
  if (/[#\r\n\\]/.test(path)) return false;
  const [endpoint, query, extra] = path.split('?'); if (extra !== undefined) return false;
  if (endpoint === '/drafts/options') return method === 'GET' && query === undefined;
  if (endpoint === '/drafts') return ['GET', 'POST'].includes(method) && query === undefined;
  const status = endpoint.match(/^\/drafts\/requests\/([A-Za-z0-9_-]+)$/);
  if (status) { if (method !== 'GET' || !draftRequestId(status[1])) return false; if (query === undefined) return true; const params = new URLSearchParams(query); return params.size === 1 && params.getAll('documentId').length === 1 && draftId(params.get('documentId')) && query === `documentId=${encodeURIComponent(params.get('documentId')!)}`; }
  if (endpoint === '/drafts/uploads') return method === 'POST' && query === undefined;
  if (endpoint === '/drafts/requests') return false;
  const draft = endpoint.match(/^\/drafts\/([A-Za-z0-9_-]+)$/);
  if (draft) return draftId(draft[1]) && ['GET', 'POST'].includes(method) && query === undefined;
  const file = endpoint.match(/^\/drafts\/([A-Za-z0-9_-]+)\/attachments\/([A-Za-z0-9_-]+)$/);
  if (file) return draftId(file[1]) && draftId(file[2]) && method === 'DELETE' && query === undefined;
  const upload = endpoint.match(/^\/drafts\/uploads\/([A-Za-z0-9_-]+)(\/complete)?$/);
  return !!upload && draftId(upload[1]) && method === (upload[2] ? 'POST' : 'DELETE') && query === undefined;
}
export async function draftRequest<T>(path: string, token: string, options: DraftRequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  if (!closedDraftPath(path, method)) throw new ApiError('기안 요청 경로를 확인하세요.', 400);
  if (!token) throw new ApiError('로그인이 필요합니다.', 401);
  let body: string | undefined; try { body = options.body === undefined ? undefined : JSON.stringify(options.body); } catch { throw new ApiError('요청 내용을 확인하세요.', 400); }
  if (body && (body.length > 300000 || utf8Bytes(body) > 1200000)) throw new ApiError('요청 내용이 전송 한계를 넘었습니다. 입력은 유지됩니다.', 413);
  if (options.signal?.aborted) throw recoveryAbort();
  const controller = new AbortController(); let timedOut = false;
  const abort = () => controller.abort(); options.signal?.addEventListener('abort', abort, { once: true });
  let rejectStopped!: (cause: Error) => void;
  const stopped = new Promise<never>((_resolve, reject) => { rejectStopped = reject; });
  const stop = () => rejectStopped(timedOut ? new ApiError('응답 시간이 초과되었습니다. 원래 저장 요청의 결과를 확인하세요.', 0) : recoveryAbort());
  controller.signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 30000);
  try {
    if (controller.signal.aborted) throw recoveryAbort();
    return await Promise.race([(async () => {
      let response: Response;
      try { response = await fetch(apiUrl(path), { method, body, signal: controller.signal, redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } }); }
      catch { if (controller.signal.aborted) throw timedOut ? new ApiError('응답 시간이 초과되었습니다. 원래 저장 요청의 결과를 확인하세요.', 0) : recoveryAbort(); throw new ApiError('서버 연결을 확인하세요. 저장 중이었다면 원 요청의 결과를 확인하세요.', 0); }
      const value: unknown = await response.json().catch(() => null);
      if (controller.signal.aborted) throw recoveryAbort();
      if (!response.ok) throw new ApiError(recoveryObject(value) && typeof value.error === 'string' ? value.error : '기안 요청을 처리하지 못했습니다.', response.status, recoveryObject(value) && recoveryObject(value.fields) ? Object.fromEntries(Object.entries(value.fields).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : undefined, recoveryObject(value) && typeof value.code === 'string' ? value.code : undefined);
      if (!recoveryObject(value)) throw new ApiError('응답을 확인하지 못했습니다. 원래 저장 요청의 결과를 확인하세요.', response.status);
      return value as T;
    })(), stopped]);
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', stop); }
}
