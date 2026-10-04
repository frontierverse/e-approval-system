import Constants from "expo-constants";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountFeedback } from "@/components/account-feedback";
import { AppUpdateProgress, appUpdateTitle, formatAppUpdateTime } from "@/components/app-update-status";
import { PrimaryButton, TextAction } from "@/components/ui";
import { useAppUpdates } from "@/providers/AppUpdatesProvider";
import { useTheme } from "@/lib/theme";

export default function AppUpdatesScreen() {
  const updates = useAppUpdates();
  const theme = useTheme();
  const { bottom } = useSafeAreaInsets();
  const row = (label: string, value: string) => <View style={[styles.row, { borderBottomColor: theme.border }]}><Text style={{ color: theme.secondary, fontSize: 13 }}>{label}</Text><Text selectable style={{ color: theme.text, fontSize: 14, lineHeight: 21, fontVariant: ["tabular-nums"] }}>{value}</Text></View>;
  const download = updates.available !== null && updates.phase !== "ready";
  return <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, bottom + 16) }]}>
    <Text style={{ color: theme.secondary, fontSize: 13, paddingVertical: 12 }}>앱 버전 {Constants.expoConfig?.version ?? "확인 불가"}</Text>
    <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text accessibilityLiveRegion="polite" style={{ color: updates.phase === "ready" ? theme.success : theme.text, fontSize: 17, lineHeight: 24, fontWeight: "800" }}>{appUpdateTitle(updates.phase, updates.progress)}</Text>
      {updates.phase === "downloading" ? <AppUpdateProgress progress={updates.progress} /> : null}
      {updates.phase === "ready" ? <Text style={[styles.detail, { color: theme.secondary }]}>작성 중인 내용을 저장한 뒤 앱을 완전히 종료하고 다시 실행하세요. 새 업데이트는 다음 실행에서 적용됩니다.</Text> : updates.phase === "disabled" ? <Text style={[styles.detail, { color: theme.secondary }]}>웹·개발 화면에서는 앱 업데이트를 확인하거나 다운로드하지 않습니다.</Text> : <Text style={[styles.detail, { color: theme.secondary }]}>{updates.busy ? "현재 작업은 그대로 유지됩니다." : "업데이트 확인 시 새 버전이 있으면 다운로드합니다."}</Text>}
      {updates.enabled && updates.phase !== "ready" ? <View style={{ marginTop: 12 }}><PrimaryButton title={updates.busy ? updates.phase === "downloading" ? "다운로드 중..." : "확인 중..." : download ? updates.phase === "error" ? "다운로드 다시 시도" : "업데이트 다운로드" : updates.phase === "error" ? "업데이트 다시 확인" : "업데이트 확인"} disabled={updates.busy} onPress={() => void (download ? updates.download() : updates.check())} />{download && !updates.busy ? <TextAction label="새 업데이트 다시 확인" icon="refresh" onPress={() => void updates.check()} /> : null}</View> : null}
      <AccountFeedback error={updates.phase === "error" ? updates.error : null} />
    </View>
    <View style={[styles.panel, { marginTop: 12, borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text accessibilityRole="header" aria-level={2} style={{ color: theme.text, fontSize: 15, fontWeight: "800" }}>현재 적용된 업데이트</Text>
      {row("코드 버전", updates.current.updateId ? updates.current.updateId.slice(0, 8) : updates.current.embedded ? "설치 파일에 포함된 기본 버전" : "확인 불가")}
      {row("게시 시각", formatAppUpdateTime(updates.current.publishedAt))}
      {row("이 기기에서 적용 확인", formatAppUpdateTime(updates.observedAt))}
      <Text style={[styles.detail, { color: theme.muted }]}>적용 확인 시각은 이 상태 기능이 기기에서 해당 버전을 처음 확인한 시각입니다. 실제 설치 시각과 다를 수 있습니다.</Text>
      {updates.current.emergency ? <Text style={[styles.detail, { color: theme.danger }]}>업데이트를 실행하지 못해 기본 버전으로 복구해 실행했습니다. 네트워크를 확인하고 업데이트를 다시 확인하세요.</Text> : null}
    </View>
    <View style={[styles.panel, { marginTop: 12, borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text accessibilityRole="header" aria-level={2} style={{ color: theme.text, fontSize: 15, fontWeight: "800" }}>확인·다운로드 기록</Text>
      {row("최근 확인 시도", formatAppUpdateTime(updates.lastCheckAt))}
      {row("최근 다운로드 확인", formatAppUpdateTime(updates.lastDownloadedAt))}
      {updates.phase === "ready" || updates.phase === "available" || updates.phase === "downloading" ? row("새 업데이트 게시 시각", formatAppUpdateTime((updates.phase === "ready" ? updates.downloaded : updates.available)?.publishedAt ?? null)) : null}
      <Text style={[styles.detail, { color: theme.muted }]}>확인 시도와 다운로드 완료는 별도로 기록합니다.</Text>
      {updates.storageError ? <Text accessibilityRole="alert" style={[styles.detail, { color: theme.danger }]}>{updates.storageError}</Text> : null}
    </View>
  </ScrollView>;
}
const styles = StyleSheet.create({ content: { paddingHorizontal: 16, maxWidth: 720, width: "100%", alignSelf: "center" }, panel: { padding: 12, borderWidth: 1, borderRadius: 12 }, detail: { fontSize: 13, lineHeight: 20, marginTop: 8 }, row: { gap: 3, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth } });
