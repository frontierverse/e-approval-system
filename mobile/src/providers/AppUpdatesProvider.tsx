import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import * as Updates from "expo-updates";
import * as SecureStore from "expo-secure-store";

import { beginAppUpdateRestart, cancelAppUpdateRestart, getAppUpdateBlockReason, subscribeAppUpdateSafety } from "@/lib/app-update-safety";

export type AppUpdatePhase = "disabled" | "idle" | "checking" | "downloading" | "available" | "ready" | "error";
export type AppUpdateInfo = { updateId: string | null; publishedAt: string | null; rollback: boolean };
export type AppUpdateCurrent = { updateId: string | null; runtimeVersion: string | null; publishedAt: string | null; embedded: boolean; emergency: boolean };
export type AppUpdatesValue = {
  enabled: boolean; phase: AppUpdatePhase; busy: boolean; progress: number | null;
  current: AppUpdateCurrent; available: AppUpdateInfo | null; downloaded: AppUpdateInfo | null;
  observedAt: string | null; lastCheckAt: string | null; lastDownloadedAt: string | null;
  error: string | null; storageError: string | null; appliedNotice: boolean; dismissAppliedNotice: () => void;
  check: () => Promise<void>; download: () => Promise<void>; apply: () => Promise<void>; defer: () => void;
  deferred: boolean; restarting: boolean; applyError: string | null; applyBlockedReason: string | null;
};
type Metadata = { version: 1; currentKey: string | null; observedAt: string | null; lastCheckAt: string | null; downloadedKey: string | null; lastDownloadedAt: string | null };
const STORAGE_KEY = "gyeoljaeon.app-updates.metadata.v1";
const STORAGE_OPTIONS = { keychainService: "gyeoljaeon.app-updates", keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY, requireAuthentication: false };
const EMPTY: Metadata = { version: 1, currentKey: null, observedAt: null, lastCheckAt: null, downloadedKey: null, lastDownloadedAt: null };
const AppUpdatesContext = createContext<AppUpdatesValue | null>(null);

function opaque(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,256}$/.test(value) ? value : null;
}
function iso(value: unknown): string | null {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) && date.getTime() > 0 ? date.toISOString() : null;
}
function later(a: string | null, b: string | null) { return !a ? b : !b ? a : a > b ? a : b; }
function info(value: Updates.UpdateInfo | undefined): AppUpdateInfo | null {
  return value ? { updateId: opaque(value.updateId), publishedAt: iso(value.createdAt), rollback: value.type === "rollback" } : null;
}
function manifestInfo(value: unknown): AppUpdateInfo | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const updateId = opaque(row.id);
  return updateId ? { updateId, publishedAt: iso(row.createdAt), rollback: false } : null;
}
function updateKey(value: AppUpdateInfo | null): string | null { return value?.rollback ? `rollback:${value.publishedAt ?? "embedded"}` : value?.updateId ?? null; }
function parseMetadata(raw: string | null): Metadata | null {
  if (!raw || raw.length > 2048) return null;
  try {
    const row: unknown = JSON.parse(raw);
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const data = row as Record<string, unknown>;
    if (Object.keys(data).sort().join(",") !== Object.keys(EMPTY).sort().join(",") || data.version !== 1) return null;
    if (["currentKey", "downloadedKey"].some((key) => data[key] !== null && opaque(data[key]) === null)) return null;
    if (["observedAt", "lastCheckAt", "lastDownloadedAt"].some((key) => data[key] !== null && iso(data[key]) !== data[key])) return null;
    if ((data.currentKey === null) !== (data.observedAt === null) || (data.downloadedKey === null) !== (data.lastDownloadedAt === null)) return null;
    return data as Metadata;
  } catch { return null; }
}

export function AppUpdatesProvider({ children }: { children: React.ReactNode }) {
  const native = Updates.useUpdates();
  const enabled = Platform.OS !== "web" && !__DEV__ && Updates.isEnabled;
  const current: AppUpdateCurrent = { updateId: opaque(native.currentlyRunning.updateId), runtimeVersion: opaque(native.currentlyRunning.runtimeVersion), publishedAt: iso(native.currentlyRunning.createdAt), embedded: !!native.currentlyRunning.isEmbeddedLaunch, emergency: !!native.currentlyRunning.isEmergencyLaunch };
  const currentKey = enabled && (current.updateId || current.embedded) ? `${current.runtimeVersion ?? "unknown"}:${current.updateId ?? "embedded"}` : null;
  const [metadata, setMetadata] = useState<Metadata>(EMPTY);
  const [hydrated, setHydrated] = useState(!enabled);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [appliedNotice, setAppliedNotice] = useState(false);
  const [manual, setManual] = useState<"checking" | "downloading" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<AppUpdateInfo | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [deferredKey, setDeferredKey] = useState<string | null>(null);
  const applyBlockedReason = useSyncExternalStore(subscribeAppUpdateSafety, getAppUpdateBlockReason, getAppUpdateBlockReason);
  const [fetched, setFetched] = useState<AppUpdateInfo | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const locked = useRef(false);
  const readyLatch = useRef(false);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const [suppressed, setSuppressed] = useState<{ check?: Error; download?: Error }>({});
  const live = useRef({ enabled, native });
  useLayoutEffect(() => { live.current = { enabled, native }; }, [enabled, native]);

  useEffect(() => {
    mounted.current = true;
    const stamp = ++generation.current;
    if (!enabled) return () => { mounted.current = false; generation.current = stamp + 1; };
    void (async () => {
      try {
        if (!await SecureStore.isAvailableAsync()) throw new Error("unavailable");
        const saved = parseMetadata(await SecureStore.getItemAsync(STORAGE_KEY, STORAGE_OPTIONS));
        if (!mounted.current || stamp !== generation.current) return;
        if (currentKey && saved?.currentKey !== currentKey && !current.embedded) setAppliedNotice(true);
        if (saved) setMetadata((latest) => ({ ...latest,
          observedAt: latest.currentKey && latest.currentKey === saved.currentKey ? saved.observedAt : latest.observedAt,
          lastCheckAt: later(latest.lastCheckAt, saved.lastCheckAt),
          downloadedKey: latest.downloadedKey === saved.downloadedKey || !latest.lastDownloadedAt || (saved.lastDownloadedAt && saved.lastDownloadedAt > latest.lastDownloadedAt) ? saved.downloadedKey : latest.downloadedKey,
          lastDownloadedAt: latest.downloadedKey === saved.downloadedKey || !latest.lastDownloadedAt || (saved.lastDownloadedAt && saved.lastDownloadedAt > latest.lastDownloadedAt) ? saved.lastDownloadedAt : latest.lastDownloadedAt,
        }));
      } catch { if (mounted.current && stamp === generation.current) setStorageError("업데이트 시각을 기기에 보관하지 못했습니다. 이번 실행의 상태는 확인할 수 있습니다."); }
      finally { if (mounted.current && stamp === generation.current) setHydrated(true); }
    })();
    return () => { mounted.current = false; generation.current = stamp + 1; };
  }, [enabled, currentKey, current.embedded]);

  const available = native.isUpdateAvailable ? info(native.availableUpdate) ?? found : found;
  const downloaded = native.isUpdatePending ? info(native.downloadedUpdate) ?? fetched : fetched;
  const ready = enabled && (!!native.isUpdatePending || fetched !== null);
  const readyKey = ready ? updateKey(downloaded) : null;
  const nativeCheckAt = enabled ? iso(native.lastCheckForUpdateTimeSinceRestart) : null;
  useEffect(() => {
    if (!enabled) return;
    const now = iso(new Date());
    // Record external native update events; these device observations survive restarts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMetadata((previous) => {
      const next = { ...previous,
        currentKey, observedAt: previous.currentKey === currentKey ? previous.observedAt : currentKey ? now : null,
        lastCheckAt: later(previous.lastCheckAt, nativeCheckAt),
        downloadedKey: readyKey ?? previous.downloadedKey,
        lastDownloadedAt: readyKey && previous.downloadedKey !== readyKey ? now : previous.lastDownloadedAt,
      };
      return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
    });
  }, [enabled, currentKey, nativeCheckAt, readyKey]);
  useEffect(() => {
    if (!enabled || !hydrated) return;
    const stamp = generation.current;
    const serialized = JSON.stringify(metadata);
    writeQueue.current = writeQueue.current.catch(() => {}).then(async () => {
      if (!mounted.current || stamp !== generation.current) return;
      try {
        await SecureStore.setItemAsync(STORAGE_KEY, serialized, STORAGE_OPTIONS);
        if (mounted.current && stamp === generation.current) setStorageError(null);
      } catch { if (mounted.current && stamp === generation.current) setStorageError("업데이트 시각을 기기에 보관하지 못했습니다. 이번 실행의 상태는 확인할 수 있습니다."); }
    });
  }, [enabled, hydrated, metadata]);

  const run = useCallback(async (kind: "check" | "download") => {
    const start = live.current;
    if (!mounted.current || !start.enabled || readyLatch.current || locked.current || start.native.isChecking || start.native.isDownloading || start.native.isStartupProcedureRunning || start.native.isRestarting || start.native.isUpdatePending) return;
    if (kind === "download" && !start.native.isUpdateAvailable && !found) return;
    locked.current = true;
    const stamp = generation.current;
    const active = () => mounted.current && generation.current === stamp && live.current.enabled;
    setSuppressed({ check: start.native.checkError, download: start.native.downloadError });
    setError(null);
    setManual(kind === "check" ? "checking" : "downloading");
    if (kind === "check") setMetadata((previous) => ({ ...previous, lastCheckAt: later(previous.lastCheckAt, iso(new Date())) }));
    try {
      if (kind === "check") {
        const result = await Updates.checkForUpdateAsync();
        if (!active()) return;
        if (!result.isAvailable && !result.isRollBackToEmbedded) { setFound(null); return; }
        setFound(result.isRollBackToEmbedded ? { updateId: null, publishedAt: null, rollback: true } : manifestInfo(result.manifest));
        setManual("downloading");
      }
      const result = await Updates.fetchUpdateAsync();
      if (!active()) return;
      const prepared = result.isRollBackToEmbedded ? { updateId: null, publishedAt: null, rollback: true } : result.isNew ? manifestInfo(result.manifest) : null;
      if (prepared) {
        readyLatch.current = true;
        setFetched(prepared);
        setMetadata((previous) => { const key = updateKey(prepared); return { ...previous, downloadedKey: key, lastDownloadedAt: previous.downloadedKey === key ? previous.lastDownloadedAt : iso(new Date()) }; });
      } else if (!live.current.native.isUpdatePending) setError("업데이트 다운로드를 완료하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.");
    } catch {
      if (active()) setError(kind === "check" && live.current.native.isChecking ? "업데이트를 확인하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요." : "업데이트 확인 또는 다운로드를 완료하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.");
    } finally {
      if (active()) { setSuppressed({ check: live.current.native.checkError, download: live.current.native.downloadError }); locked.current = false; setManual(null); }
    }
  }, [found]);
  const apply = useCallback(async () => {
    const start = live.current;
    if (!mounted.current || !start.enabled || locked.current || (!start.native.isUpdatePending && !readyLatch.current) || start.native.isChecking || start.native.isDownloading || start.native.isStartupProcedureRunning || start.native.isRestarting) return;
    const reason = getAppUpdateBlockReason();
    if (reason) { setApplyError(reason); return; }
    if (AppState.currentState !== "active") { setApplyError("앱 화면으로 돌아온 뒤 업데이트를 다시 적용하세요."); return; }
    if (!beginAppUpdateRestart()) return;
    locked.current = true;
    setRestarting(true);
    setApplyError(null);
    const stamp = generation.current;
    const active = () => mounted.current && stamp === generation.current && live.current.enabled;
    try {
      await writeQueue.current;
      // Recheck after storage work: the user may have started editing or left
      // the foreground while it was completing. New mutations are gated above.
      const latest = live.current.native;
      if (!active() || getAppUpdateBlockReason() || AppState.currentState !== "active" || (!latest.isUpdatePending && !readyLatch.current) || latest.isChecking || latest.isDownloading || latest.isStartupProcedureRunning || latest.isRestarting) throw new Error("restart no longer safe");
      await Updates.reloadAsync();
      // Keep the lock until the native reload. No state updates after success.
    } catch {
      cancelAppUpdateRestart();
      locked.current = false;
      if (active()) { setRestarting(false); setApplyError(getAppUpdateBlockReason() ?? "업데이트를 적용하지 못했습니다. 현재 화면은 유지됩니다. 다시 적용하세요."); }
    }
  }, []);
  const defer = useCallback(() => { if (!locked.current) { setDeferredKey(readyKey ?? "pending"); setApplyError(null); } }, [readyKey]);
  const dismissAppliedNotice = useCallback(() => setAppliedNotice(false), []);
  const check = useCallback(() => run("check"), [run]);
  const download = useCallback(() => run("download"), [run]);
  const nativeError = (native.downloadError && native.downloadError !== suppressed.download) || (native.checkError && native.checkError !== suppressed.check);
  const visibleError = enabled ? error ?? (nativeError ? "업데이트 확인 또는 다운로드를 완료하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요." : null) : null;
  const busy = enabled && (restarting || !!manual || !!native.isChecking || !!native.isDownloading || !!native.isStartupProcedureRunning || !!native.isRestarting);
  const phase: AppUpdatePhase = !enabled ? "disabled" : ready ? "ready" : native.isDownloading || manual === "downloading" ? "downloading" : busy ? "checking" : visibleError ? "error" : native.isUpdateAvailable || found ? "available" : "idle";
  const progress = phase === "downloading" && native.isDownloading && typeof native.downloadProgress === "number" && Number.isFinite(native.downloadProgress) && native.downloadProgress >= 0 && native.downloadProgress <= 1 ? native.downloadProgress : null;
  return <AppUpdatesContext.Provider value={{ enabled, phase, busy, progress, current, available, downloaded, observedAt: currentKey && metadata.currentKey === currentKey ? metadata.observedAt : null, lastCheckAt: metadata.lastCheckAt, lastDownloadedAt: metadata.lastDownloadedAt, error: visibleError, storageError, appliedNotice: enabled && hydrated && appliedNotice, dismissAppliedNotice, check, download, apply, defer, deferred: ready && deferredKey !== null && deferredKey === (readyKey ?? "pending"), restarting, applyError, applyBlockedReason }}>{children}</AppUpdatesContext.Provider>;
}

export function useAppUpdates(): AppUpdatesValue {
  const value = useContext(AppUpdatesContext);
  if (!value) throw new Error("AppUpdatesProvider is required");
  return value;
}
