import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type PropsWithChildren } from "react";
import { AppState, Platform } from "react-native";
import { ApiError } from "@/lib/api";
import { resourceAbort, resourceRequest, type ResourceRequestOptions } from "@/lib/resource-request";
import { useSession } from "@/lib/session";
type ResourceContextValue = {
    foreground: boolean;
    foregroundRevision: number;
    isForeground(): boolean;
    foregroundGeneration(): number;
    isCurrentAccount(): boolean;
    authenticatedRequest<T>(path: string, options?: ResourceRequestOptions): Promise<T>;
};
const ResourceContext = createContext<ResourceContextValue | null>(null);
export function useResources() {
    const value = useContext(ResourceContext);
    if (!value)
        throw new Error("ResourceProvider가 필요합니다.");
    return value;
}
export function ResourceProvider({ children }: PropsWithChildren) {
    const { token, user, expireSession } = useSession();
    const key = token && user ? `${user.id}:${token}` : "";
    const scope = useRef(key);
    useLayoutEffect(() => { scope.current = key; }, [key]);
    return <AccountResources key={key} token={token} isAccount={() => scope.current === key} expireSession={expireSession}>{children}</AccountResources>;
}
function AccountResources({ token, isAccount, expireSession, children }: PropsWithChildren<{
    token: string | null;
    isAccount(): boolean;
    expireSession(token: string, message?: string): Promise<void>;
}>) {
    const account = useRef(isAccount);
    const alive = useRef(false);
    const generation = useRef(0);
    const requests = useRef(new Set<AbortController>());
    const [ready, setReady] = useState(false);
    const foregroundRef = useRef(AppState.currentState === "active"), foregroundEpoch = useRef(0);
    const [foreground, setForeground] = useState(AppState.currentState === "active"), [foregroundRevision, setForegroundRevision] = useState(0);
    useLayoutEffect(() => { account.current = isAccount; }, [isAccount]);
    const isCurrentAccount = useCallback(() => alive.current && account.current() && !!token, [token]);
    const isForeground = useCallback(() => isCurrentAccount() && foregroundRef.current, [isCurrentAccount]);
    const foregroundGeneration = useCallback(() => foregroundEpoch.current, []);
    const authenticatedRequest = useCallback(async <T,>(path: string, options: ResourceRequestOptions = {}): Promise<T> => {
        const epoch = generation.current, foregroundAtStart = foregroundEpoch.current;
        if (!isForeground() || !token)
            throw resourceAbort();
        const controller = new AbortController();
        requests.current.add(controller);
        const abort = () => controller.abort();
        options.signal?.addEventListener("abort", abort, { once: true });
        if (options.signal?.aborted)
            abort();
        try {
            const result = await resourceRequest<T>(path, token, { ...options, signal: controller.signal });
            if (!isCurrentAccount() || epoch !== generation.current || foregroundAtStart !== foregroundEpoch.current || controller.signal.aborted)
                throw resourceAbort();
            return result;
        }
        catch (cause) {
            if (!isCurrentAccount() || epoch !== generation.current || foregroundAtStart !== foregroundEpoch.current)
                throw resourceAbort();
            if (cause instanceof ApiError && cause.status === 401)
                await expireSession(token);
            throw cause;
        }
        finally {
            requests.current.delete(controller);
            options.signal?.removeEventListener("abort", abort);
        }
    }, [expireSession, isCurrentAccount, isForeground, token]);
    const invalidate = useCallback(() => { generation.current++; }, []);
    useEffect(() => {
        alive.current = true;
        invalidate();
        const epoch = generation.current;
        queueMicrotask(() => { if (alive.current && epoch === generation.current)
            setReady(true); });
        const activeRequests = requests.current;
        return () => {
            alive.current = false;
            invalidate();
            for (const controller of activeRequests)
                controller.abort();
            activeRequests.clear();
        };
    }, [invalidate]);
    useEffect(() => {
        const transition = (active: boolean) => {
            if (foregroundRef.current !== active) { foregroundEpoch.current++; setForegroundRevision(foregroundEpoch.current); }
            foregroundRef.current = active;
            setForeground(active);
        };
        const change = AppState.addEventListener("change", state => transition(state === "active"));
        const blur = Platform.OS === "android" ? AppState.addEventListener("blur", () => transition(false)) : null;
        const focus = Platform.OS === "android" ? AppState.addEventListener("focus", () => transition(AppState.currentState === "active")) : null;
        return () => { change.remove(); blur?.remove(); focus?.remove(); };
    }, []);
    return <ResourceContext.Provider value={{ foreground: foreground && ready, foregroundRevision, foregroundGeneration, isForeground, isCurrentAccount, authenticatedRequest }}>{children}</ResourceContext.Provider>;
}
