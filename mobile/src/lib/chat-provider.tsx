import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type PropsWithChildren } from "react";
import { AppState, Platform } from "react-native";
import { ApiError, apiRequest } from "@/lib/api";
import { chatError, isChatSummary } from "@/lib/chat";
import { useSession } from "@/lib/session";
import type { ChatSummary } from "@/lib/types";
type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
};
type ChatContextValue = {
  summary: ChatSummary | null;
  unreadCount: number | null;
  loading: boolean;
  error: string | null;
  foreground: boolean;
  refreshSummary: () => Promise<ChatSummary | null>;
  authenticatedRequest: <T>(path: string, options?: RequestOptions) => Promise<T>;
  isCurrentAccount: () => boolean;
};
const ChatContext = createContext<ChatContextValue | null>(null);
export function useChat() {
  const context = useContext(ChatContext);
  if (!context)
    throw new Error("ChatProvider가 필요합니다.");
  return context;
}
export function ChatProvider({ children }: PropsWithChildren) {
  const { token, user, expireSession } = useSession();
  const key = token && user ? `${user.id}:${token}` : "";
  const scope = useRef(key);
  useLayoutEffect(() => {
    scope.current = key;
  }, [key]);
  return <AccountChatProvider key={key} token={token} userId={user?.id ?? ""} isAccount={() => scope.current === key} expireSession={expireSession}>{children}</AccountChatProvider>;
}
function AccountChatProvider({ children, token, userId, isAccount, expireSession }: PropsWithChildren<{
  token: string | null;
  userId: string;
  isAccount: () => boolean;
  expireSession: (token: string, message?: string) => Promise<void>;
}>) {
  const account = useRef(isAccount);
  useLayoutEffect(() => { account.current = isAccount; }, [isAccount]);
  const alive = useRef(false);
  const generation = useRef(0);
  const [summary, setSummary] = useState<ChatSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const visible = useRef(AppState.currentState === "active");
  const inFlight = useRef<Promise<ChatSummary | null> | null>(null);
  const isCurrentAccount = useCallback(() => alive.current && account.current() && !!token, [token]);
  const authenticatedRequest = useCallback(async <T,>(path: string, options: RequestOptions = {}): Promise<T> => {
    const epoch = generation.current;
    if (!isCurrentAccount() || !token)
      throw new ApiError("현재 계정을 다시 확인하세요.", 401);
    try {
      const result = await apiRequest<T>(path, { ...options, token });
      if (!isCurrentAccount() || epoch !== generation.current)
        throw new ApiError("현재 계정을 다시 확인하세요.", 401);
      return result;
    }
    catch (cause) {
      if (isCurrentAccount() && epoch === generation.current && cause instanceof ApiError && cause.status === 401)
        await expireSession(token);
      throw cause;
    }
  }, [expireSession, isCurrentAccount, token]);
  const refreshSummary = useCallback((): Promise<ChatSummary | null> => {
    if (!isCurrentAccount())
      return Promise.resolve(null);
    if (inFlight.current)
      return inFlight.current;
    const epoch = generation.current;
    setLoading(true);
    let promise!: Promise<ChatSummary | null>;
    promise = (async () => {
      try {
        const value = await authenticatedRequest<unknown>("/chat");
        if (!isChatSummary(value, userId))
          throw new ApiError("채팅 목록 응답을 확인할 수 없습니다.", 200);
        if (!isCurrentAccount() || epoch !== generation.current)
          return null;
        setSummary(value);
        setError(null);
        return value;
      }
      catch (cause) {
        if (isCurrentAccount() && epoch === generation.current) {
          setError(chatError(cause));
          if (cause instanceof ApiError && [401, 403, 404].includes(cause.status))
            setSummary(null);
        }
        return null;
      }
      finally {
        if (inFlight.current === promise)
          inFlight.current = null;
        if (isCurrentAccount() && epoch === generation.current)
          setLoading(false);
      }
    })();
    inFlight.current = promise;
    return promise;
  }, [authenticatedRequest, isCurrentAccount, userId]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    alive.current = true;
    invalidate();
    if (token && visible.current)
      void refreshSummary();
    return () => {
      alive.current = false;
      invalidate();
      inFlight.current = null;
    };
  }, [invalidate, refreshSummary, token]);
  useEffect(() => {
    const update = (value: boolean) => {
      visible.current = value;
      setForeground(value);
      if (value)
        void refreshSummary();
    };
    const change = AppState.addEventListener("change", state => update(state === "active"));
    const blur = Platform.OS === "android" ? AppState.addEventListener("blur", () => update(false)) : null;
    const focus = Platform.OS === "android" ? AppState.addEventListener("focus", () => update(AppState.currentState === "active")) : null;
    const interval = setInterval(() => {
      if (visible.current && isCurrentAccount())
        void refreshSummary();
    }, 5000);
    return () => {
      change.remove();
      blur?.remove();
      focus?.remove();
      clearInterval(interval);
    };
  }, [isCurrentAccount, refreshSummary]);
  return <ChatContext.Provider value={{ summary, unreadCount: error ? null : summary?.unreadCount ?? null, loading, error, foreground, refreshSummary, authenticatedRequest, isCurrentAccount }}>{children}</ChatContext.Provider>;
}
