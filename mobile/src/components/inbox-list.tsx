import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatDate, useTheme } from "@/lib/theme";
import type { InboxDocument } from "@/lib/types";

export function InboxList({ documents }: { documents: InboxDocument[] }) {
  const theme = useTheme();
  return <View style={[styles.list, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    {documents.map((document, index) => <Pressable key={document.id}
      accessibilityRole="link" accessibilityLabel={`${document.title}, ${document.drafterName}, 결재 문서 열기`}
      onPress={() => router.push(`/documents/${document.id}`)}
      style={({ pressed }) => [styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }, pressed && { backgroundColor: theme.surfaceMuted }]}>
      <View style={styles.rowBody}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: theme.text }]}>{document.title}</Text>
        <Text numberOfLines={1} style={[styles.meta, { color: theme.secondary }]}>
          {document.drafterName} · {formatDate(document.submittedAt)}
          {document.attachmentCount > 0 ? ` · 첨부 ${document.attachmentCount}` : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.muted} />
    </Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  row: { minHeight: 74, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "700", lineHeight: 20 },
  meta: { marginTop: 5, fontSize: 12 },
});
