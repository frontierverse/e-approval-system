import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { AccountFeedback } from "@/components/account-feedback";
import { EmptyState, TextAction } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { formatResourceTimestamp, isResourceId, isResourceViewers, resourceError, resourcePrivateFailure } from "@/lib/resources";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useResources } from "@/providers/ResourceProvider";
import type { ResourceViewersResponse } from "@/types/resources";
export function ResourceViewersScreen({ id }: {
    id: string;
}) {
    const { token } = useSession();
    const key = `${token}:${id}`, scope = useRef(key);
    useLayoutEffect(() => { scope.current = key; }, [key]);
    return token ? <Viewers key={key} id={id} isAccount={() => scope.current === key}/> : null;
}
function Viewers({ id, isAccount }: {
    id: string;
    isAccount(): boolean;
}) {
    const [permission, setPermission] = useState(false);
    const acceptedForeground = useRef<number | null>(null);
    const [acceptedRevision, setAcceptedRevision] = useState<number | null>(null);
    const theme = useTheme();
    const { foreground, foregroundRevision, foregroundGeneration, isForeground, authenticatedRequest, isCurrentAccount } = useResources();
    const [data, setData] = useState<ResourceViewersResponse | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
    const alive = useRef(true), focused = useRef(false), epoch = useRef(0), locked = useRef(false), verified = useRef(false), page = useRef(1), controller = useRef<AbortController | null>(null), current = useRef<() => boolean>(() => false);
    useLayoutEffect(() => { current.current = () => alive.current && focused.current && isForeground() && isAccount() && isCurrentAccount(); }, [isForeground, isAccount, isCurrentAccount]);
    const invalidate = useCallback(() => { epoch.current++; }, []);
    const load = useCallback(async (next?: number) => {
        if (!current.current() || locked.current)
            return;
        if (!isResourceId(id)) {
            setLoading(false);
            setError("자료 주소를 확인하세요.");
            return;
        }
        const generation = ++epoch.current, foregroundAtStart = foregroundGeneration(), abort = new AbortController();
        controller.current = abort;
        locked.current = true;
        setLoading(true);
        setError(null);
        try {
            const value = await authenticatedRequest<unknown>(`/resources/${id}/viewers?page=${next ?? page.current}`, { signal: abort.signal });
            if (!current.current() || generation !== epoch.current || foregroundAtStart !== foregroundGeneration())
                return;
            if (!isResourceViewers(value, id))
                throw new ApiError("열람 현황 응답이 일치하지 않습니다.", 200);
            page.current = value.page;
            verified.current = true;
            acceptedForeground.current = foregroundAtStart;
            setAcceptedRevision(foregroundAtStart);
            setPermission(true);
            setData(value);
        }
        catch (cause) {
            if (current.current() && generation === epoch.current && foregroundAtStart === foregroundGeneration()) {
                setError(resourceError(cause));
                if (resourcePrivateFailure(cause)) {
                    verified.current = false;
                    setPermission(false);
                    setData(null);
                }
            }
        }
        finally {
            if (generation === epoch.current) {
                locked.current = false;
                controller.current = null;
                if (current.current())
                    setLoading(false);
            }
        }
    }, [authenticatedRequest, id, foregroundGeneration]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; invalidate(); controller.current?.abort(); }; }, [invalidate]);
    useFocusEffect(useCallback(() => { void foregroundRevision; focused.current = true; verified.current = false; setPermission(false); if (foreground)
        void load(); return () => { focused.current = false; verified.current = false; setPermission(false); invalidate(); locked.current = false; controller.current?.abort(); setLoading(true); }; }, [foreground, foregroundRevision, invalidate, load]));
    const visible = foreground && isForeground() && permission && acceptedRevision === foregroundRevision && isAccount() && isCurrentAccount();
    const previousResult = loading || !!error;
    return <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 8, maxWidth: 960, width: "100%", alignSelf: "center" }}>
    <Text accessibilityRole="header" aria-level={2} style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}>열람 현황</Text>
    <Text style={{ color: theme.secondary }}>{visible && data ? `${previousResult ? "이전 조회 결과 · " : ""}확인 직원 ${data.uniqueViewerCount.toLocaleString("ko-KR")}명 · ${data.page}/${data.totalPages}쪽` : loading ? "열람 현황 불러오는 중" : "열람 현황 확인 불가"}</Text>
    <AccountFeedback error={error}/>
    {visible && data ? data.items.length ? <View accessibilityRole="list" accessibilityLabel="확인 직원">{data.items.map(item => <View key={item.user.id} role="listitem" style={{ borderBottomWidth: 1, borderColor: theme.border, paddingVertical: 10, gap: 3 }}><Text style={{ color: theme.text, fontWeight: "700", fontSize: 15 }}>{item.user.name} · {item.user.departmentName}</Text><Text style={{ color: theme.secondary, fontSize: 12 }}>마지막 방문 {formatResourceTimestamp(item.lastViewedAt)} · 방문 {item.visitCount.toLocaleString("ko-KR")}회</Text><Text style={{ color: theme.secondary, fontSize: 12 }}>처음 확인 {formatResourceTimestamp(item.firstViewedAt)}</Text></View>)}</View> : previousResult ? <View style={{ paddingVertical: 12, gap: 8 }}>{loading ? <ActivityIndicator color={theme.accent}/> : null}<Text style={{ color: theme.secondary }}>{loading ? "이전 조회에는 열람 기록이 없습니다. 최신 현황을 확인하고 있습니다." : "이전 조회에는 열람 기록이 없습니다. 최신 현황을 다시 확인하세요."}</Text></View> : <EmptyState title="확인 직원이 없습니다"/> : loading ? <ActivityIndicator color={theme.accent}/> : <Text style={{ color: theme.secondary }}>열람 현황을 확인하지 못했습니다. 새로고침으로 다시 확인하세요.</Text>}
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}><TextAction label="이전 쪽" disabled={!visible || loading || !data || data.page <= 1} onPress={() => { if (current.current() && verified.current && acceptedForeground.current === foregroundGeneration())
        void load((data?.page ?? 1) - 1); }}/><TextAction label="새로고침" disabled={loading} onPress={() => void load()}/><TextAction label="다음 쪽" disabled={!visible || loading || !data || data.page >= data.totalPages} onPress={() => { if (current.current() && verified.current && acceptedForeground.current === foregroundGeneration())
        void load((data?.page ?? 1) + 1); }}/></View>
  </ScrollView>;
}
