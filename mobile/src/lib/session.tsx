import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { apiRequest, ApiError } from "./api";
import { clearAttachmentTransferCache } from "./attachment-transfer";
import { clearAccountImageResources } from "./account-image";
import { clearChatFileResources } from "./chat-file-transfer";
import { clearResourceFileResources } from "./resource-file-transfer";
import { clearYouthResources } from "./youth-privacy";
import { clearYouthFileResources } from "./youth-file-transfer";
import type { MobileUser } from "./types";

const SESSION_KEY = "gyeoljaeon.mobile.session";

type SessionContextValue = {
  token: string | null;
  user: MobileUser | null;
  loading: boolean;
  error: string | null;
  signIn: (name: string, password: string) => Promise<void>;
  signOut: (options?: { message?: string }) => Promise<void>;
  expireSession: (expectedToken: string, message?: string) => Promise<void>;
  request: <T,>(path: string, options?: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown }) => Promise<T>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

async function readToken() {
  return Platform.OS === "web" ? null : SecureStore.getItemAsync(SESSION_KEY);
}

let storageWrite: Promise<void> = Promise.resolve();
function saveToken(token: string | null) {
  // Keep an old logout write from erasing a newly signed-in account.
  const write = storageWrite.catch(() => undefined).then(async () => {
    if (Platform.OS === "web") return;
    if (token) await SecureStore.setItemAsync(SESSION_KEY, token);
    else await SecureStore.deleteItemAsync(SESSION_KEY);
  });
  storageWrite = write;
  return write;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<MobileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentToken = useRef<string | null>(null);

  // Clear private exported copies and cancel transfers when the account changes.
  useEffect(() => {
    void clearAttachmentTransferCache().catch(() => undefined);
  }, [token]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await Promise.all([clearChatFileResources().catch(() => undefined), clearResourceFileResources().catch(() => undefined), clearYouthResources().catch(() => undefined), clearYouthFileResources().catch(() => undefined)]);
        await clearAccountImageResources().catch(() => undefined);
        const stored = await readToken();
        if (!stored) return;
        const result = await apiRequest<{ user: MobileUser }>("/auth/me", { token: stored });
        if (active) { currentToken.current = stored; setToken(stored); setUser(result.user); }
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) await saveToken(null);
        else if (active) setError(cause instanceof Error ? cause.message : "로그인을 확인하지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const signIn = useCallback(async (name: string, password: string) => {
    const result = await apiRequest<{ token: string; user: MobileUser }>("/auth/login", {
      method: "POST", body: { name, password },
    });
    await Promise.all([clearChatFileResources().catch(() => undefined), clearResourceFileResources().catch(() => undefined), clearYouthResources().catch(() => undefined), clearYouthFileResources().catch(() => undefined)]);
    await clearAccountImageResources().catch(() => undefined);
    await saveToken(result.token);
    // Cancel old-account work started while the encrypted token write awaited.
    if (currentToken.current && currentToken.current !== result.token) {
      void clearChatFileResources().catch(() => undefined);
      void clearResourceFileResources().catch(() => undefined);
      void clearYouthResources().catch(() => undefined);
      void clearYouthFileResources().catch(() => undefined);
    }
    currentToken.current = result.token;
    setToken(result.token);
    setUser(result.user);
    setError(null);
  }, []);

  const expireSession = useCallback(async (expectedToken: string, message = "로그인이 만료되었습니다. 다시 로그인하세요.") => {
    if (currentToken.current !== expectedToken) return;
    // Invalidate private operations synchronously before a late transfer can publish.
    void clearChatFileResources().catch(() => undefined);
    void clearResourceFileResources().catch(() => undefined);
    void clearYouthResources({ expectedToken }).catch(() => undefined);
    void clearYouthFileResources({ expectedToken }).catch(() => undefined);
    void clearAccountImageResources().catch(() => undefined);
    currentToken.current = null;
    setToken(null); setUser(null); setError(message);
    await saveToken(null);
  }, []);

  const signOut = useCallback(async (options?: { message?: string }) => {
    const current = currentToken.current;
    if (!current) return;
    try { await expireSession(current, options?.message ?? ""); }
    finally { await apiRequest("/auth/logout", { method: "POST", token: current }).catch(() => undefined); }
  }, [expireSession]);

  const request = useCallback(async <T,>(path: string, options: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {}) => {
    if (!token) throw new ApiError("로그인이 필요합니다.", 401);
    try {
      return await apiRequest<T>(path, { ...options, token });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await expireSession(token);
      }
      throw cause;
    }
  }, [token, expireSession]);

  const value = useMemo(() => ({ token, user, loading, error, signIn, signOut, expireSession, request }),
    [token, user, loading, error, signIn, signOut, expireSession, request]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("SessionProvider가 필요합니다.");
  return session;
}
