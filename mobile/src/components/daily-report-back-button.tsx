import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/lib/theme";

export function DailyReportBackButton() {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel="업무보고 뒤로"
    onPress={() => router.back()}
    onFocus={() => setFocused(true)}
    onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.button, {
      backgroundColor: pressed || focused ? theme.accentSoft : "transparent",
      borderColor: focused ? theme.accent : "transparent",
    }]}
  >
    <Ionicons name="arrow-back" size={24} color={theme.text} />
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 2, borderRadius: 9 },
});
