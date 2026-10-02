export class ApiError extends Error {
  constructor(message: string, public status: number, public fields?: Record<string, string>) {
    super(message);
  }
}

export function apiBaseUrl() {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, "");
  if (!value || !/^https?:\/\//.test(value)) {
    throw new ApiError("앱 서버 주소가 설정되지 않았습니다. 관리자에게 문의하세요.", 0);
  }
  if (!__DEV__ && !value.startsWith("https://")) {
    throw new ApiError("운영 앱은 HTTPS 서버 주소가 필요합니다.", 0);
  }
  return value;
}

export function apiUrl(path: string) {
  return `${apiBaseUrl()}/api/mobile${path}`;
}

export async function apiRequest<T>(
  path: string,
  options: { token?: string; method?: "GET" | "POST" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("서버에 연결할 수 없습니다. 연결을 확인하고 다시 시도하세요.", 0);
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "error" in data &&
      typeof data.error === "string" ? data.error : "요청을 처리하지 못했습니다.";
    const fields = typeof data === "object" && data !== null && "fields" in data && typeof data.fields === "object" && data.fields !== null ? Object.fromEntries(Object.entries(data.fields).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : undefined;
    throw new ApiError(message, response.status, fields);
  }
  if (!data || typeof data !== "object") {
    throw new ApiError("앱 서버가 올바르게 응답하지 않습니다. 관리자에게 문의하세요.", response.status);
  }
  return data as T;
}
