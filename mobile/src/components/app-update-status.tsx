import { router, usePathname } from "expo-router";
import { ActivityIndicator, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TextAction } from "@/components/ui";
import { useAppUpdates, type AppUpdatePhase } from "@/providers/AppUpdatesProvider";
import { useTheme } from "@/lib/theme";

export function appUpdateTitle(phase: AppUpdatePhase, progress: number | null): string {
  if (phase === "checking") return "업데이트 확인 중";
  if (phase === "downloading") return progress === null ? "업데이트 다운로드 중" : progress === 1 ? "다운로드 100% · 마무리 중" : `업데이트 다운로드 ${Math.floor(progress * 100)}%`;
  if (phase === "ready") return "다운로드 완료 · 적용 대기";
  if (phase === "available") return "새 업데이트 다운로드 가능";
  if (phase === "error") return "업데이트 확인 필요";
  if (phase === "disabled") return "설치한 앱에서 확인할 수 있습니다";
  return "현재 버전 사용 중";
}
export function formatAppUpdateTime(value: string | null): string {
  if (!value) return "확인 기록 없음";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "확인 기록 없음";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Seoul" }).format(date);
}
export function AppUpdateProgress({ progress }: { progress: number | null }) {
  const theme = useTheme();
  return progress === null ? <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 8 }}><ActivityIndicator size="small" color={theme.accent} /><Text style={{ color: theme.secondary, fontSize: 13 }}>진행률을 확인하고 있습니다.</Text></View> : <View accessibilityRole="progressbar" accessibilityLabel="앱 업데이트 다운로드" accessibilityValue={{ min: 0, max: 100, now: Math.floor(progress * 100) }} style={{ marginTop: 8, height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: theme.border }}><View style={{ height: 6, width: `${progress * 100}%`, backgroundColor: theme.actionFill }} /></View>;
}

export function AppUpdateStatus({ canNavigate = true }: { canNavigate?: boolean }) {
  const updates = useAppUpdates();
  const theme = useTheme();
  const { bottom } = useSafeAreaInsets();
  const pathname = usePathname();
  const { width, fontScale } = useWindowDimensions();
  const stacked = updates.phase === "ready" && (width <= 360 || fontScale >= 1.3);
  if (!updates.enabled || pathname === "/app-updates" || (updates.phase === "idle" && !updates.appliedNotice) || (updates.phase === "ready" && updates.deferred && !updates.restarting)) return null;
  return <View style={{ flexShrink: 0, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.surface, paddingHorizontal: 12, paddingBottom: bottom }}>
    <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", paddingTop: stacked ? 8 : 0 }}>
      {updates.busy ? <ActivityIndicator size="small" color={theme.accent} /> : null}
      <Text accessibilityLiveRegion="polite" style={{ flexGrow: 1, flexShrink: stacked ? 0 : 1, flexBasis: stacked ? "100%" : 120, minWidth: 120, color: updates.applyError || updates.phase === "error" ? theme.danger : updates.phase === "ready" ? theme.success : theme.secondary, fontSize: 12, lineHeight: 18 }}>{updates.phase === "idle" && updates.appliedNotice ? "현재 업데이트 적용 확인" : updates.restarting ? "업데이트 적용 중" : appUpdateTitle(updates.phase, updates.progress)}</Text>
      {canNavigate && updates.phase === "ready" ? <>
        <TextAction label={updates.restarting ? "적용 중" : "적용"} accessibilityLabel="업데이트 적용" disabled={updates.busy || !!updates.applyBlockedReason} onPress={() => void updates.apply()} />
        <TextAction label="나중에" accessibilityLabel="업데이트 나중에 적용" disabled={updates.busy} onPress={updates.defer} />
      </> : null}
      {canNavigate ? <TextAction label="업데이트" accessibilityLabel="앱 업데이트 상태 보기" icon="cloud-download-outline" onPress={() => router.push("/app-updates")} /> : null}
      {updates.phase === "idle" && updates.appliedNotice ? <TextAction label="닫기" accessibilityLabel="업데이트 적용 확인 닫기" onPress={updates.dismissAppliedNotice} /> : null}
    </View>
    {updates.phase === "ready" && (updates.applyError || updates.applyBlockedReason) ? <Text accessibilityLiveRegion="polite" style={{ color: updates.applyError ? theme.danger : theme.secondary, fontSize: 12, lineHeight: 18, paddingBottom: 8 }}>{updates.applyError ?? updates.applyBlockedReason}</Text> : null}
  </View>;
}
