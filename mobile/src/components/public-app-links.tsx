import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/lib/theme";

const links = [
  { label: "개인정보처리방침", route: "/public-information/privacy" },
  { label: "앱 지원", route: "/public-information/support" },
] as const;

export function PublicAppLinks() {
  const theme = useTheme();
  return <View style={styles.links}>{links.map(link => <Pressable
    key={link.route} accessibilityRole="link" accessibilityLabel={link.label}
    onPress={() => router.push(link.route)}
    style={({ pressed }) => [styles.link, pressed && { backgroundColor: theme.surfaceMuted }]}
  >
    <Text style={[styles.label, { color: theme.secondary }]}>{link.label}</Text>
  </Pressable>)}</View>;
}

const styles = StyleSheet.create({
  links: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 8 },
  link: { minHeight: 44, minWidth: 44, justifyContent: "center", paddingHorizontal: 8, paddingVertical: 10, borderRadius: 6 },
  label: { fontSize: 13, lineHeight: 20, textDecorationLine: "underline" },
});
