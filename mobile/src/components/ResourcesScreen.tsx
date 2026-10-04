import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { AccountFeedback } from "@/components/account-feedback";
import { ResourceField, ResourceRow } from "@/components/ResourceContent";
import { EmptyState, TextAction } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { formatResourceTimestamp, isResourceList, resourceCategories, resourceCategory, resourceError, resourceLevel, resourceLevelLabel, resourceLevels, resourcePage, resourcePrivateFailure } from "@/lib/resources";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useResources } from "@/providers/ResourceProvider";
import type { ResourceListResponse } from "@/types/resources";
export function ResourcesScreen(props: {
    category?: string;
    level?: string;
    q?: string;
    page?: string;
    invalidQuery?: boolean;
}) {
    const { token } = useSession();
    const key = `${token}:${JSON.stringify(props)}`;
    const scope = useRef(key);
    useLayoutEffect(() => { scope.current = key; }, [key]);
    return token ? <ResourceListContent key={key} {...props} isAccount={() => scope.current === key}/> : null;
}
function ResourceListContent({ category: categoryParam, level: levelParam, q = "", page: pageParam, invalidQuery = false, isAccount }: {
    category?: string;
    level?: string;
    q?: string;
    page?: string;
    invalidQuery?: boolean;
    isAccount(): boolean;
}) {
    const [permission, setPermission] = useState(false);
    const acceptedForeground = useRef<number | null>(null);
    const [acceptedRevision, setAcceptedRevision] = useState<number | null>(null);
    const theme = useTheme();
    const { authenticatedRequest, foreground, foregroundRevision, foregroundGeneration, isForeground, isCurrentAccount } = useResources();
    const category = resourceCategory(categoryParam), level = resourceLevel(levelParam), page = resourcePage(pageParam);
    const [data, setData] = useState<ResourceListResponse | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState(q), [filters, setFilters] = useState(false);
    const alive = useRef(true), focused = useRef(false), generation = useRef(0), locked = useRef(false), verified = useRef(false), controller = useRef<AbortController | null>(null);
    const current = useCallback(() => alive.current && focused.current && isForeground() && isAccount() && isCurrentAccount(), [isForeground, isAccount, isCurrentAccount]);
    const invalidate = useCallback(() => { generation.current++; }, []);
    const currentRef = useRef(current);
    useLayoutEffect(() => { currentRef.current = current; }, [current]);
    const load = useCallback(async () => {
        if (!currentRef.current() || locked.current)
            return;
        if (!category || !level || !page || typeof q !== "string" || invalidQuery) {
            setLoading(false);
            setError("자료 분류·검색·페이지 주소를 확인하세요. 다른 조건으로 자동 변경하지 않습니다.");
            return;
        }
        const epoch = ++generation.current, foregroundAtStart = foregroundGeneration();
        const abort = new AbortController();
        controller.current = abort;
        locked.current = true;
        setLoading(true);
        setError(null);
        try {
            const normalizedLevel = category === "education" ? level : "all";
            const params = new URLSearchParams({ category, level: normalizedLevel, q: q.trim(), page: String(page) });
            const value = await authenticatedRequest<unknown>(`/resources?${params}`, { signal: abort.signal });
            if (!currentRef.current() || epoch !== generation.current || foregroundAtStart !== foregroundGeneration())
                return;
            if (!isResourceList(value) || value.category !== category || value.level !== normalizedLevel || value.q !== q.trim())
                throw new ApiError("자료 목록 응답이 일치하지 않습니다. 다시 불러오세요.", 200);
            setData(value);
            verified.current = true;
            acceptedForeground.current = foregroundAtStart;
            setAcceptedRevision(foregroundAtStart);
            setPermission(true);
        }
        catch (cause) {
            if (!currentRef.current() || epoch !== generation.current || foregroundAtStart !== foregroundGeneration())
                return;
            if (resourcePrivateFailure(cause)) {
                setData(null);
                verified.current = false;
                setPermission(false);
            }
            setError(resourceError(cause));
        }
        finally {
            if (epoch === generation.current) {
                locked.current = false;
                controller.current = null;
                if (currentRef.current())
                    setLoading(false);
            }
        }
    }, [authenticatedRequest, category, level, page, q, invalidQuery, foregroundGeneration]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; invalidate(); controller.current?.abort(); }; }, [invalidate]);
    useFocusEffect(useCallback(() => {
        void foregroundRevision;
        focused.current = true;
        verified.current = false;
        setPermission(false);
        if (foreground)
            void load();
        return () => { focused.current = false; verified.current = false; setPermission(false); invalidate(); locked.current = false; controller.current?.abort(); setLoading(true); };
    }, [foreground, foregroundRevision, invalidate, load]));
    function navigate(path: string) { if (currentRef.current() && !locked.current && verified.current && acceptedForeground.current === foregroundGeneration())
        router.push(path as never); }
    const foregroundAtRender = foregroundGeneration();
    function filter(next: Record<string, string>) { if (!currentRef.current() || locked.current || foregroundAtRender !== foregroundGeneration())
        return; router.setParams({ category: category ?? "corporation", level: category === "education" ? level ?? "all" : "all", q, page: "1", ...next }); }
    const visible = foreground && isForeground() && permission && acceptedRevision === foregroundRevision && isAccount() && isCurrentAccount();
    const previousResult = loading || !!error;
    return <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8, maxWidth: 960, width: "100%", alignSelf: "center", paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}><Text accessibilityRole="header" aria-level={2} style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}>자료 목록</Text><TextAction label="자료 등록" icon="add" disabled={!visible || loading} onPress={() => navigate("/resources/new")}/></View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }} accessibilityRole="tablist">{resourceCategories.map(item => <TextAction key={item.value} label={item.label} accessibilityRole="tab" accessibilityState={{ selected: category === item.value }} disabled={loading} onPress={() => filter({ category: item.value, level: "all" })}/>)}</View>
    {category === "education" ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }} accessibilityRole="tablist">{resourceLevels.map(item => <TextAction key={item.value} label={item.label} accessibilityRole="tab" accessibilityState={{ selected: level === item.value }} disabled={loading} onPress={() => filter({ level: item.value })}/>)}</View> : null}
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={{ color: theme.secondary, fontSize: 13 }}>{visible && data ? `${previousResult ? "이전 조회 결과 · " : ""}자료 ${data.total.toLocaleString("ko-KR")}건 · ${data.page}/${data.totalPages}쪽` : loading ? "자료 불러오는 중" : "자료 목록 확인 불가"}</Text><TextAction label={filters ? "검색 닫기" : "검색"} icon="search" onPress={() => { if (currentRef.current())
        setFilters(value => !value); }}/></View>
    {filters && visible ? <View style={{ gap: 4 }}><ResourceField label="자료 검색" value={query} onChange={value => { if (currentRef.current() && !locked.current)
        setQuery(value); }} placeholder="제목, 내용, 작성자, 첨부명" disabled={loading}/><TextAction label="검색 적용" disabled={loading} onPress={() => filter({ q: query.trim() })}/></View> : null}
    <AccountFeedback error={error}/>{error ? <TextAction label="목록 다시 불러오기" disabled={loading} onPress={() => void load()}/> : null}
    {!visible ? <View style={{ paddingVertical: 12 }}>{loading ? <ActivityIndicator color={theme.accent}/> : null}<Text style={{ color: theme.secondary, marginTop: loading ? 8 : 0 }}>{loading ? "자료를 불러오는 중입니다." : "목록을 확인하지 못했습니다. 다시 불러오세요."}</Text></View> : data?.items.length ? <View accessibilityRole="list" accessibilityLabel="자료 목록">{data.items.map(item => <View key={item.id} role="listitem" style={{ borderBottomWidth: 1, borderColor: theme.border }}><ResourceRow title={`${item.pinned ? "[고정] " : ""}${item.title}`} numberOfLines={2} detail={`${item.author.name} · ${formatResourceTimestamp(item.createdAt)}${item.educationLevel ? ` · ${resourceLevelLabel(item.educationLevel)}` : ""}\n첨부 ${item.attachments.length}개 · 확인 직원 ${item.uniqueViewerCount.toLocaleString("ko-KR")}명`} disabled={loading} onPress={() => navigate(`/resources/${item.id}`)}/></View>)}</View> : previousResult ? <View style={{ paddingVertical: 12, gap: 8 }}>{loading ? <ActivityIndicator color={theme.accent}/> : null}<Text style={{ color: theme.secondary }}>{loading ? "이전 조회에는 자료가 없습니다. 최신 목록을 확인하고 있습니다." : "이전 조회에는 자료가 없습니다. 최신 목록을 다시 확인하세요."}</Text></View> : <EmptyState title="등록된 자료가 없습니다" detail="다른 분류나 검색 조건을 확인하세요."/>}
    {visible && data ? <View style={{ flexDirection: "row", justifyContent: "space-between" }}><TextAction label="이전 쪽" disabled={loading || data.page <= 1} onPress={() => filter({ page: String(data.page - 1) })}/><TextAction label="새로고침" disabled={loading} onPress={() => void load()}/><TextAction label="다음 쪽" disabled={loading || data.page >= data.totalPages} onPress={() => filter({ page: String(data.page + 1) })}/></View> : null}
  </ScrollView>;
}
