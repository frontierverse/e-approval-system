import { ApiError, apiUrl } from "./api";
export type YouthRequestOptions = {
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    body?: unknown;
    signal?: AbortSignal;
    timeoutMs?: number;
};
export function youthAbort() { const cause = new Error("청소년 정보 요청을 취소했습니다."); cause.name = "AbortError"; return cause; }
export async function youthRequest<T>(path: string, token: string, options: YouthRequestOptions = {}): Promise<T> {
    if (!/^\/youth(?:\/|\?|$)/.test(path) || path.includes("#") || /[\r\n]/.test(path)) throw new ApiError("청소년 요청 경로를 확인하세요.", 400);
    if (!token)
        throw new ApiError("로그인이 필요합니다.", 401);
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted)
        abort();
    let rejectStopped!: (cause: Error) => void;
    const stopped = new Promise<never>((_resolve, reject) => { rejectStopped = reject; });
    const stop = () => rejectStopped(timedOut ? new ApiError("청소년 정보 요청 시간이 초과되었습니다. 원래 요청의 결과를 다시 확인하세요.", 0) : youthAbort());
    controller.signal.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 30000);
    try {
        let body: string | undefined;
        try {
            body = options.body === undefined ? undefined : JSON.stringify(options.body);
        }
        catch {
            throw new ApiError("요청 내용을 확인하세요.", 400);
        }
        if (controller.signal.aborted)
            throw youthAbort();
        if (body && new TextEncoder().encode(body).length > (path === "/youth" || options.method === "PATCH" || path === "/youth/common-schedules/batch" ? 8 * 1024 * 1024 : 64 * 1024))
            throw new ApiError("요청 내용이 전송 한계를 넘었습니다. 내용을 줄인 뒤 다시 확인하세요.", 413);
        return await Promise.race([(async () => {
                let response: Response;
                try {
                    response = await fetch(apiUrl(path), { method: options.method ?? "GET", body, signal: controller.signal, cache: "no-store", redirect: "error", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) } });
                }
                catch {
                    if (controller.signal.aborted)
                        throw timedOut ? new ApiError("청소년 정보 요청 시간이 초과되었습니다. 원래 요청의 결과를 다시 확인하세요.", 0) : youthAbort();
                    throw new ApiError("청소년 정보 요청 결과를 확인하지 못했습니다. 연결을 확인하고 같은 요청으로 다시 확인하세요.", 0);
                }
                const value: unknown = await response.json().catch(() => null);
                if (controller.signal.aborted)
                    throw youthAbort();
                const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
                if (!response.ok)
                    throw new ApiError(typeof data?.error === "string" ? data.error : "청소년 정보 요청을 처리하지 못했습니다.", response.status, data?.fields && typeof data.fields === "object" && !Array.isArray(data.fields) ? Object.fromEntries(Object.entries(data.fields).filter((entry): entry is [
                        string,
                        string
                    ] => typeof entry[1] === "string")) : undefined, typeof data?.code === "string" ? data.code : undefined);
                if (!data)
                    throw new ApiError("청소년 정보 요청 결과를 확인하지 못했습니다. 원래 요청의 결과를 다시 확인하세요.", response.status);
                return data as T;
            })(), stopped]);
    }
    finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
        controller.signal.removeEventListener("abort", stop);
    }
}
