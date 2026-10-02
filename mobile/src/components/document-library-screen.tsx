import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState, ErrorState, ScreenHeading, TextAction } from "@/components/ui";
import { documentFolders, documentLibraryPath, documentPeriodError, documentStatuses, documentStatusLabels, formatDocumentDate,
  type DocumentFolder, type DocumentLibraryFilters, type LibraryDocument } from "@/lib/document-library";
import { useDocumentLibrary } from "@/lib/use-document-library";
import { useTheme } from "@/lib/theme";

export function DocumentLibraryScreen() {
  const params = useLocalSearchParams<{ folder?: string; status?: string; q?: string; dateFrom?: string; dateTo?: string; sort?: string; page?: string }>();
  const folder: DocumentFolder = params.folder === "drafts" || params.folder === "completed" ? params.folder : "sent";
  const status = documentStatuses[folder].some(option => option.value === params.status) ? params.status! : "all";
  const query = typeof params.q === "string" ? params.q : "";
  const dateFrom = typeof params.dateFrom === "string" ? params.dateFrom : "";
  const dateTo = typeof params.dateTo === "string" ? params.dateTo : "";
  const sort = params.sort === "oldest" ? "oldest" : "latest";
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  return <LibraryContent key={JSON.stringify([folder, query, dateFrom, dateTo])} filters={{ folder, status, query, dateFrom, dateTo, sort, page }} />;
}

function LibraryContent({ filters }: { filters: DocumentLibraryFilters }) {
  const theme = useTheme();
  const { folder, status, query, dateFrom, dateTo, sort, page } = filters;
  const path = documentLibraryPath({ folder, status, query, dateFrom, dateTo, sort, page });
  const { data, loading, refreshing, error, reload } = useDocumentLibrary(path);
  const list = useRef<FlatList<LibraryDocument>>(null);
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
  const filtered = !!(query || dateFrom || dateTo || status !== "all");
  const reset = () => {
    setSearch(""); setFrom(""); setTo(""); setDateError(null); setShowPeriod(false);
    update({ q: "", status: "all", dateFrom: "", dateTo: "", sort: "latest" });
  };
  const periodLabel = folder === "drafts" ? "수정일" : folder === "completed" ? "완료일" : "상신일";
  const header = <>
    <ScreenHeading title="문서함" subtitle={data ? `${filtered ? "검색 결과 " : ""}${data.total.toLocaleString("ko-KR")}건` : error ? "조회 실패" : "불러오는 중"}
      action={<TextAction label="새 기안" icon="add" onPress={() => router.push("/drafts/new")} />} />
    <View style={[styles.folders, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {documentFolders.map(option => <Choice key={option.value} label={option.label} selected={folder === option.value} stretch
        onPress={() => { setShowPeriod(false); update({ folder: option.value, status: "all", dateFrom: "", dateTo: "" }); }} />)}
    </View>
    <View style={styles.searchRow}>
      <TextInput accessibilityLabel="문서 검색" placeholder="제목·문서번호·기안자 검색" placeholderTextColor={theme.muted}
        value={search} onChangeText={setSearch} onSubmitEditing={submitSearch} returnKeyType="search" maxLength={100}
        autoCapitalize="none" autoCorrect={false} style={[styles.input, { flex: 1, color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]} />
      <TextAction label="검색" icon="search" onPress={submitSearch} />
    </View>
    <View style={styles.statusRow}>
      {documentStatuses[folder].map(option => <Choice key={option.value} label={option.label} selected={status === option.value} onPress={() => update({ status: option.value })} />)}
    </View>
    <View style={styles.toolsRow}>
      <TextAction label="기간" icon={showPeriod ? "chevron-up" : "calendar-outline"} accessibilityState={{ expanded: showPeriod }} onPress={() => setShowPeriod(!showPeriod)} />
      <TextAction label={sort === "latest" ? "최신순" : "오래된순"} icon="swap-vertical" accessibilityLabel={`정렬: ${sort === "latest" ? "최신순, 오래된순으로 변경" : "오래된순, 최신순으로 변경"}`} onPress={() => update({ sort: sort === "latest" ? "oldest" : "latest" })} />
      <View style={{ flex: 1 }} />
      {filtered ? <TextAction label="초기화" onPress={reset} /> : null}
      {loading && data ? <ActivityIndicator size="small" color={theme.accent} accessibilityLabel="목록 새로고침 중" /> : null}
    </View>
    {showPeriod ? <View style={[styles.period, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={{ color: theme.secondary, fontSize: 12, marginBottom: 8 }}>{periodLabel} 기준 · YYYY-MM-DD</Text>
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
    {dateFrom || dateTo ? <Text style={{ color: theme.secondary, fontSize: 12, marginTop: 4 }}>{periodLabel} {dateFrom || "전체"} ~ {dateTo || "전체"}</Text> : null}
    {folder === "completed" ? <Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 16 }}>내가 기안하거나 결재선에 배정된 완료 문서</Text> : null}
    {error && data ? <ErrorState message={error} retry={reload} /> : null}
  </>;
  return <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: theme.background }}>
    <FlatList ref={list} data={data?.documents ?? []} keyExtractor={item => item.id}
    style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.content}
    keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={theme.accent} />}
    ListHeaderComponent={header}
    renderItem={({ item }) => <DocumentRow document={item} folder={folder} />}
    ListEmptyComponent={loading ? <LibraryLoading /> : error ? <ErrorState message={error} retry={reload} /> :
      <EmptyState title={filtered ? "조건에 맞는 문서가 없습니다" : folder === "drafts" ? "저장된 기안이 없습니다" : folder === "completed" ? "완료 문서가 없습니다" : "제출한 문서가 없습니다"}
        detail={filtered ? "검색어나 상태·기간을 변경해 보세요." : folder === "drafts" ? "새 기안을 작성하고 임시저장하거나 상신하세요." : "문서를 상신하면 이곳에서 확인할 수 있습니다."} />}
    ListFooterComponent={data && data.totalPages > 1 ? <View style={styles.pager}>
      <TextAction label="이전" icon="chevron-back" disabled={loading || data.page <= 1} accessibilityState={{ disabled: loading || data.page <= 1 }} onPress={() => router.setParams({ page: String(data.page - 1) })} />
      <Text style={{ color: theme.secondary, fontVariant: ["tabular-nums"] }}>{data.page} / {data.totalPages} 페이지</Text>
      <TextAction label="다음" icon="chevron-forward" disabled={loading || data.page >= data.totalPages} accessibilityState={{ disabled: loading || data.page >= data.totalPages }} onPress={() => router.setParams({ page: String(data.page + 1) })} />
    </View> : null} />
  </SafeAreaView>;
}

function Choice({ label, selected, onPress, stretch = false }: { label: string; selected: boolean; onPress: () => void; stretch?: boolean }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.choice,
      { flex: stretch ? 1 : undefined, borderColor: focused || selected ? theme.accent : "transparent", backgroundColor: selected || pressed || focused ? theme.accentSoft : "transparent" }]}>
    <Text style={{ color: selected ? theme.accent : theme.secondary, fontSize: 14, fontWeight: selected ? "800" : "600" }}>{label}</Text>
  </Pressable>;
}

function DocumentRow({ document, folder }: { document: LibraryDocument; folder: DocumentFolder }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const editable = document.status === "draft" || document.status === "recalled";
  const date = folder === "drafts" ? document.updatedAt : folder === "completed" ? document.completedAt ?? document.submittedAt ?? document.createdAt : document.submittedAt ?? document.createdAt;
  const state = documentStatusLabels[document.status] ?? document.status;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${state} · ${document.title}${editable ? " 수정" : " 보기"}`}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    onPress={() => router.push((editable ? "/drafts/" : "/documents/") + document.id)}
    style={({ pressed }) => [styles.document, { backgroundColor: pressed || focused ? theme.accentSoft : theme.surface,
      borderColor: focused ? theme.accent : theme.border }]}>
    <View style={styles.documentMeta}>
      <Text style={{ color: document.status === "rejected" ? theme.danger : document.status === "approved" ? theme.success : theme.accent, fontSize: 12, fontWeight: "800" }}>{state}</Text>
      <Text numberOfLines={1} style={{ color: theme.secondary, fontSize: 12, flex: 1 }}>{document.documentNo || document.category}</Text>
      {document.attachmentCount ? <Text style={{ color: theme.secondary, fontSize: 12 }}>첨부 {document.attachmentCount}</Text> : null}
    </View>
    <Text numberOfLines={2} style={{ color: theme.text, fontSize: 16, fontWeight: "700", marginTop: 3 }}>{document.title}</Text>
    <Text numberOfLines={1} style={{ color: theme.secondary, fontSize: 12, marginTop: 4, fontVariant: ["tabular-nums"] }}>
      {formatDocumentDate(date)}{folder === "completed" ? ` · ${document.drafterName}` : ""}{document.currentApproverName ? ` · ${document.currentApproverName} 결재 대기` : ""}
    </Text>
  </Pressable>;
}

function LibraryLoading() {
  const theme = useTheme();
  return <View accessibilityLabel="문서 불러오는 중" accessibilityRole="progressbar">
    {[0, 1, 2].map(index => <View key={index} style={[styles.document, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={{ width: 64, height: 12, backgroundColor: theme.surfaceMuted }} />
      <View style={{ width: "80%", height: 17, backgroundColor: theme.surfaceMuted, marginTop: 6 }} />
      <View style={{ width: "50%", height: 12, backgroundColor: theme.surfaceMuted, marginTop: 6 }} />
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  folders: { flexDirection: "row", borderWidth: 1, borderRadius: 10, padding: 2 },
  choice: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderRadius: 8, borderWidth: 2 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  input: { minHeight: 44, minWidth: 0, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, fontSize: 15 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 2, marginTop: 4 },
  toolsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  period: { borderWidth: 1, borderRadius: 10, padding: 12 },
  document: { minHeight: 82, padding: 12, borderWidth: 1, borderRadius: 8, marginBottom: 6 },
  documentMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 4 },
});
