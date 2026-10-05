import { useLocalSearchParams } from "expo-router";
import { DocumentDetailScreen } from "@/components/document-detail-screen";

export default function DocumentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DocumentDetailScreen key={id} id={id} />;
}
