import { router } from "expo-router";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { EmptyState, ErrorState, ScreenHeading, TextAction } from "@/components/ui";
import type { DraftList } from "@/lib/drafts";
import { formatDate, useTheme } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

export default function Drafts() {
  const theme = useTheme();
  const { data, loading, refreshing, error, reload } = useLoad<DraftList>("/drafts");
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" }}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={theme.accent} />}>
    <ScreenHeading title="기안함" subtitle={"임시저장·회수 문서 " + (data?.total ?? 0) + "건"} action={<TextAction label="새 기안" icon="add" onPress={() => router.push("/drafts/new")} />} />
    {loading && !data ? <ActivityIndicator color={theme.accent} style={{ padding: 24 }} /> : error && !data ? <ErrorState message={error} retry={reload} /> :
      data?.documents.length ? <View style={{ borderRadius: 12, borderWidth: 1, borderColor: theme.border, overflow: "hidden" }}>
        {data.documents.map((d, i) => <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={d.title + " 수정"} onPress={() => router.push("/drafts/" + d.id)}
          style={({ pressed }) => ({ minHeight: 80, padding: 12, borderTopWidth: i ? 1 : 0, borderColor: theme.border, backgroundColor: pressed ? theme.accentSoft : theme.surface })}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><Text style={{ color: theme.accent, fontSize: 12, fontWeight: "700" }}>{d.status === "recalled" ? "회수" : "임시저장"}</Text><Text style={{ color: theme.secondary, fontSize: 12 }}>{d.category}</Text></View>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700", marginTop: 4 }}>{d.title}</Text>
          <Text style={{ color: theme.secondary, fontSize: 12, marginTop: 4 }}>{formatDate(d.updatedAt)} · 첨부 {d.attachmentCount}개</Text>
        </Pressable>)}
      </View> : <EmptyState title="저장된 기안이 없습니다" detail="새 기안을 작성하고 임시저장하거나 상신하세요." />}
    {data && data.total > data.documents.length ? <Text style={{ color: theme.secondary, marginTop: 12 }}>최근 {data.documents.length}건 표시 · 전체 문서는 웹 기안함에서 확인할 수 있습니다.</Text> : null}
    {error && data ? <Text style={{ color: theme.danger, marginTop: 12 }}>{error}</Text> : null}
  </ScrollView>;
}
