import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PublicAppLinks } from "@/components/public-app-links";
import { publicAppInformation } from "@/lib/public-app-information-content";
import { useTheme } from "@/lib/theme";

type Block = { readonly kind: string; readonly text: string; readonly href?: string };

export function PublicAppInformationScreen({ page }: { page: keyof typeof publicAppInformation }) {
  const theme = useTheme(), content = publicAppInformation[page];
  const renderBlock = (block: Block, index: number) => <View key={index} style={styles.block}>
    <Text selectable style={[styles.body, { color: theme.text }, block.kind === "label" && styles.label]}>{block.text}</Text>
    {block.href ? <Text selectable style={[styles.address, { color: theme.secondary }]}>{block.href}</Text> : null}
  </View>;
  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={["top", "bottom"]}>
    <View style={[styles.header, { borderColor: theme.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="이전 화면으로"
        onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/"); }}
        style={({ pressed }) => [styles.back, pressed && { backgroundColor: theme.surfaceMuted }]}
      ><Feather name="chevron-left" size={22} color={theme.text} /></Pressable>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{content.title}</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      {content.intro.map(renderBlock)}
      {content.sections.map(section => <View key={section.title} style={[styles.section, { borderColor: theme.border }]}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
        {section.blocks.map(renderBlock)}
      </View>)}
      <View style={[styles.section, { borderColor: theme.border }]}>
        <Text selectable style={[styles.address, { color: theme.secondary }]}>{content.url}</Text>
        <PublicAppLinks />
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderBottomWidth: 1 },
  back: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 6 },
  title: { flex: 1, fontSize: 18, lineHeight: 26, fontWeight: "700", paddingVertical: 6 },
  content: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, width: "100%", maxWidth: 800, alignSelf: "center" },
  block: { gap: 4 },
  body: { fontSize: 14, lineHeight: 23, flexShrink: 1 },
  label: { fontWeight: "600", marginTop: 4 },
  section: { gap: 8, paddingTop: 12, marginTop: 4, borderTopWidth: 1 },
  sectionTitle: { fontSize: 16, lineHeight: 24, fontWeight: "700" },
  address: { fontSize: 13, lineHeight: 21, flexShrink: 1 },
});
