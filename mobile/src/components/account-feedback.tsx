import { useEffect, useRef } from "react";
import { AccessibilityInfo, Platform, View } from "react-native";
import { useHomeTheme } from "@/lib/home-theme";
import { DetailText as Text } from "./document-detail-ui";

export function focusAccountNotice(target: View | null) {
  if (!target) return;
  if (Platform.OS === "web") target.focus();
  else AccessibilityInfo.sendAccessibilityEvent(target, "focus");
}

export function AccountFeedback({ error, message }: { error?: string | null; message?: string | null }) {
  const theme = useHomeTheme();
  const summary = useRef<View>(null);
  useEffect(() => { if (error) focusAccountNotice(summary.current); }, [error]);
  if (error) return <View ref={summary} accessible tabIndex={-1} accessibilityRole="alert" style={{ padding: 10, borderRadius: 10, backgroundColor: theme.dangerSoft }}>
    <Text style={{ color: theme.danger, fontSize: 13, lineHeight: 20 }}>{error}</Text>
  </View>;
  return message ? <Text accessibilityLiveRegion="polite" style={{ color: theme.success, fontSize: 13, lineHeight: 20 }}>{message}</Text> : null;
}
