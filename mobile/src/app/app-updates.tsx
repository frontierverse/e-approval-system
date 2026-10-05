import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router, Stack } from "expo-router";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountButton } from "@/components/account-ui";
import { appUpdateTitle, formatAppUpdateTime } from "@/components/app-update-status";
import { AppUpdatesAction, AppUpdatesNotice, AppUpdatesProgress, AppUpdatesRow, AppUpdatesSection, AppUpdatesStatusTitle } from "@/components/app-updates-ui";
import { DetailText as Text } from "@/components/document-detail-ui";
import { useHomeTheme } from "@/lib/home-theme";
import { useSession } from "@/lib/session";
import { useAppUpdates } from "@/providers/AppUpdatesProvider";

export default function AppUpdatesScreen() {
  const updates = useAppUpdates();
  const theme = useHomeTheme();
  const { token } = useSession();
  const { bottom } = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const { phase, busy } = updates;
  const labelWidth = fontScale >= 1.3 ? "100%" : width <= 360 ? 112 : 132;
  const download = updates.available !== null && phase !== "ready";
  const next = phase === "ready" ? updates.downloaded : ["available", "downloading", "error"].includes(phase) ? updates.available : null;
  const code = updates.current.updateId ? updates.current.updateId.slice(0, 8) : updates.current.embedded ? "설치 파일에 포함된 기본 버전" : "확인 불가";
  const backLabel = router.canGoBack() ? "뒤로" : token ? "뒤로, 내 정보" : "뒤로, 로그인";
  const icon = phase === "ready" ? "check-circle" : phase === "error" ? "alert-circle" : phase === "disabled" ? "monitor" : phase === "checking" ? "refresh-cw" : phase === "downloading" || phase === "available" ? "download" : "smartphone";
  const iconColor = phase === "ready" ? theme.success : phase === "error" ? theme.danger : phase === "checking" || phase === "downloading" || phase === "available" ? theme.accent : theme.secondary;
  const iconBackground = phase === "ready" ? theme.successSoft : phase === "error" ? theme.dangerSoft : phase === "checking" || phase === "downloading" || phase === "available" ? theme.accentSoft : theme.surfaceMuted;
  const description = phase === "idle" ? "업데이트 확인을 누르면 새 업데이트가 있을 때 이어서 다운로드해요."
    : phase === "checking" ? "확인하는 동안에도 다른 업무는 계속할 수 있어요."
    : phase === "downloading" ? updates.progress === 1 ? "준비가 확인되면 적용 대기로 바뀌어요." : "다운로드하는 동안에도 다른 업무는 계속할 수 있어요."
    : phase === "disabled" ? "웹·개발 화면에서는 앱 업데이트를 확인하거나 다운로드하지 않습니다."
    : phase === "error" && download ? "다운로드할 업데이트는 그대로 있어요."
    : phase === "ready" && next?.rollback ? "기본 버전으로 되돌리는 업데이트가 준비됐어요. 지금 실행 중인 코드는 그대로예요."
    : phase === "available" && next?.rollback ? "기본 버전으로 되돌리는 업데이트예요." : null;
  const actionLabel = busy ? phase === "downloading" ? "다운로드 중…" : "확인 중…" : download ? phase === "error" ? "다운로드 다시 시도" : "업데이트 다운로드" : phase === "error" ? "업데이트 다시 확인" : "업데이트 확인";
  const row = (label: string, value: string, first = false, muted = false) => <AppUpdatesRow label={label} labelWidth={labelWidth} first={first} muted={muted}>{value}</AppUpdatesRow>;
  return <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: theme.surface }}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={[styles.heading, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <AccountButton label={backLabel} icon="chevron-left" iconOnly style={{ backgroundColor: "transparent" }} onPress={() => router.canGoBack() ? router.back() : router.replace(token ? "/profile" : "/login")} />
      <Text accessibilityRole="header" aria-level={1} style={{ flex: 1, color: theme.text, fontSize: 17, lineHeight: 23, fontWeight: "700" }}>앱 업데이트</Text>
    </View>
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, bottom + 16) }]}>
      <AppUpdatesSection title="현재 상태" extra={`앱 버전 ${Constants.expoConfig?.version ?? "확인 불가"}`}>
        <View style={[styles.status, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <View accessible={false} aria-hidden style={[styles.icon, { backgroundColor: iconBackground }]}><Feather name={icon} size={18} color={iconColor} /></View>
            <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: 6 }}>
              <AppUpdatesStatusTitle ready={phase === "ready"}>{appUpdateTitle(phase, updates.progress)}</AppUpdatesStatusTitle>
              {description ? <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 20 }}>{description}</Text> : null}
            </View>
          </View>
          {phase === "downloading" ? <AppUpdatesProgress progress={updates.progress} /> : null}
          {phase === "error" && updates.error ? <AppUpdatesNotice kind="error">{updates.error}</AppUpdatesNotice> : null}
          {phase === "ready" ? <Text style={[styles.guide, { backgroundColor: theme.surfaceMuted, color: theme.text }]}>작성 중인 내용을 저장한 뒤 앱을 완전히 종료하고 다시 실행하세요. 새 업데이트는 다음 실행에서 적용됩니다.</Text> : null}
          {next ? <AppUpdatesRow label={next.rollback ? "준비된 업데이트" : "새 업데이트 게시 시각"} labelWidth={labelWidth}>{next.rollback ? "기본 버전으로 되돌리기" : formatAppUpdateTime(next.publishedAt)}</AppUpdatesRow> : null}
          {updates.enabled && phase !== "ready" ? <View style={{ gap: 2 }}>
            <AppUpdatesAction label={actionLabel} busy={busy} disabled={busy} onPress={() => void (download ? updates.download() : updates.check())} />
            {download && !busy ? <AppUpdatesAction label="새 업데이트 다시 확인" secondary onPress={() => void updates.check()} /> : null}
          </View> : null}
        </View>
      </AppUpdatesSection>
      <AppUpdatesSection title="현재 적용된 업데이트" extra="지금 실행 중인 코드">
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {updates.current.emergency ? <View style={{ marginTop: 10 }}><AppUpdatesNotice kind="emergency">업데이트를 실행하지 못해 기본 버전으로 복구해 실행했습니다. 네트워크를 확인하고 업데이트를 다시 확인하세요.</AppUpdatesNotice></View> : null}
          {phase === "ready" ? <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 20, marginTop: 10 }}>다운로드한 업데이트는 다음 실행부터 적용돼요. 아래 값은 지금 실행 중인 코드예요.</Text> : null}
          {row("코드 버전", code, true, !updates.current.updateId)}
          {row("게시 시각", formatAppUpdateTime(updates.current.publishedAt), false, !updates.current.publishedAt)}
          {row("이 기기에서 적용 확인", formatAppUpdateTime(updates.observedAt), false, !updates.observedAt)}
          <Text style={[styles.note, { color: theme.secondary, borderTopColor: theme.border }]}>적용 확인은 이 기기에서 이 코드의 실행을 처음 확인한 시각입니다. 실제 설치 시각과 다를 수 있습니다.</Text>
        </View>
      </AppUpdatesSection>
      <AppUpdatesSection title="확인·다운로드 기록">
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {updates.storageError ? <View style={{ marginTop: 10 }}><AppUpdatesNotice kind="storage">{updates.storageError}</AppUpdatesNotice></View> : null}
          {row("최근 확인 시도", formatAppUpdateTime(updates.lastCheckAt), true, !updates.lastCheckAt)}
          {row("최근 다운로드 확인", formatAppUpdateTime(updates.lastDownloadedAt), false, !updates.lastDownloadedAt)}
          <Text style={[styles.note, { color: theme.secondary, borderTopColor: theme.border }]}>확인 시도에는 실패한 시도도 포함됩니다. 다운로드 확인은 다운로드 준비를 확인한 시각입니다.</Text>
        </View>
      </AppUpdatesSection>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 16, maxWidth: 720, width: "100%", alignSelf: "center" },
  heading: { flexDirection: "row", alignItems: "center", gap: 4, padding: 4, paddingRight: 12, minHeight: 52, borderBottomWidth: 1 },
  status: { padding: 14, borderWidth: 1, borderRadius: 16, gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, flexShrink: 0, justifyContent: "center", alignItems: "center" },
  panel: { paddingTop: 4, paddingHorizontal: 14, paddingBottom: 12, borderWidth: 1, borderRadius: 16 },
  guide: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, fontSize: 14, lineHeight: 22, fontWeight: "500" },
  note: { paddingTop: 8, borderTopWidth: 1, fontSize: 12, lineHeight: 18 },
});
