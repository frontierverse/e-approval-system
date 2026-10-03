import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { InboxDocumentRow } from "@/components/inbox-list";
import { EmptyState, ErrorState, ScreenHeading, TextAction } from "@/components/ui";
import { documentPeriodError } from "@/lib/document-library";
import { inboxPath, type InboxFilters, type InboxPage } from "@/lib/inbox";
import { useFocusedPage } from "@/lib/use-focused-page";
import { useTheme } from "@/lib/theme";
import type { InboxDocument } from "@/lib/types";

export function InboxScreen() {
  const params = useLocalSearchParams<{ q?: string; dateFrom?: string; dateTo?: string; sort?: string; page?: string }>();
  const query = typeof params.q === "string" ? params.q : "";
  const dateFrom = typeof params.dateFrom === "string" ? params.dateFrom : "";
  const dateTo = typeof params.dateTo === "string" ? params.dateTo : "";
  const sort = params.sort === "oldest" ? "oldest" : "latest";
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  return <InboxContent key={JSON.stringify([query, dateFrom, dateTo])} filters={{ query, dateFrom, dateTo, sort, page }} />;
}

function InboxContent({ filters }: { filters: InboxFilters }) {
  const theme = useTheme();
  const { query, dateFrom, dateTo, sort } = filters;
  const path = inboxPath(filters);
  const { data, loading, refreshing, error, reload } = useFocusedPage<InboxPage>(path);
  const list = useRef<FlatList<InboxDocument>>(null);
  const startInput = useRef<TextInput>(null);
  const [search, setSearch] = useState(query);
  const [from, setFrom] = useState(dateFrom);
  const [to, setTo] = useState(dateTo);
  const [dateError, setDateError] = useState<string | null>(null);
  const [showPeriod, setShowPeriod] = useState(false);
  useEffect(() => { list.current?.scrollToOffset({ offset: 0, animated: false }); }, [path]);
  const update = (values: Record<string, string>) => router.setParams({ page: "1", ...values });
  const submitSearch = () => { Keyboard.dismiss(); update({ q: search.trim() }); };
  const applyPeriod = () => {
    const message = documentPeriodError(from, to);
    setDateError(message);
    if (message) { startInput.current?.focus(); return; }
    Keyboard.dismiss(); update({ dateFrom: from, dateTo: to }); setShowPeriod(false);
  };
  const filtered = !!(query || dateFrom || dateTo);
  const reset = () => {
    setSearch(""); setFrom(""); setTo(""); setDateError(null); setShowPeriod(false);
    update({ q: "", dateFrom: "", dateTo: "", sort: "latest" });
  };
  const header = <>
    <ScreenHeading title="받은결재" subtitle={data ? `${filtered ? "검색 결과" : "대기 중"} ${data.total.toLocaleString("ko-KR")}건 · ${data.page}/${data.totalPages} 페이지` : error ? "조회 실패" : "불러오는 중"} />
    <View style={styles.searchRow}>
      <TextInput accessibilityLabel="받은결재 검색" placeholder="제목·문서번호·기안자 검색" placeholderTextColor={theme.muted}
        value={search} onChangeText={setSearch} onSubmitEditing={submitSearch} returnKeyType="search" maxLength={100}
        autoCapitalize="none" autoCorrect={false} style={[styles.input, { flex: 1, color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]} />
      <TextAction label="검색" icon="search" onPress={submitSearch} />
    </View>
    <View style={styles.toolsRow}>
      <TextAction label="기간" icon={showPeriod ? "chevron-up" : "calendar-outline"} accessibilityState={{ expanded: showPeriod }} onPress={() => setShowPeriod(!showPeriod)} />
      <TextAction label={sort === "latest" ? "최신순" : "오래된순"} icon="swap-vertical" accessibilityLabel={`정렬: ${sort === "latest" ? "최신순, 오래된순으로 변경" : "오래된순, 최신순으로 변경"}`} onPress={() => update({ sort: sort === "latest" ? "oldest" : "latest" })} />
      <View style={{ flex: 1 }} />
      {filtered ? <TextAction label="초기화" onPress={reset} /> : null}
      {loading && data ? <ActivityIndicator size="small" color={theme.accent} accessibilityLabel="받은결재 새로고침 중" /> : null}
    </View>
    {showPeriod ? <View style={[styles.period, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={{ color: theme.secondary, fontSize: 12, marginBottom: 8 }}>상신일 기준 · YYYY-MM-DD</Text>
      <View style={styles.searchRow}>
        <TextInput ref={startInput} accessibilityLabel="기간 시작일" placeholder="시작일" placeholderTextColor={theme.muted} value={from} onChangeText={setFrom}
          autoCapitalize="none" autoCorrect={false} maxLength={10} style={[styles.input, { flex: 1, color: theme.text, borderColor: theme.border }]} />
        <Text style={{ color: theme.secondary }}>~</Text>
        <TextInput accessibilityLabel="기간 종료일" placeholder="종료일" placeholderTextColor={theme.muted} value={to} onChangeText={setTo}
          autoCapitalize="none" autoCorrect={false} maxLength={10} returnKeyType="search" onSubmitEditing={applyPeriod}
          style={[styles.input, { flex: 1, color: theme.text, borderColor: theme.border }]} />
      </View>
      {dateError ? <Text accessibilityRole="alert" style={{ color: theme.danger, fontSize: 13 }}>{dateError}</Text> : null}
      <View style={[styles.toolsRow, { justifyContent: "flex-end" }]}><TextAction label="기간 지우기" onPress={() => { setFrom(""); setTo(""); setDateError(null); update({ dateFrom: "", dateTo: "" }); setShowPeriod(false); }} /><TextAction label="적용" onPress={applyPeriod} /></View>
    </View> : null}
    {dateFrom || dateTo ? <Text style={{ color: theme.secondary, fontSize: 12, marginVertical: 4 }}>상신일 {dateFrom || "전체"} ~ {dateTo || "전체"}</Text> : null}
    {error && data ? <ErrorState message={error} retry={reload} /> : null}
  </>;
  return <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: theme.background }}>
    <FlatList ref={list} data={data?.documents ?? []} keyExtractor={item => item.id}
      style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={theme.accent} />}
      ListHeaderComponent={header}
      renderItem={({ item, index }) => <View style={{ backgroundColor: theme.surface }}><InboxDocumentRow document={item} index={index} showProgress={false} /></View>}
      ListEmptyComponent={loading ? <InboxLoading /> : error ? <ErrorState message={error} retry={reload} /> :
        <EmptyState title={filtered ? "조건에 맞는 결재가 없습니다" : "대기 중인 결재가 없습니다"}
          detail={filtered ? "검색어나 기간을 변경해 보세요." : "새 결재가 도착하면 이 목록에 나타납니다."} />}
      ListFooterComponent={data && data.totalPages > 1 ? <View style={styles.pager}>
        <TextAction label="이전" icon="chevron-back" disabled={loading || data.page <= 1} accessibilityState={{ disabled: loading || data.page <= 1 }} onPress={() => router.setParams({ page: String(data.page - 1) })} />
        <Text style={{ color: theme.secondary, fontVariant: ["tabular-nums"] }}>{data.page} / {data.totalPages} 페이지</Text>
        <TextAction label="다음" icon="chevron-forward" disabled={loading || data.page >= data.totalPages} accessibilityState={{ disabled: loading || data.page >= data.totalPages }} onPress={() => router.setParams({ page: String(data.page + 1) })} />
      </View> : null} />
  </SafeAreaView>;
}

function InboxLoading() {
  const theme = useTheme();
  return <View accessibilityLabel="받은결재 불러오는 중" accessibilityRole="progressbar">
    {[0, 1, 2].map(index => <View key={index} style={[styles.skeleton, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <View style={{ width: "80%", height: 17, backgroundColor: theme.surfaceMuted }} />
      <View style={{ width: "50%", height: 12, backgroundColor: theme.surfaceMuted, marginTop: 8 }} />
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  input: { minHeight: 44, minWidth: 0, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, fontSize: 15 },
  toolsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  period: { borderWidth: 1, borderRadius: 10, padding: 12 },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 4 },
  skeleton: { minHeight: 74, paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, justifyContent: "center" },
});
