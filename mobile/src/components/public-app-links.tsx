import * as Linking from "expo-linking";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/lib/theme";

const links = [
  { label: "개인정보처리방침", url: "https://www.bajaul.com/mobile-app/privacy" },
  { label: "앱 지원", url: "https://www.bajaul.com/mobile-app/support" },
];

export function PublicAppLinks() {
  const theme = useTheme();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const open = async (url: string) => {
    setFailedUrl(null);
    try { await Linking.openURL(url); }
    catch { setFailedUrl(url); }
  };
  return <View style={styles.container}>
    <View style={styles.links}>{links.map(link => <Pressable key={link.url} accessibilityRole="link" accessibilityLabel={link.label} onPress={() => { void open(link.url); }} style={({ pressed }) => [styles.link, pressed && { backgroundColor: theme.surfaceMuted }]}>
      <Text style={[styles.label, { color: theme.secondary }]}>{link.label}</Text>
    </Pressable>)}</View>
    {failedUrl ? <Text selectable accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>페이지를 열지 못했습니다. 브라우저에서 아래 주소를 열어 주세요.{"\n"}{failedUrl}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { marginTop: 12, gap: 4 },
  links: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 8 },
  link: { minHeight: 44, minWidth: 44, justifyContent: "center", paddingHorizontal: 8, paddingVertical: 10, borderRadius: 6 },
  label: { fontSize: 13, lineHeight: 20, textDecorationLine: "underline" },
  error: { fontSize: 13, lineHeight: 20, paddingHorizontal: 8 },
});
