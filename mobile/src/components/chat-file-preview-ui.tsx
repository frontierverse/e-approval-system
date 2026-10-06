import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, View, type TextStyle } from "react-native";
import { DetailText as Text } from "@/components/document-detail-ui";
import { focusAccountNotice } from "@/components/account-feedback";
import { attachmentFileSize } from "@/lib/attachment-file";
import { useHomeTheme } from "@/lib/home-theme";
import type { ChatAttachment } from "@/lib/types";

export type PreviewFailure = "fetch" | "image" | "selection" | "forbidden" | "deleted" | "unsupported";

export function ChatFilePreviewAction({ label, onPress, primary, disabled, iconOnly }: {
  label: string; onPress: () => void; primary?: boolean; disabled?: boolean; iconOnly?: boolean;
}) {
  const theme = useHomeTheme(), [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => ({
      minWidth: 44, minHeight: iconOnly ? 44 : 48, ...(iconOnly ? { width: 44 } : { paddingHorizontal: 14, paddingVertical: 6 }),
      borderRadius: iconOnly ? 10 : 12, borderWidth: 1, borderColor: focused ? (primary ? theme.text : theme.accent) : iconOnly ? "transparent" : primary ? theme.actionFill : theme.controlBorder,
      backgroundColor: iconOnly ? "transparent" : primary ? theme.actionFill : theme.surface, alignItems: "center", justifyContent: "center", opacity: disabled ? .6 : pressed ? .8 : 1,
    })}>
    {iconOnly ? <Feather name="chevron-left" size={22} color={theme.text} accessible={false} aria-hidden /> : <Text style={{ color: primary ? "#FFFFFF" : theme.text, fontSize: 15, lineHeight: 22, fontWeight: "700", textAlign: "center", flexShrink: 1 }}>{label}</Text>}
  </Pressable>;
}

export function ChatFilePreviewHeader({ backLabel, onBack }: { backLabel: string; onBack: () => void }) {
  const theme = useHomeTheme();
  return <View style={{ backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border }}>
    <View style={{ width: "100%", maxWidth: 760, alignSelf: "center", minHeight: 52, paddingLeft: 4, paddingRight: 12, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
      <ChatFilePreviewAction label={backLabel} iconOnly onPress={onBack} />
      <Text role="heading" aria-level={1} style={{ flex: 1, minWidth: 0, color: theme.text, fontSize: 17, lineHeight: 23, fontWeight: "700" }}>파일 미리보기</Text>
    </View>
  </View>;
}

export function ChatFilePreviewInfo({ file, mimeType }: { file: ChatAttachment; mimeType: string }) {
  const theme = useHomeTheme();
  const format = ({ "application/pdf": "PDF", "image/png": "PNG", "image/jpeg": "JPEG", "image/gif": "GIF", "image/webp": "WebP" } as Record<string, string>)[mimeType] ?? "이미지";
  return <View style={{ backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border }}>
    <View style={{ width: "100%", maxWidth: 760, alignSelf: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 2 }}>
      <Text selectable style={[{ color: theme.text, fontSize: 15, lineHeight: 21, fontWeight: "700" }, Platform.OS === "web" ? { wordBreak: "break-all" } as unknown as TextStyle : undefined]}>{file.originalName}</Text>
      <Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 17.4, fontVariant: ["tabular-nums"] }}>{format} · {attachmentFileSize(file.size).replace(/\.0MB$/, "MB")}</Text>
      <View style={{ marginTop: 2, flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
        <Feather name="info" size={13} color={theme.secondary} style={{ marginTop: 2 }} accessible={false} aria-hidden />
        <Text style={{ flex: 1, color: theme.secondary, fontSize: 12, lineHeight: 17.4 }}>미리보기만으로 수신 완료하거나 원본을 삭제하지 않습니다.</Text>
      </View>
    </View>
  </View>;
}

export function ChatFilePreviewLoading() {
  const theme = useHomeTheme();
  return <View style={{ flex: 1, minHeight: 0, width: "100%", maxWidth: 760, alignSelf: "center", paddingVertical: 12, paddingHorizontal: 16, gap: 12 }}>
    <View role="status" accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <ActivityIndicator size="small" color={theme.secondary} />
      <Text style={{ color: theme.secondary, fontSize: 14, lineHeight: 20.3 }}>미리보기 확인 중</Text>
    </View>
    <View accessible={false} aria-hidden style={{ gap: 8 }}>
      <View style={{ width: "58%", height: 14, borderRadius: 7, backgroundColor: theme.surfaceMuted }} />
      <View style={{ width: "30%", height: 11, borderRadius: 6, backgroundColor: theme.surfaceMuted }} />
    </View>
    <View accessible={false} aria-hidden style={{ flex: 1, minHeight: 0, borderRadius: 12, backgroundColor: theme.surfaceMuted }} />
  </View>;
}

export function ChatFilePreviewFeedback({ error, failure, children }: { error: string; failure: PreviewFailure; children: ReactNode }) {
  const theme = useHomeTheme();
  const summary = useRef<View>(null);
  useEffect(() => { focusAccountNotice(summary.current); }, [error]);
  const title = {
    fetch: "미리보기를 불러오지 못했어요", image: "이미지를 표시하지 못했어요", selection: "미리볼 파일 정보가 없어요",
    forbidden: "이 파일에 접근할 수 없습니다", deleted: "원본이 삭제되어 미리볼 수 없습니다", unsupported: "안전하게 미리볼 수 없는 파일입니다",
  }[failure];
  const icon = failure === "forbidden" ? "lock" : ["selection", "deleted", "unsupported"].includes(failure) ? "file" : "alert-circle";
  const detail = failure === "forbidden" ? "권한이 없어 미리볼 수 없어요. 대화로 돌아가 주세요."
    : failure === "deleted" ? "대화의 파일 작업에서 원본 상태를 확인하세요." : error;
  return <View style={{ width: "100%", maxWidth: 760, alignSelf: "center", padding: 16 }}>
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, padding: 16, gap: 12 }}>
      <View ref={summary} accessible tabIndex={-1} accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <Feather name={icon} size={22} color={failure === "fetch" || failure === "image" ? theme.danger : theme.secondary} style={{ marginTop: 1 }} accessible={false} aria-hidden />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: theme.text, fontSize: 16, lineHeight: 22.4, fontWeight: "700" }}>{title}</Text>
          <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19.5 }}>{detail}</Text>
        </View>
      </View>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  </View>;
}

export function ChatFilePreviewWebPdf() {
  const theme = useHomeTheme();
  return <View role="note" style={{ width: "100%", maxWidth: 792, alignSelf: "center", padding: 16 }}>
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, padding: 16, flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <Feather name="smartphone" size={22} color={theme.secondary} accessible={false} aria-hidden />
      <Text style={{ flex: 1, color: theme.text, fontSize: 15, lineHeight: 22.5 }}>PDF 미리보기는 설치한 모바일 앱에서 제공됩니다.</Text>
    </View>
  </View>;
}
