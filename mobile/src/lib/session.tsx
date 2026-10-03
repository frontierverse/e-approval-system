import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { apiRequest, ApiError } from "./api";
import { clearAttachmentTransferCache } from "./attachment-transfer";
import type { MobileUser } from "./types";

const SESSION_KEY = "gyeoljaeon.mobile.session";

type SessionContextValue = {
  token: string | null;
  user: MobileUser | null;
  loading: boolean;
  error: string | null;
  signIn: (name: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  request: <T,>(path: string, options?: { method?: "GET" | "POST" | "DELETE"; body?: unknown }) => Promise<T>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

async function readToken() {
  return Platform.OS === "web" ? null : SecureStore.getItemAsync(SESSION_KEY);
}

async function saveToken(token: string | null) {
  if (Platform.OS === "web") return;
  if (token) await SecureStore.setItemAsync(SESSION_KEY, token);
  else await SecureStore.deleteItemAsync(SESSION_KEY);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<MobileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Clear private exported copies and cancel transfers when the account changes.
  useEffect(() => { void clearAttachmentTransferCache().catch(() => undefined); }, [token]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await readToken();
        if (!stored) return;
        const result = await apiRequest<{ user: MobileUser }>("/auth/me", { token: stored });
        if (active) { setToken(stored); setUser(result.user); }
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
    await saveToken(result.token);
    setToken(result.token);
    setUser(result.user);
    setError(null);
  }, []);

  const signOut = useCallback(async () => {
    const current = token;
    await saveToken(null);
    setToken(null);
    setUser(null);
    if (current) await apiRequest("/auth/logout", { method: "POST", token: current }).catch(() => undefined);
  }, [token]);

  const request = useCallback(async <T,>(path: string, options: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {}) => {
    if (!token) throw new ApiError("로그인이 필요합니다.", 401);
    try {
      return await apiRequest<T>(path, { ...options, token });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setToken(null);
        setUser(null);
        await saveToken(null);
      }
      throw cause;
    }
  }, [token]);

  const value = useMemo(() => ({ token, user, loading, error, signIn, signOut, request }),
    [token, user, loading, error, signIn, signOut, request]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("SessionProvider가 필요합니다.");
  return session;
}
