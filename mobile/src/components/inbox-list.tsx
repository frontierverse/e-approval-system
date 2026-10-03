import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatDate, useTheme } from "@/lib/theme";
import type { HomeDocument, InboxDocument } from "@/lib/types";

export function InboxList({ documents, showProgress = false }: { documents: (InboxDocument | HomeDocument)[]; showProgress?: boolean }) {
  const theme = useTheme();
  return <View style={[styles.list, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    {documents.map((document, index) => <InboxDocumentRow key={document.id} document={document} index={index} showProgress={showProgress} />)}
  </View>;
}

export function InboxDocumentRow({ document, index, showProgress }: { document: InboxDocument | HomeDocument; index: number; showProgress: boolean }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable
      accessibilityRole="link" accessibilityLabel={`${document.title}, ${document.drafterName}, 문서 열기`}
      onPress={() => router.push(`/documents/${document.id}`)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
        pressed && { backgroundColor: theme.surfaceMuted },
        focused && { backgroundColor: theme.accentSoft, borderLeftWidth: 3, borderLeftColor: theme.accent, paddingLeft: 11 }]}>
      <View style={styles.rowBody}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: theme.text }]}>{document.title}</Text>
        <Text numberOfLines={1} style={[styles.meta, { color: theme.secondary }]}>
          {getDocumentMeta(document, showProgress)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.muted} />
    </Pressable>;
}

function getDocumentMeta(document: InboxDocument | HomeDocument, showProgress: boolean) {
  if (showProgress) {
    const status = document.status === "in_progress" ? "진행 중" : "결재 대기";
    const approver = "currentApproverName" in document ? document.currentApproverName : null;
    return status + (approver ? ` · 현재 결재자: ${approver}` : "");
  }
  const attachments = "attachmentCount" in document ? document.attachmentCount : 0;
  return `${document.drafterName} · ${formatDate(document.submittedAt)}${attachments > 0 ? ` · 첨부 ${attachments}` : ""}`;
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  row: { minHeight: 74, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "700", lineHeight: 20 },
  meta: { marginTop: 5, fontSize: 12 },
});
