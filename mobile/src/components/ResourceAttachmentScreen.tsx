import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, Text, View } from "react-native";
import { AccountFeedback } from "@/components/account-feedback";
import { PdfPreview } from "@/components/pdf-preview";
import { TextAction } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { createResourceFileTransfer, isResourceFileCancellation, loadResourcePreview, resourceFileSize, type ResourceFilePreview, type ResourceFileTransfer } from "@/lib/resource-file-transfer";
import { isResourceFile, isResourceId, resourceError, resourcePrivateFailure } from "@/lib/resources";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useResources } from "@/providers/ResourceProvider";
import type { ResourceFile } from "@/types/resources";
export function ResourceAttachmentScreen({ id }: {
    id: string;
}) {
    const { token } = useSession();
    const key = `${token}:${id}`, scope = useRef(key);
    useLayoutEffect(() => { scope.current = key; }, [key]);
    return token ? <Attachment key={key} id={id} isAccount={() => scope.current === key}/> : null;
}
function Attachment({ id, isAccount }: {
    id: string;
    isAccount(): boolean;
}) {
    const [permission, setPermission] = useState(false);
    const acceptedForeground = useRef<number | null>(null);
    const [acceptedRevision, setAcceptedRevision] = useState<number | null>(null);
    const theme = useTheme(), { token, expireSession } = useSession();
    const { foreground, foregroundRevision, foregroundGeneration, isForeground, authenticatedRequest, isCurrentAccount } = useResources();
    const [handoffState, setHandoffState] = useState(false);
    const [lastForeground, setLastForeground] = useState(`${foreground}:${foregroundRevision}`);
    const [file, setFile] = useState<ResourceFile | null>(null), [preview, setPreview] = useState<ResourceFilePreview | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [progress, setProgress] = useState<number | null>(null);
    if (lastForeground !== `${foreground}:${foregroundRevision}`) {
        setLastForeground(`${foreground}:${foregroundRevision}`);
        setPermission(false);
        setPreview(null);
        setLoading(true);
        if (!handoffState) {
            setBusy(false);
            setReady(false);
        }
    }
    const alive = useRef(true), focused = useRef(false), visible = useRef(foreground), epoch = useRef(0), locked = useRef(false), verified = useRef(false), handoff = useRef(false);
    const handoffPermit = useRef(false);
    const resource = useRef<ResourceFilePreview | null>(null), operation = useRef<ResourceFileTransfer | null>(null), metadata = useRef<ResourceFile | null>(null), controller = useRef<AbortController | null>(null), current = useRef<() => boolean>(() => false);
    useLayoutEffect(() => { visible.current = isForeground(); current.current = () => alive.current && focused.current && isAccount() && isCurrentAccount(); }, [isForeground, isAccount, isCurrentAccount]);
    const invalidate = useCallback(() => { epoch.current++; }, []);
    const releasePreview = useCallback(() => { resource.current?.release(); resource.current = null; setPreview(null); }, []);
    const releaseTransfer = useCallback(() => { operation.current?.cancel(); operation.current?.release(); operation.current = null; setReady(false); }, []);
    const load = useCallback(async () => {
        if (!current.current() || !isForeground() || locked.current || !token)
            return;
        const generation = ++epoch.current, foregroundAtStart = foregroundGeneration(), abort = new AbortController();
        controller.current = abort;
        locked.current = true;
        setLoading(true);
        setError(null);
        releasePreview();
        try {
            if (!isResourceId(id))
                throw new ApiError("첨부 주소를 확인하세요.", 400);
            const value = await authenticatedRequest<{
                attachment: unknown;
            }>(`/resources/attachments/${id}`, { signal: abort.signal });
            if (!current.current() || !isForeground() || epoch.current !== generation || foregroundAtStart !== foregroundGeneration())
                return;
            if (!value || Object.keys(value).length !== 1 || !isResourceFile(value.attachment) || value.attachment.id !== id)
                throw new ApiError("첨부 응답이 일치하지 않습니다.", 200);
            if (metadata.current && JSON.stringify(metadata.current) !== JSON.stringify(value.attachment))
                releaseTransfer();
            metadata.current = value.attachment;
            setFile(value.attachment);
            verified.current = true;
            acceptedForeground.current = foregroundAtStart;
            setAcceptedRevision(foregroundAtStart);
            setPermission(true);
            if (!operation.current)
                operation.current = createResourceFileTransfer({ attachment: value.attachment, token, isCurrent: () => current.current() && (verified.current || handoffPermit.current), onProgress: fraction => { if (current.current())
                        setProgress(fraction); } });
            setReady(operation.current.isReady());
            if (value.attachment.previewKind !== "unsupported") {
                const result = await loadResourcePreview({ attachment: value.attachment, token, signal: abort.signal, isCurrent: () => current.current() && isForeground() && epoch.current === generation && foregroundAtStart === foregroundGeneration() });
                if (!current.current() || !isForeground() || epoch.current !== generation || foregroundAtStart !== foregroundGeneration()) {
                    result.release();
                    return;
                }
                resource.current = result;
                setPreview(result);
            }
        }
        catch (cause) {
            if (!current.current() || !isForeground() || epoch.current !== generation || foregroundAtStart !== foregroundGeneration())
                return;
            if (cause instanceof ApiError && cause.status === 401) {
                await expireSession(token);
                return;
            }
            if (resourcePrivateFailure(cause)) {
                handoffPermit.current = false;
                verified.current = false;
                setPermission(false);
                metadata.current = null;
                setFile(null);
                releaseTransfer();
            }
            setError(resourceError(cause));
        }
        finally {
            if (epoch.current === generation) {
                locked.current = false;
                controller.current = null;
                if (current.current() && visible.current)
                    setLoading(false);
            }
        }
    }, [authenticatedRequest, expireSession, id, releasePreview, releaseTransfer, token, foregroundGeneration, isForeground]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; invalidate(); controller.current?.abort(); resource.current?.release(); operation.current?.cancel(); operation.current?.release(); }; }, [invalidate]);
    useFocusEffect(useCallback(() => { focused.current = true; verified.current = false; setPermission(false); void load(); return () => { focused.current = false; verified.current = false; setPermission(false); invalidate(); controller.current?.abort(); locked.current = false; releasePreview(); releaseTransfer(); setLoading(true); }; }, [invalidate, load, releasePreview, releaseTransfer]));
    useEffect(() => {
        // Numeric transitions survive an Android blur/focus batch even when the final boolean is true.
        invalidate();
        controller.current?.abort();
        verified.current = false;
        resource.current?.release();
        resource.current = null;
        if (!handoff.current) {
            locked.current = false;
            operation.current?.cancel();
            operation.current?.release();
            operation.current = null;
        }
        if (isForeground() && focused.current && !handoff.current)
            void load();
    }, [foreground, foregroundRevision, isForeground, invalidate, load, releasePreview, releaseTransfer]);
    async function transfer(action: "download" | "save" | "share") {
        if (!current.current() || !isForeground() || acceptedForeground.current !== foregroundGeneration() || !verified.current || locked.current || !operation.current)
            return;
        locked.current = true;
        setBusy(true);
        setError(null);
        setNotice(null);
        const op = operation.current;
        let releasedOwnOperation = false;
        try {
            if (action === "download") {
                if (await op.download() && current.current() && operation.current === op) {
                    setReady(op.isReady());
                    setNotice("내려받기가 완료되었습니다. 파일 저장 또는 공유를 선택하세요.");
                }
            }
            else {
                handoffPermit.current = true;
                handoff.current = true;
                setHandoffState(true);
                const message = await (action === "save" ? op.save() : op.share());
                if (message && current.current() && operation.current === op)
                    setNotice(message);
            }
        }
        catch (cause) {
            if (!current.current() || operation.current !== op || isResourceFileCancellation(cause))
                return;
            if (cause instanceof ApiError && cause.status === 401 && token) {
                await expireSession(token);
                return;
            }
            if (resourcePrivateFailure(cause)) {
                handoffPermit.current = false;
                verified.current = false;
                setPermission(false);
                metadata.current = null;
                setFile(null);
                releasePreview();
                releaseTransfer();
                releasedOwnOperation = true;
            }
            setError(resourceError(cause));
        }
        finally {
            // A cancelled download may settle after a fresh foreground operation has started.
            if (operation.current === op || (releasedOwnOperation && operation.current === null)) {
                handoffPermit.current = false;
                handoff.current = false;
                setHandoffState(false);
                if (current.current()) {
                    locked.current = false;
                    setBusy(false);
                    setReady(!releasedOwnOperation && op.isReady());
                    if (visible.current && !verified.current)
                        void load();
                }
            }
        }
    }
    const show = foreground && isForeground() && permission && acceptedRevision === foregroundRevision && isAccount() && isCurrentAccount();
    return <View style={{ flex: 1, backgroundColor: theme.background }}>
    <View style={{ padding: 16, paddingVertical: 8, gap: 4 }}>
      {show && file ? <Text style={{ color: theme.text, fontSize: 15, fontWeight: "700" }}>{file.name} · {resourceFileSize(file.size)}</Text> : null}
      <AccountFeedback error={foreground ? error : null} message={foreground ? notice : null}/>
      {show && file ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}><TextAction label={busy && !handoffState ? `내려받는 중${progress === null ? "" : ` ${Math.round(progress * 100)}%`}` : ready ? "다시 내려받기" : "내려받기"} disabled={loading || busy || ready} onPress={() => void transfer("download")}/><TextAction label="파일 저장" disabled={loading || busy || !ready} onPress={() => void transfer("save")}/>{Platform.OS !== "web" ? <TextAction label="공유" disabled={loading || busy || !ready} onPress={() => void transfer("share")}/> : null}{busy ? <TextAction label="파일 요청 취소" onPress={() => { if (current.current())
        operation.current?.cancel(); }}/> : null}</View> : null}
      {show && file?.previewKind === "unsupported" ? <Text style={{ color: theme.secondary }}>미리보기를 지원하지 않는 파일입니다. 파일을 내려받아 저장하세요.</Text> : null}
      {error ? <TextAction label="첨부 다시 확인" disabled={loading || busy} onPress={() => void load()}/> : null}
    </View>
    {loading ? <ActivityIndicator color={theme.accent} style={{ padding: 16 }}/> : show && preview ? preview.kind === "pdf" ? <PdfPreview uri={preview.uri} token=""/> : <Image source={{ uri: preview.uri }} accessibilityLabel={file?.name ?? "자료 첨부 미리보기"} resizeMode="contain" style={{ flex: 1 }} onError={() => { if (current.current() && isForeground() && acceptedForeground.current === foregroundGeneration() && resource.current === preview) {
        releasePreview();
        setError("이미지를 표시하지 못했습니다. 다시 확인하세요.");
    } }}/> : !show && foreground && error ? <Text style={{ color: theme.secondary, padding: 16 }}>첨부를 확인하지 못했습니다. 다시 확인하세요.</Text> : null}
  </View>;
}
