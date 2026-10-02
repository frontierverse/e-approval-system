import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { TextAction } from "@/components/ui";
import { currentRejectedStep, detailDate, latestDocumentHistories, stepActorName, stepStatusLabel } from "@/lib/document-detail";
import { useTheme } from "@/lib/theme";
import type { MobileDocument } from "@/lib/types";

const sectionLevel = Platform.OS === "web" ? { "aria-level": 3 } : {};

export function RejectionReason({ document }: { document: MobileDocument }) {
  const theme = useTheme();
  const step = currentRejectedStep(document);
  if (document.status !== "rejected") return null;
  return <View style={[styles.rejection, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}>
    <Text accessibilityRole="header" {...sectionLevel} style={[styles.heading, { color: theme.danger }]}>반려 사유</Text>
    <Text selectable style={[styles.opinion, { color: theme.text }]}>{step?.comment?.trim() ? step.comment : "반려 사유가 기록되지 않았습니다."}</Text>
    {step ? <Text style={[styles.meta, { color: theme.secondary }]}>처리자 {stepActorName(step) || "기록 없음"} · {detailDate(step.actedAt)}</Text> : null}
  </View>;
}

export function DocumentProgress({ document }: { document: MobileDocument }) {
  const theme = useTheme();
  const rejection = currentRejectedStep(document);
  const approved = document.approvalSteps.filter(step => step.status === "approved").length;
  const histories = latestDocumentHistories(document.histories);
  const [historyLimit, setHistoryLimit] = useState(5);
  const historyAction = useRef<View>(null);
  const restoreHistoryFocus = useRef(false);
  const hasMoreHistory = historyLimit < histories.length;
  useEffect(() => {
    if (restoreHistoryFocus.current) {
      historyAction.current?.focus();
      restoreHistoryFocus.current = false;
    }
  }, [historyLimit]);
  return <>
    <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" {...sectionLevel} style={[styles.heading, { color: theme.text }]}>결재 진행</Text>
      {document.approvalSteps.length ? <Text style={[styles.count, { color: theme.secondary }]}>승인 {approved}/{document.approvalSteps.length}</Text> : null}
    </View>
    <View role="list" accessibilityLabel="결재 순서와 처리 의견" style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {document.approvalSteps.length ? document.approvalSteps.map((step, index) => <View role="listitem" key={step.id}
        style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
        <View style={styles.stepHeading}>
          <Text style={[styles.order, { color: theme.secondary }]}>{step.order}</Text>
          <Text style={[styles.name, { color: theme.text }]}>{step.name}</Text>
          <Text style={[styles.status, { color: step.status === "rejected" ? theme.danger : step.status === "approved" ? theme.success : theme.secondary }]}>{stepStatusLabel(step)}</Text>
        </View>
        {step.status === "approved" || step.status === "rejected" ? <Text style={[styles.meta, { color: theme.secondary }]}>처리자 {stepActorName(step) || "기록 없음"} · {detailDate(step.actedAt)}</Text>
          : <Text style={[styles.meta, { color: theme.secondary }]}>{step.status === "pending" ? "현재 결재 차례입니다." : "앞 단계 처리 후 결재 차례가 됩니다."}</Text>}
        {step.comment?.trim() && step.id !== rejection?.id ? <Text selectable style={[styles.opinion, { color: theme.text }]}>결재 의견 · {step.comment}</Text> : null}
      </View>) : <Text style={[styles.empty, { color: theme.secondary }]}>등록된 결재선이 없습니다.</Text>}
    </View>
    <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" {...sectionLevel} style={[styles.heading, { color: theme.text }]}>처리 이력</Text>
      {document.histories ? <Text style={[styles.count, { color: theme.secondary }]}>{histories.length}건 · 최근순</Text> : null}
    </View>
    <View role="list" accessibilityLabel="문서 처리 이력, 최근순" style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {histories.length ? histories.slice(0, historyLimit).map((history, index) => <View role="listitem" key={history.id}
        style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
        <View style={styles.historyHeading}>
          <Text style={[styles.historyAction, { color: history.action.includes("반려") ? theme.danger : theme.text }]}>{history.action}</Text>
          <Text style={[styles.meta, { color: theme.secondary, marginTop: 0 }]}>{detailDate(history.createdAt)}</Text>
        </View>
        <Text style={[styles.meta, { color: theme.secondary }]}>처리자 {history.actorName || "시스템"}</Text>
        {history.description ? <Text selectable style={[styles.opinion, { color: theme.text }]}>{history.description}</Text> : null}
      </View>) : <Text style={[styles.empty, { color: theme.secondary }]}>{document.histories ? "아직 처리 이력이 없습니다." : "처리 이력은 서버 업데이트 후 확인할 수 있습니다."}</Text>}
      {histories.length > 5 ? <View style={[styles.historyActions, { borderTopColor: theme.border }]}>
        <TextAction ref={historyAction} label={hasMoreHistory ? `더 보기 (${histories.length - historyLimit}건 남음)` : "접기"}
          accessibilityLabel={hasMoreHistory ? "이전 처리 이력 최대 10건 더 보기" : "처리 이력을 최근 5건으로 접기"}
          onPress={() => { restoreHistoryFocus.current = true; setHistoryLimit(limit => hasMoreHistory ? limit + 10 : 5); }} />
        {historyLimit > 5 && hasMoreHistory ? <TextAction label="접기" accessibilityLabel="처리 이력을 최근 5건으로 접기"
          onPress={() => { restoreHistoryFocus.current = true; setHistoryLimit(5); }} /> : null}
      </View> : null}
    </View>
  </>;
}

const styles = StyleSheet.create({
  heading: { fontSize: 16, fontWeight: "800" },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 20, marginBottom: 8 },
  count: { fontSize: 12, fontVariant: ["tabular-nums"] },
  rejection: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  panel: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  row: { paddingHorizontal: 12, paddingVertical: 10 },
  stepHeading: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  order: { fontSize: 13, width: 20, lineHeight: 20, fontVariant: ["tabular-nums"] },
  name: { fontSize: 14, fontWeight: "700", lineHeight: 20, flex: 1 },
  status: { fontSize: 13, lineHeight: 20, flexShrink: 1, maxWidth: "40%" },
  meta: { fontSize: 12, lineHeight: 18, marginTop: 4, fontVariant: ["tabular-nums"] },
  opinion: { fontSize: 14, lineHeight: 22, marginTop: 6 },
  historyHeading: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", columnGap: 8, rowGap: 4 },
  historyAction: { fontSize: 14, fontWeight: "700", lineHeight: 18 },
  historyActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", borderTopWidth: 1, paddingHorizontal: 6 },
  empty: { fontSize: 13, lineHeight: 20, padding: 12 },
});
