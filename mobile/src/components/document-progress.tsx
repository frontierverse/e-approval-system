import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { DetailBadge, DetailButton, DetailPanel, DetailSection, DetailText as Text } from "./document-detail-ui";
import { currentRejectedStep, detailDate, latestDocumentHistories, stepActorName, stepStatusLabel } from "@/lib/document-detail";
import { useHomeTheme } from "@/lib/home-theme";
import type { MobileDocument } from "@/lib/types";

export function RejectionReason({ document }: { document: MobileDocument }) {
  const theme = useHomeTheme(), step = currentRejectedStep(document);
  if (document.status !== "rejected") return null;
  return <DetailPanel style={{ backgroundColor: theme.dangerSoft, borderColor: theme.danger, paddingHorizontal: 14, paddingVertical: 12, gap: 6 }}>
    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}><Feather name="x-circle" color={theme.danger} size={18} accessible={false} aria-hidden />
      <Text accessibilityRole="header" {...(Platform.OS === "web" ? { "aria-level": 3 } : {})} style={{ fontSize: 15, lineHeight: 21, fontWeight: "700", color: theme.danger }}>{step?.decisionType === "PROXY_REJECT" ? "대리결재 반려 사유" : "반려 사유"}</Text></View>
    <Text selectable style={{ color: theme.text, fontSize: 15, lineHeight: 24 }}>{step?.comment?.trim() ? step.comment : "반려 사유가 기록되지 않았습니다."}</Text>
    <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19 }}>처리자 {step ? stepActorName(step) || "기록 없음" : "기록 없음"} · {detailDate(step?.actedAt)}{step?.decisionType === "PROXY_REJECT" ? ` · 원 결재자 ${step.name}` : ""}</Text>
  </DetailPanel>;
}
export function DocumentProgress({ document }: { document: MobileDocument }) {
  const theme = useHomeTheme(), rejection = currentRejectedStep(document);
  const steps = [...document.approvalSteps].sort((a, b) => a.order - b.order);
  const approved = steps.filter(step => step.status === "approved").length;
  const histories = latestDocumentHistories(document.histories);
  const [limit, setLimit] = useState(5), action = useRef<View>(null), restore = useRef(false);
  useEffect(() => { if (restore.current) { action.current?.focus(); restore.current = false; } }, [limit]);
  const more = limit < histories.length;
  return <>
    <DetailSection title="결재 진행" extra={steps.length ? `승인 ${approved}/${steps.length}` : undefined}>
      <DetailPanel><View role="list" accessibilityLabel="결재 순서와 처리 의견">{steps.length ? steps.map((step, index) => {
        const active = step.status === "pending", done = step.status === "approved" || step.status === "rejected";
        const color = step.status === "rejected" ? theme.danger : active ? theme.accent : step.status === "approved" ? theme.success : theme.secondary;
        return <View key={step.id} role="listitem" style={{ paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", gap: 10,
          borderTopColor: theme.border, borderTopWidth: index ? 1 : 0 }}>
          <View accessible={false} aria-hidden style={{ minWidth: 28, minHeight: 28, alignSelf: "flex-start", alignItems: "center", justifyContent: "center",
            borderRadius: 14, borderWidth: 1.5, borderColor: color, backgroundColor: active ? theme.accentSoft : "transparent" }}>
            <Text style={{ color, fontSize: 13, lineHeight: 20, fontWeight: "700" }}>{step.order}</Text></View>
          <View style={{ flex: 1, gap: 4 }}><View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <Text accessibilityLabel={`${step.order}단계 ${step.name}`} style={{ color: theme.text, fontSize: 15, lineHeight: 21, fontWeight: "700" }}>{step.name}</Text>
            <DetailBadge label={stepStatusLabel(step)} status={step.status} /></View>
            {done ? <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19 }}>처리자 {stepActorName(step) || "기록 없음"} · {detailDate(step.actedAt)}</Text>
              : <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19 }}>{active ? "현재 결재 차례입니다." : step.status === "waiting" ? "앞 단계 처리 후 결재 차례가 됩니다." : stepStatusLabel(step)}</Text>}
            {step.comment?.trim() ? step.id === rejection?.id ? <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19 }}>반려 사유는 위에 표시했어요.</Text>
              : <Text selectable style={{ color: theme.text, fontSize: 14, lineHeight: 22, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: theme.surfaceMuted, borderRadius: 8 }}>{step.comment}</Text> : null}
          </View>
        </View>;
      }) : <Empty text="등록된 결재선이 없어요." />}</View></DetailPanel>
    </DetailSection>
    <DetailSection title="처리 이력" extra={histories.length ? `${Math.min(limit, histories.length)}/${histories.length}건 · 최근순` : undefined}>
      <DetailPanel><View role="list" accessibilityLabel="문서 처리 이력, 최근순">{histories.length ? histories.slice(0, limit).map((history, index) => <View key={history.id} role="listitem"
        style={{ paddingVertical: 10, paddingHorizontal: 14, gap: 2, borderTopColor: theme.border, borderTopWidth: index ? 1 : 0 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 8, alignItems: "baseline" }}>
          <Text style={{ color: theme.text, fontSize: 14, lineHeight: 21, fontWeight: "700" }}>{history.action}</Text>
          <Text style={{ color: theme.text, fontSize: 14, lineHeight: 21 }}>{history.actorName || "시스템"}</Text>
          <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19 }}>{detailDate(history.createdAt)}</Text></View>
        {history.description ? <Text selectable style={{ color: theme.secondary, fontSize: 14, lineHeight: 22 }}>{history.description}</Text> : null}
      </View>) : <Empty text={document.histories ? "아직 처리 이력이 없어요." : "처리 이력은 서버 업데이트 후 확인할 수 있어요."} />}</View></DetailPanel>
      {histories.length > 5 ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <DetailButton ref={action} label={more ? `더 보기 (${histories.length - limit}건 남음)` : "접기"} onPress={() => { restore.current = true; setLimit(more ? limit + 10 : 5); }} />
        {limit > 5 && more ? <DetailButton label="접기" onPress={() => { restore.current = true; setLimit(5); }} /> : null}
      </View> : null}
    </DetailSection>
  </>;
}
function Empty({ text }: { text: string }) { const theme = useHomeTheme(); return <Text style={{ color: theme.secondary, fontSize: 14, lineHeight: 21, paddingVertical: 12, paddingHorizontal: 16 }}>{text}</Text>; }
