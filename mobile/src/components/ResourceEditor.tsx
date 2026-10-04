import { KeyboardScrollView } from "@/components/keyboard-scroll-view";
import { KeyboardScreen } from "@/components/keyboard-screen";
import { router, useFocusEffect } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountFeedback } from "@/components/account-feedback";
import { ResourceField } from "@/components/ResourceContent";
import { PrimaryButton, TextAction } from "@/components/ui";
import { useConfirmAction } from "@/components/use-confirm-action";
import { ApiError } from "@/lib/api";
import { createResourceUpload, discardResourceFile, isResourceFileCancellation, pickResourceFile, resourceFileSize, type ResourceUploadOperation, type SelectedResourceFile } from "@/lib/resource-file-transfer";
import { isResourceEditor, isResourceId, isResourceMutation, isResourceOptions, newResourceRequestId, resourceCategories, resourceError, resourceFieldErrors, resourceLevels, resourcePrivateFailure, resourceUnknown } from "@/lib/resources";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useResources } from "@/providers/ResourceProvider";
import type { AttachmentPolicy, MobileResource, ResourceCategory, ResourceCreateInput, ResourceEducationLevel, ResourceMutationResult, ResourceUpdateInput } from "@/types/resources";
type Values = {
    title: string;
    summary: string;
    category: ResourceCategory;
    educationLevel: ResourceEducationLevel | null;
};
type FileEntry = {
    key: string;
    file: SelectedResourceFile;
    operation: ResourceUploadOperation;
    error: string | null;
    progress: number | null;
};
type Attempt = {
    input: ResourceCreateInput | ResourceUpdateInput;
    uncertain: boolean;
};
const initial: Values = { title: "", summary: "", category: "bajaul", educationLevel: null };
const valuesOf = (resource: MobileResource): Values => ({ title: resource.title, summary: resource.summary, category: resource.category, educationLevel: resource.educationLevel });
export function ResourceEditor({ id }: {
    id?: string;
}) {
    const { token } = useSession();
    const key = `${token}:${id ?? "new"}`, scope = useRef(key);
    useLayoutEffect(() => { scope.current = key; }, [key]);
    return token ? <Editor key={key} id={id} isAccount={() => scope.current === key}/> : null;
}
function Editor({ id, isAccount }: {
    id?: string;
    isAccount(): boolean;
}) {
    const [permission, setPermission] = useState(false);
    const acceptedForeground = useRef<number | null>(null);
    const [acceptedRevision, setAcceptedRevision] = useState<number | null>(null);
    const { token, user, expireSession } = useSession();
    const { foreground, foregroundRevision, foregroundGeneration, isForeground, authenticatedRequest, isCurrentAccount } = useResources();
    const theme = useTheme(), insets = useSafeAreaInsets(), confirmation = useConfirmAction(), navigation = useNavigation();
    const [values, setValues] = useState<Values>(initial), [baseline, setBaseline] = useState<MobileResource | null>(null), [policy, setPolicy] = useState<AttachmentPolicy | null>(null);
    const [removed, setRemoved] = useState<string[]>([]), [files, setFiles] = useState<FileEntry[]>([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [fileBusy, setFileBusy] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({}), [error, setError] = useState<string | null>(null), [loadError, setLoadError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
    const [recovery, setRecoveryState] = useState<"check" | "conflict" | null>(null), [candidate, setCandidate] = useState<MobileResource | null>(null), [completed, setCompleted] = useState<ResourceMutationResult | null>(null), [revision, setRevision] = useState(0);
    const alive = useRef(true), focused = useRef(false), generation = useRef(0), locked = useRef(false), verified = useRef(false), fileLocked = useRef(false);
    const fileAccess = useRef(false);
    const finished = useRef(false), receiptOnly = useRef<string | null>(null);
    const valuesRef = useRef(values), baselineRef = useRef(baseline), filesRef = useRef(files), removedRef = useRef(removed), recoveryRef = useRef(recovery), attempt = useRef<Attempt | null>(null), controller = useRef<AbortController | null>(null);
    const queryCurrent = useRef<() => boolean>(() => false);
    const active = useRef<() => boolean>(() => false), account = useRef<() => boolean>(() => false), fileCurrent = useRef<() => boolean>(() => false);
    useLayoutEffect(() => {
        account.current = () => alive.current && isAccount() && isCurrentAccount();
        queryCurrent.current = () => account.current() && focused.current && isForeground();
        active.current = () => queryCurrent.current() && acceptedForeground.current === foregroundGeneration();
        // A system picker/share sheet may temporarily change AppState. Only account
        // and Stack scope govern those operations; private form rendering still masks.
        fileCurrent.current = () => account.current() && focused.current && fileAccess.current;
    }, [isForeground, isAccount, isCurrentAccount, foregroundGeneration]);
    const invalidate = useCallback(() => { generation.current++; }, []);
    const updateValues = (next: Values) => { valuesRef.current = next; setValues(next); };
    const updateFiles = (next: FileEntry[]) => { filesRef.current = next; setFiles(next); };
    const updateRemoved = (next: string[]) => { removedRef.current = next; setRemoved(next); };
    const setRecovery = (next: "check" | "conflict" | null) => { recoveryRef.current = next; setRecoveryState(next); };
    const discardLocalFiles = useCallback(() => {
        for (const entry of filesRef.current) {
            entry.operation.cancel();
            try {
                if (token && account.current())
                    discardResourceFile(entry.file, { token, isCurrent: () => account.current() });
                else
                    entry.file.release();
            }
            catch {
                entry.file.release();
            }
        }
        filesRef.current = [];
        setFiles([]);
    }, [token]);
    function privacyClear() {
        if (attempt.current?.uncertain)
            receiptOnly.current = attempt.current.input.requestId;
        fileAccess.current = false;
        verified.current = false;
        setPermission(false);
        baselineRef.current = null;
        setBaseline(null);
        updateValues(initial);
        updateRemoved([]);
        discardLocalFiles();
        setCandidate(null);
        attempt.current = null;
        setRecovery(receiptOnly.current ? "check" : null);
    }
    function success(result: ResourceMutationResult) {
        finished.current = true;
        receiptOnly.current = null;
        attempt.current = null;
        setRecovery(null);
        setCandidate(null);
        setCompleted(result);
        setErrors({});
        setError(null);
        setNotice(result.outcome === "deleted" ? "원래 저장 요청은 처리됐으며 해당 자료는 이후 삭제되었습니다. 같은 요청으로 새 자료를 만들지 않습니다." : result.message);
        discardLocalFiles();
    }
    const load = useCallback(async () => {
        if (!queryCurrent.current() || locked.current)
            return;
        if (id !== undefined && !isResourceId(id)) {
            setLoading(false);
            setLoadError("자료 주소를 확인하세요. 다른 자료로 자동 변경하지 않습니다.");
            return;
        }
        const epoch = ++generation.current, foregroundAtStart = foregroundGeneration(), abort = new AbortController();
        controller.current = abort;
        locked.current = true;
        setLoading(true);
        setLoadError(null);
        try {
            const pending = attempt.current;
            const originalKey = pending?.input.requestId ?? receiptOnly.current;
            if (originalKey && recoveryRef.current === "check") {
                try {
                    const receipt = await authenticatedRequest<unknown>(`/resources/mutations/${originalKey}`, { signal: abort.signal });
                    if (!queryCurrent.current() || epoch !== generation.current || foregroundAtStart !== foregroundGeneration())
                        return;
                    if (!isResourceMutation(receipt, { operation: id ? "update" : "create", resourceId: id }))
                        throw new ApiError("원래 저장 요청의 결과를 확인하지 못했습니다.", 200);
                    finished.current = true;
                    receiptOnly.current = null;
                    discardLocalFiles();
                    attempt.current = null;
                    recoveryRef.current = null;
                    setRecoveryState(null);
                    setCompleted(receipt);
                    setErrors({});
                    setError(null);
                    setNotice(receipt.outcome === "deleted" ? "원래 저장은 처리됐으며 해당 자료는 이후 삭제되었습니다." : receipt.message);
                    fileAccess.current = true;
                    verified.current = true;
                    acceptedForeground.current = foregroundAtStart;
            setAcceptedRevision(foregroundAtStart);
                    setPermission(true);
                    return;
                }
                catch (cause) {
                    if (!queryCurrent.current() || epoch !== generation.current || foregroundAtStart !== foregroundGeneration())
                        return;
                    if (resourcePrivateFailure(cause) && !(cause instanceof ApiError && cause.status === 404))
                        throw cause;
                    setError(`${resourceError(cause)} 원래 요청 키와 입력을 유지합니다.`);
                }
            }
            const value = await authenticatedRequest<unknown>(id ? `/resources/${id}/editor` : "/resources/options", { signal: abort.signal });
            if (!queryCurrent.current() || epoch !== generation.current || foregroundAtStart !== foregroundGeneration())
                return;
            if (id) {
                if (!isResourceEditor(value, id))
                    throw new ApiError("자료 수정 응답이 일치하지 않습니다.", 200);
                setPolicy(value.attachmentPolicy);
                if (!baselineRef.current) {
                    baselineRef.current = value.resource;
                    setBaseline(value.resource);
                    valuesRef.current = valuesOf(value.resource);
                    setValues(valuesRef.current);
                }
                else if (value.resource.updatedAt !== baselineRef.current.updatedAt || recoveryRef.current === "conflict") {
                    setCandidate(value.resource);
                    // An ambiguous original attempt stays immutable. A pure GET alone
                    // never proves it failed and cannot create a replacement request key.
                    if (!attempt.current?.uncertain) {
                        recoveryRef.current = "conflict";
                        setRecoveryState("conflict");
                    }
                }
            }
            else {
                if (!isResourceOptions(value))
                    throw new ApiError("자료 등록 설정을 확인하지 못했습니다.", 200);
                setPolicy(value.attachmentPolicy);
            }
            fileAccess.current = true;
            verified.current = true;
            acceptedForeground.current = foregroundAtStart;
            setAcceptedRevision(foregroundAtStart);
                    setPermission(true);
        }
        catch (cause) {
            if (!queryCurrent.current() || epoch !== generation.current || foregroundAtStart !== foregroundGeneration())
                return;
            if (resourcePrivateFailure(cause)) {
                fileAccess.current = false;
                verified.current = false;
                setPermission(false);
                baselineRef.current = null;
                setBaseline(null);
                valuesRef.current = initial;
                setValues(initial);
                removedRef.current = [];
                setRemoved([]);
                discardLocalFiles();
                setCandidate(null);
                // Receipt proof of an unknown create is retained without private fields;
                // edit permission loss purges its private original input immediately.
                if (id) {
                    if (attempt.current?.uncertain)
                        receiptOnly.current = attempt.current.input.requestId;
                    attempt.current = null;
                    recoveryRef.current = receiptOnly.current ? "check" : null;
                    setRecoveryState(recoveryRef.current);
                }
            }
            setLoadError(resourceError(cause));
        }
        finally {
            if (epoch === generation.current) {
                locked.current = false;
                controller.current = null;
                if (queryCurrent.current())
                    setLoading(false);
            }
        }
    }, [authenticatedRequest, discardLocalFiles, id, foregroundGeneration]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; invalidate(); controller.current?.abort(); for (const entry of filesRef.current) {
        entry.operation.cancel();
        entry.file.release();
    } }; }, [invalidate]);
    useFocusEffect(useCallback(() => {
        void foregroundRevision;
        focused.current = true;
        verified.current = false;
        setPermission(false);
        if (foreground)
            void load();
        return () => { focused.current = false; verified.current = false; setPermission(false); invalidate(); controller.current?.abort(); locked.current = false; setBusy(false); setLoading(true); if (attempt.current) {
            attempt.current.uncertain = true;
            recoveryRef.current = "check";
            setRecoveryState("check");
        } };
    }, [foreground, foregroundRevision, invalidate, load]));
    const dirty = !completed && (JSON.stringify(values) !== JSON.stringify(baseline ? valuesOf(baseline) : initial) || !!files.length || !!removed.length || !!recovery);
    usePreventRemove(!!user && (dirty || busy || fileBusy), ({ data }) => {
        if (!active.current() || locked.current || fileLocked.current)
            return;
        const epoch = generation.current;
        void confirmation.ask({ title: "자료 작성 화면 나가기", message: "저장하지 않은 입력과 선택한 첨부를 버립니다. 저장 결과가 불명확하면 먼저 원래 요청 결과를 확인하세요. 나가시겠습니까?", confirm: "작성 내용 버리기", danger: true }).then(accepted => {
            if (accepted && active.current() && epoch === generation.current) {
                discardLocalFiles();
                navigation.dispatch(data.action);
            }
        });
    });
    useEffect(() => {
        if (Platform.OS !== "web" || !dirty)
            return;
        const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", prevent);
        return () => window.removeEventListener("beforeunload", prevent);
    }, [dirty]);
    function change(name: keyof Values, value: Values[keyof Values]) {
        if (!active.current() || locked.current || !verified.current || recoveryRef.current || finished.current)
            return;
        updateValues({ ...valuesRef.current, [name]: value });
        setErrors(previous => ({ ...previous, [name]: "" }));
        setError(null);
        setNotice(null);
    }
    async function pick() {
        if (!active.current() || locked.current || fileLocked.current || !verified.current || !policy || !token || recoveryRef.current || finished.current)
            return;
        const retained = (baselineRef.current?.attachments.length ?? 0) - removedRef.current.length;
        if (retained + filesRef.current.length >= policy.maxFileCount) {
            setErrors(previous => ({ ...previous, attachments: `첨부는 최대 ${policy.maxFileCount}개입니다.` }));
            setError("첨부 개수를 확인하세요.");
            return;
        }
        fileLocked.current = true;
        setFileBusy(true);
        let file: SelectedResourceFile | null = null;
        try {
            file = await pickResourceFile({ policy, token, isCurrent: () => fileCurrent.current() });
            if (!file)
                return;
            if (!fileCurrent.current())
                return;
            const key = newResourceRequestId();
            const operation = createResourceUpload({ file, token, targetResourceId: id ?? null, requestId: key, isCurrent: () => fileCurrent.current(), onProgress: fraction => { if (fileCurrent.current()) {
                    const next = filesRef.current.map(entry => entry.key === key ? { ...entry, progress: fraction } : entry);
                    updateFiles(next);
                } } });
            updateFiles([...filesRef.current, { file, key, operation, progress: null, error: null }]);
            file = null;
            setErrors(previous => ({ ...previous, attachments: "" }));
        }
        catch (cause) {
            if (!fileCurrent.current() || isResourceFileCancellation(cause))
                return;
            if (cause instanceof ApiError && cause.status === 401 && token)
                await expireSession(token);
            setError(resourceError(cause));
        }
        finally {
            file?.release();
            fileLocked.current = false;
            if (account.current())
                setFileBusy(false);
        }
    }
    async function prepareFile(entry: FileEntry, refresh = false) {
        if (!active.current() || locked.current || fileLocked.current || !verified.current || recoveryRef.current || finished.current)
            return;
        fileLocked.current = true;
        setFileBusy(true);
        try {
            await (refresh ? entry.operation.refresh() : entry.operation.prepare());
            if (fileCurrent.current())
                updateFiles(filesRef.current.map(item => item.key === entry.key ? { ...item, error: null } : item));
        }
        catch (cause) {
            if (fileCurrent.current() && !isResourceFileCancellation(cause)) {
                updateFiles(filesRef.current.map(item => item.key === entry.key ? { ...item, error: resourceError(cause) } : item));
                if (cause instanceof ApiError && cause.status === 401 && token)
                    await expireSession(token);
            }
        }
        finally {
            fileLocked.current = false;
            if (account.current()) {
                setFileBusy(false);
                setRevision(value => value + 1);
            }
        }
    }
    async function removeFile(entry: FileEntry) {
        if (!active.current() || locked.current || fileLocked.current || !token || recoveryRef.current || finished.current)
            return;
        const epoch = generation.current;
        if (!await confirmation.ask({ title: "선택한 첨부 제거", message: "이 첨부를 현재 작성에서 제거합니다. 원본 파일은 유지됩니다.", confirm: "첨부 제거" }))
            return;
        if (!active.current() || epoch !== generation.current || fileLocked.current)
            return;
        try {
            discardResourceFile(entry.file, { token, isCurrent: () => fileCurrent.current() });
            updateFiles(filesRef.current.filter(item => item.key !== entry.key));
        }
        catch (cause) {
            setError(resourceError(cause));
        }
    }
    async function save(retry = false) {
        if (!active.current() || locked.current || fileLocked.current || !verified.current || !policy || finished.current || recoveryRef.current === "conflict")
            return;
        if (receiptOnly.current || recoveryRef.current === "check" && !retry)
            return;
        if (!retry) {
            const fields = resourceFieldErrors(valuesRef.current);
            const retained = (baselineRef.current?.attachments.length ?? 0) - removedRef.current.length;
            if (retained + filesRef.current.length > policy.maxFileCount)
                fields.attachments = `첨부는 최대 ${policy.maxFileCount}개입니다.`;
            if (filesRef.current.some(entry => !entry.operation.readyUploadId()))
                fields.attachments = "선택한 모든 첨부의 업로드 준비를 완료하세요.";
            setErrors(fields);
            if (Object.keys(fields).length) {
                setError("입력과 첨부를 확인하세요. 작성 내용은 유지됩니다.");
                return;
            }
        }
        const input = attempt.current?.input ?? { requestId: newResourceRequestId(), title: valuesRef.current.title.trim(), summary: valuesRef.current.summary.trim(), category: valuesRef.current.category, educationLevel: valuesRef.current.category === "education" ? valuesRef.current.educationLevel : null, uploadIds: filesRef.current.map(entry => entry.operation.readyUploadId()!).sort(), ...(id && baselineRef.current ? { expectedUpdatedAt: baselineRef.current.updatedAt, removeAttachmentIds: [...removedRef.current].sort() } : {}) };
        if (!attempt.current)
            attempt.current = { input, uncertain: false };
        const epoch = generation.current, abort = new AbortController();
        controller.current = abort;
        locked.current = true;
        setBusy(true);
        setError(null);
        try {
            const result = await authenticatedRequest<unknown>(id ? `/resources/${id}` : "/resources", { method: id ? "PUT" : "POST", body: input, signal: abort.signal });
            if (!active.current() || epoch !== generation.current)
                return;
            if (!isResourceMutation(result, { operation: id ? "update" : "create", resourceId: id }))
                throw new ApiError("저장 결과를 확인하지 못했습니다. 같은 요청의 결과를 확인하세요.", id ? 200 : 201);
            success(result);
        }
        catch (cause) {
            if (!active.current() || epoch !== generation.current)
                return;
            const originalUnknown = !!attempt.current?.uncertain;
            if (cause instanceof ApiError && cause.status === 409 && cause.code === "RESOURCE_CONFLICT" && !originalUnknown)
                setRecovery("conflict");
            else if (resourceUnknown(cause) || originalUnknown) {
                if (attempt.current)
                    attempt.current.uncertain = true;
                setRecovery("check");
            }
            else {
                attempt.current = null;
                setRecovery(null);
            }
            if (cause instanceof ApiError)
                setErrors(cause.fields ?? {});
            if (resourcePrivateFailure(cause))
                privacyClear();
            setError(resourceError(cause));
        }
        finally {
            if (epoch === generation.current) {
                locked.current = false;
                controller.current = null;
                if (active.current())
                    setBusy(false);
            }
        }
    }
    async function chooseServer(keepInput: boolean) {
        if (!active.current() || locked.current || !verified.current || !candidate || recoveryRef.current !== "conflict" || attempt.current?.uncertain)
            return;
        const epoch = generation.current;
        if (!keepInput && !await confirmation.ask({ title: "최신 자료 내용으로 교체", message: "현재 입력과 선택한 첨부를 버리고 최신 자료 내용으로 바꿉니다. 바꾸시겠습니까?", confirm: "입력 교체", danger: true }))
            return;
        if (!active.current() || epoch !== generation.current)
            return;
        if (!keepInput) {
            updateValues(valuesOf(candidate));
            updateRemoved([]);
            discardLocalFiles();
        }
        else
            updateRemoved(removedRef.current.filter(fileId => candidate.attachments.some(file => file.id === fileId)));
        baselineRef.current = candidate;
        setBaseline(candidate);
        setCandidate(null);
        attempt.current = null;
        setRecovery(null);
        setErrors({});
        setError(null);
        setNotice(keepInput ? "입력을 유지하고 최신 자료를 수정 기준으로 선택했습니다. 내용을 확인한 뒤 명시적으로 저장하세요." : "최신 자료 내용으로 바꿨습니다.");
    }
    const visible = foreground && isForeground() && permission && acceptedRevision === foregroundRevision && isAccount() && isCurrentAccount();
    const disabled = loading || busy || fileBusy || !!recovery || !!completed;
    void revision;
    return <KeyboardScreen style={{ flex: 1, backgroundColor: theme.background }}>
    <KeyboardScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 960, width: "100%", alignSelf: "center", paddingBottom: 24 }}>
      <AccountFeedback error={loadError ?? error} message={notice}/>
      {!visible && recovery === "check" ? <TextAction label="원래 저장 결과 확인" disabled={loading || busy} onPress={() => void load()}/> : null}
      {loadError ? <TextAction label="작성 권한·자료 다시 확인" disabled={loading || busy} onPress={() => void load()}/> : null}
      {visible && completed ? <View style={{ gap: 8 }}><Text style={{ color: theme.text }}>{completed.outcome === "deleted" ? "해당 자료가 삭제되었습니다." : "자료 저장이 완료되었습니다."}</Text>{completed.resource ? <TextAction label="저장한 자료 보기" onPress={() => { if (active.current() && !locked.current)
            router.replace(`/resources/${completed.resourceId}`); }}/> : null}<TextAction label="자료 목록" onPress={() => { if (active.current())
            router.replace("/resources"); }}/></View> : visible ? <>
        {recovery === "check" ? <View style={{ gap: 4 }}><Text style={{ color: theme.secondary }}>저장 결과가 불명확합니다. 원래 입력·첨부·요청 키를 유지합니다.</Text><TextAction label="원래 저장 결과 확인" disabled={loading || busy} onPress={() => void load()}/><TextAction label="같은 저장 요청 재시도" disabled={loading || busy || fileBusy} onPress={() => void save(true)}/></View> : null}
        {recovery === "conflict" ? <View style={{ gap: 6 }}><Text style={{ color: theme.danger }}>다른 수정이 있습니다. 최신 자료를 확인한 뒤 계속 작성할 내용을 선택하세요.</Text><TextAction label="최신 자료 조회" disabled={loading || busy} onPress={() => void load()}/>{candidate ? <><Text style={{ color: theme.text, fontWeight: "700" }}>최신 제목: {candidate.title}</Text><Text style={{ color: theme.secondary }}>{candidate.summary}</Text><TextAction label="내 입력 유지·최신 수정 기준 선택" onPress={() => void chooseServer(true)}/><TextAction label="최신 내용으로 입력 교체" onPress={() => void chooseServer(false)}/></> : null}</View> : null}
        <ResourceField label="제목" hint="2~120자" value={values.title} maxLength={120} disabled={disabled} error={errors.title} onChange={value => change("title", value)}/>
        <ResourceField label="내용" hint="5~1,000자" value={values.summary} maxLength={1000} multiline disabled={disabled} error={errors.summary} onChange={value => change("summary", value)}/>
        <View><Text style={{ color: theme.text, fontWeight: "700" }}>분류</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>{resourceCategories.map(item => <TextAction key={item.value} label={item.label} accessibilityState={{ selected: values.category === item.value }} disabled={disabled} onPress={() => { if (!active.current() || locked.current || recoveryRef.current)
            return; updateValues({ ...valuesRef.current, category: item.value, educationLevel: item.value === "education" ? valuesRef.current.educationLevel : null }); }}/>)}</View></View>
        {values.category === "education" ? <View><Text style={{ color: theme.text, fontWeight: "700" }}>교육 대상</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>{resourceLevels.filter(item => item.value !== "all").map(item => <TextAction key={item.value} label={item.label} accessibilityState={{ selected: values.educationLevel === item.value }} disabled={disabled} onPress={() => change("educationLevel", item.value as ResourceEducationLevel)}/>)}</View>{errors.educationLevel ? <Text style={{ color: theme.danger }}>{errors.educationLevel}</Text> : null}</View> : null}
        <Text accessibilityRole="header" aria-level={2} style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>첨부</Text>
        <Text style={{ color: theme.secondary, fontSize: 12 }}>{policy ? `최대 ${policy.maxFileCount}개 · 파일당 ${policy.maxFileSizeMb}MB · ${policy.allowedExtensions.join(", ")}` : "첨부 정책 확인 중"}</Text>
        {baseline?.attachments.map(file => <View key={file.id} style={{ borderBottomWidth: 1, borderColor: theme.border, paddingVertical: 6 }}><Text style={{ color: theme.text, fontSize: 14 }}>{file.name} · {resourceFileSize(file.size)}{removed.includes(file.id) ? " · 제거 예정" : ""}</Text><TextAction label={removed.includes(file.id) ? "제거 취소" : "기존 첨부 제거"} disabled={disabled} onPress={() => { if (!active.current() || locked.current || recoveryRef.current || finished.current)
            return; updateRemoved(removedRef.current.includes(file.id) ? removedRef.current.filter(value => value !== file.id) : [...removedRef.current, file.id]); }}/></View>)}
        {files.map(entry => <View key={entry.key} style={{ borderBottomWidth: 1, borderColor: theme.border, paddingVertical: 6, gap: 4 }}><Text style={{ color: theme.text }}>{entry.file.name} · {resourceFileSize(entry.file.size)}</Text><Text style={{ color: theme.secondary, fontSize: 12 }}>{entry.operation.getState().phase === "ready" ? "업로드 준비 완료" : entry.operation.getState().phase === "hashing" ? "파일 검증 중" : entry.operation.getState().busy ? `파일 전송 중${entry.progress === null ? "" : ` ${Math.round(entry.progress * 100)}%`}` : "업로드 준비·결과 확인 필요"}</Text><AccountFeedback error={entry.error}/><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}><TextAction label="업로드 준비" disabled={disabled || !!entry.operation.readyUploadId()} onPress={() => void prepareFile(entry)}/><TextAction label="업로드 결과 확인" disabled={disabled} onPress={() => void prepareFile(entry, true)}/><TextAction label="첨부 제거" disabled={disabled} onPress={() => void removeFile(entry)}/></View></View>)}
        {errors.attachments ? <Text style={{ color: theme.danger }}>{errors.attachments}</Text> : null}
        <TextAction label="첨부 선택" icon="attach" disabled={disabled || !policy} onPress={() => void pick()}/>
        {fileBusy ? <TextAction label="파일 작업 취소" onPress={() => { if (fileCurrent.current())
            for (const entry of filesRef.current)
                entry.operation.cancel(); }}/> : null}
      </> : loading ? <ActivityIndicator color={theme.accent}/> : null}
      {confirmation.dialog}
    </KeyboardScrollView>
    {visible && !completed ? <View style={{ backgroundColor: theme.surface, borderTopWidth: 1, borderColor: theme.border, padding: 12, paddingBottom: Math.max(12, insets.bottom), width: "100%" }}><View style={{ maxWidth: 960, width: "100%", alignSelf: "center" }}><PrimaryButton title={busy ? "저장 중" : recovery ? "저장 결과 확인 필요" : "자료 저장"} disabled={disabled} onPress={() => void save()}/></View></View> : null}
  </KeyboardScreen>;
}
