import { useEffect, useRef } from "react";
import { AccessibilityInfo, Platform, Text, View } from "react-native";
import { useTheme } from "@/lib/theme";

export function focusAccountNotice(target: View | null) {
  if (!target) return;
  if (Platform.OS === "web") target.focus();
  else AccessibilityInfo.sendAccessibilityEvent(target, "focus");
}

export function AccountFeedback({ error, message }: { error?: string | null; message?: string | null }) {
  const theme = useTheme();
  const summary = useRef<View>(null);
  useEffect(() => { if (error) focusAccountNotice(summary.current); }, [error]);
  if (error) return <View ref={summary} accessible tabIndex={-1} accessibilityRole="alert" style={{ marginTop: 8 }}>
    <Text style={{ color: theme.danger, fontSize: 13, lineHeight: 20 }}>{error}</Text>
  </View>;
  return message ? <Text accessibilityLiveRegion="polite" style={{ color: theme.success, fontSize: 13, lineHeight: 20, marginTop: 8 }}>{message}</Text> : null;
}
