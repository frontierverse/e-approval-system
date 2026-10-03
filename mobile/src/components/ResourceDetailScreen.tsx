import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { AccountFeedback } from "@/components/account-feedback";
import { ResourceRow } from "@/components/ResourceContent";
import { TextAction } from "@/components/ui";
import { useConfirmAction } from "@/components/use-confirm-action";
import { ApiError } from "@/lib/api";
import { resourceFileSize } from "@/lib/resource-file-transfer";
import { formatResourceTimestamp, isResourceDetail, isResourceId, isResourceMutation, isResourceVisit, newResourceRequestId, resourceCategoryLabel, resourceError, resourceLevelLabel, resourcePrivateFailure, resourceUnknown } from "@/lib/resources";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useResources } from "@/providers/ResourceProvider";
import type { MobileResource, ResourceDeleteInput } from "@/types/resources";
export function ResourceDetailScreen({ id }: {
    id: string;
}) {
    const { token } = useSession();
    const key = `${token}:${id}`, scope = useRef(key);
    useLayoutEffect(() => { scope.current = key; }, [key]);
    return token ? <ResourceDetailContent key={key} id={id} isAccount={() => scope.current === key}/> : null;
}
function ResourceDetailContent({ id, isAccount }: {
    id: string;
    isAccount(): boolean;
}) {
    const [permission, setPermission] = useState(false);
    const theme = useTheme(), confirmation = useConfirmAction();
    const { authenticatedRequest, foreground, isCurrentAccount } = useResources();
    const [resource, setResource] = useState<MobileResource | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null), [visitError, setVisitError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [pending, setPending] = useState(false);
    const alive = useRef(true), focused = useRef(false), generation = useRef(0), locked = useRef(false), verified = useRef(false), data = useRef(resource);
    const uncertainDelete = useRef(false);
    const attempt = useRef<ResourceDeleteInput | null>(null), visit = useRef({ requestId: newResourceRequestId(), started: false, completed: false, inFlight: false }), controller = useRef<AbortController | null>(null);
    const active = useRef<() => boolean>(() => false);
    useLayoutEffect(() => { active.current = () => alive.current && focused.current && foreground && isAccount() && isCurrentAccount(); }, [foreground, isAccount, isCurrentAccount]);
    function update(value: MobileResource | null) { data.current = value; setResource(value); }
    const invalidate = useCallback(() => { generation.current++; }, []);
    const recordVisit = useCallback(async () => {
        if (!active.current() || !verified.current || visit.current.completed || visit.current.inFlight)
            return;
        const epoch = generation.current;
        visit.current.started = true;
        visit.current.inFlight = true;
        try {
            const value = await authenticatedRequest<unknown>(`/resources/${id}/views`, { method: "POST", body: { requestId: visit.current.requestId } });
            if (!active.current() || generation.current !== epoch)
                return;
            if (!isResourceVisit(value, id))
                throw new ApiError("열람 기록 결과를 확인하지 못했습니다. 같은 방문으로 다시 확인하세요.", 200);
            visit.current.completed = true;
            setVisitError(null);
            if (data.current) {
                const next = { ...data.current, uniqueViewerCount: value.uniqueViewerCount };
                data.current = next;
                setResource(next);
            }
        }
        catch (cause) {
            if (!active.current() || generation.current !== epoch)
                return;
            setVisitError(resourceError(cause));
            if (resourcePrivateFailure(cause)) {
                verified.current = false;
                setPermission(false);
                data.current = null;
                setResource(null);
            }
        }
        finally {
            visit.current.inFlight = false;
        }
    }, [authenticatedRequest, id]);
    const load = useCallback(async () => {
        if (!active.current() || locked.current)
            return;
        if (!isResourceId(id)) {
            setLoading(false);
            setError("자료 주소를 확인하세요.");
            return;
        }
        const epoch = ++generation.current, abort = new AbortController();
        controller.current = abort;
        locked.current = true;
        setLoading(true);
        setError(null);
        try {
            const value = await authenticatedRequest<unknown>(`/resources/${id}`, { signal: abort.signal });
            if (!active.current() || generation.current !== epoch)
                return;
            if (!isResourceDetail(value, id))
                throw new ApiError("자료 응답이 일치하지 않습니다. 다시 불러오세요.", 200);
            data.current = value.resource;
            setResource(value.resource);
            verified.current = true;
            setPermission(true);
            if (!visit.current.started)
                void recordVisit();
        }
        catch (cause) {
            if (!active.current() || generation.current !== epoch)
                return;
            if (resourcePrivateFailure(cause)) {
                data.current = null;
                setResource(null);
                verified.current = false;
                setPermission(false);
            }
            setError(resourceError(cause));
        }
        finally {
            if (generation.current === epoch) {
                locked.current = false;
                controller.current = null;
                if (active.current())
                    setLoading(false);
            }
        }
    }, [authenticatedRequest, id, recordVisit]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; invalidate(); controller.current?.abort(); }; }, [invalidate]);
    useFocusEffect(useCallback(() => {
        focused.current = true;
        if (visit.current.started && !visit.current.completed)
            setVisitError("이전 열람 기록 결과를 같은 방문으로 다시 확인하세요.");
        verified.current = false;
        setPermission(false);
        if (foreground)
            void load();
        return () => { focused.current = false; verified.current = false; setPermission(false); invalidate(); locked.current = false; controller.current?.abort(); setLoading(true); setBusy(false); if (attempt.current)
            setPending(true); };
    }, [foreground, invalidate, load]));
    const valid = () => active.current() && !locked.current;
    async function deleteResource(retry = false) {
        if (!valid() || !verified.current || !data.current?.canManage)
            return;
        if (pending && !retry)
            return;
        const epoch = generation.current, priorUncertain = uncertainDelete.current;
        locked.current = true;
        try {
            if (!retry && !await confirmation.ask({ title: "자료 삭제", message: `‘${data.current.title}’ 자료와 첨부·열람 기록을 삭제합니다. 앱에서 복구할 수 없습니다. 삭제하시겠습니까?`, confirm: "자료 삭제", danger: true }))
                return;
            if (!active.current() || generation.current !== epoch || !data.current?.canManage)
                return;
            const input = attempt.current ?? { requestId: newResourceRequestId(), expectedUpdatedAt: data.current.updatedAt };
            attempt.current = input;
            setBusy(true);
            setError(null);
            uncertainDelete.current = true;
            const value = await authenticatedRequest<unknown>(`/resources/${id}`, { method: "DELETE", body: input });
            if (!active.current() || generation.current !== epoch)
                return;
            if (!isResourceMutation(value, { operation: "delete", resourceId: id }))
                throw new ApiError("삭제 결과를 확인하지 못했습니다. 원래 요청의 결과를 확인하세요.", 200);
            update(null);
            verified.current = false;
            setPermission(false);
            attempt.current = null;
            uncertainDelete.current = false;
            setPending(false);
            setNotice(value.message);
        }
        catch (cause) {
            if (!active.current() || generation.current !== epoch)
                return;
            if (!priorUncertain && cause instanceof ApiError && cause.status === 409 && cause.code === "RESOURCE_CONFLICT") {
                attempt.current = null;
                uncertainDelete.current = false;
                setPending(false);
                verified.current = false;
                setPermission(false);
            }
            else if (priorUncertain || resourceUnknown(cause))
                setPending(true);
            else {
                attempt.current = null;
                uncertainDelete.current = false;
                setPending(false);
            }
            if (resourcePrivateFailure(cause)) {
                update(null);
                verified.current = false;
                setPermission(false);
            }
            setError(resourceError(cause));
        }
        finally {
            if (generation.current === epoch) {
                locked.current = false;
                if (active.current())
                    setBusy(false);
            }
        }
    }
    async function checkDelete() {
        if (!valid() || !attempt.current)
            return;
        const epoch = generation.current;
        locked.current = true;
        setBusy(true);
        setError(null);
        try {
            const value = await authenticatedRequest<unknown>(`/resources/mutations/${attempt.current.requestId}`);
            if (!active.current() || generation.current !== epoch)
                return;
            if (!isResourceMutation(value, { operation: "delete", resourceId: id }))
                throw new ApiError("삭제 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.", 200);
            update(null);
            verified.current = false;
            setPermission(false);
            attempt.current = null;
            uncertainDelete.current = false;
            setPending(false);
            setNotice(value.message);
        }
        catch (cause) {
            if (!active.current() || generation.current !== epoch)
                return;
            // A receipt 404 does not prove an earlier deletion was never committed.
            setError(`${resourceError(cause)} 원래 삭제 요청을 유지하고 있습니다.`);
            if (cause instanceof ApiError && cause.status === 403) {
                update(null);
                verified.current = false;
                setPermission(false);
            }
        }
        finally {
            if (generation.current === epoch) {
                locked.current = false;
                if (active.current())
                    setBusy(false);
            }
        }
    }
    function navigate(path: string) { if (valid() && verified.current && !pending)
        router.push(path as never); }
    const visible = foreground && permission && isAccount() && isCurrentAccount();
    return <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, maxWidth: 960, width: "100%", alignSelf: "center", gap: 8, paddingBottom: 24 }}>
    <AccountFeedback error={error ?? (!visible && !notice ? visitError : null)} message={notice}/>
    {pending ? <View style={{ gap: 4 }}><Text style={{ color: theme.secondary }}>삭제 결과 확인이 필요합니다. 원래 요청만 다시 확인합니다.</Text><TextAction label="삭제 결과 확인" disabled={busy || loading} onPress={() => void checkDelete()}/>{visible && resource?.canManage ? <TextAction label="같은 삭제 요청 재시도" disabled={busy || loading} onPress={() => void deleteResource(true)}/> : null}</View> : null}
    {visible && resource ? <>
      {loading || error ? <Text style={{ color: theme.secondary }}>{loading ? "이전 조회 내용을 표시합니다. 최신 자료를 확인하고 있습니다." : "이전 조회 내용을 표시합니다. 최신 자료를 다시 확인하세요."}</Text> : null}
      <Text accessibilityRole="header" aria-level={2} style={{ color: theme.text, fontSize: 20, fontWeight: "800", lineHeight: 28 }}>{resource.title}</Text>
      <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 20 }}>{resourceCategoryLabel(resource.category)}{resource.educationLevel ? ` · ${resourceLevelLabel(resource.educationLevel)}` : ""} · {resource.author.name}{"\n"}등록 {formatResourceTimestamp(resource.createdAt)} · 수정 {formatResourceTimestamp(resource.updatedAt)}</Text>
      <Text style={{ color: theme.text, fontSize: 15, lineHeight: 24 }}>{resource.summary}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}><TextAction label={`확인 직원 ${resource.uniqueViewerCount.toLocaleString("ko-KR")}명`} disabled={loading || busy || pending} onPress={() => navigate(`/resources/${id}/viewers`)}/>{resource.canManage ? <><TextAction label="자료 수정" disabled={loading || busy || pending} onPress={() => navigate(`/resources/${id}/edit`)}/><TextAction label="자료 삭제" disabled={loading || busy || pending} onPress={() => void deleteResource()}/></> : null}</View>
      <AccountFeedback error={visitError}/>{visitError ? <TextAction label="같은 방문 열람 기록 재시도" disabled={busy || loading} onPress={() => void recordVisit()}/> : null}
      <Text accessibilityRole="header" aria-level={3} style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>첨부 {resource.attachments.length}개</Text>
      <View accessibilityRole="list" accessibilityLabel="자료 첨부">{resource.attachments.map(file => <View key={file.id} role="listitem" style={{ borderBottomWidth: 1, borderColor: theme.border }}><ResourceRow title={file.name} detail={`${resourceFileSize(file.size)} · ${file.previewKind === "unsupported" ? "파일 저장" : "미리보기·저장"}`} disabled={busy || loading || pending} onPress={() => navigate(`/resources/attachments/${file.id}`)}/></View>)}</View>
      {!resource.attachments.length ? <Text style={{ color: theme.secondary }}>첨부된 파일이 없습니다.</Text> : null}
      <TextAction label="자료 새로고침" disabled={busy || loading} onPress={() => void load()}/>
    </> : loading ? <ActivityIndicator color={theme.accent}/> : error || (!notice && visitError) ? <Text style={{ color: theme.secondary }}>자료 내용을 확인하지 못했습니다. 다시 불러오세요.</Text> : null}
    {error ? <TextAction label="자료 다시 불러오기" disabled={loading || busy} onPress={() => void load()}/> : null}
    <TextAction label="자료 목록" disabled={busy || loading} onPress={() => { if (valid())
        router.push("/resources"); }}/>
    {confirmation.dialog}
  </ScrollView>;
}
