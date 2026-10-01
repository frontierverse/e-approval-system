import { Text, View } from "react-native";
import { useTheme } from "@/lib/theme";

export function PdfPreview(props: { uri: string; token: string }) {
  void props;
  const theme = useTheme();
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.background }}>
    <Text style={{ color: theme.secondary }}>PDF 미리보기는 설치한 모바일 앱에서 제공됩니다.</Text>
  </View>;
}
