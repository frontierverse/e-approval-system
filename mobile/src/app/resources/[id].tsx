import { useLocalSearchParams } from "expo-router";
import { ResourceDetailScreen } from "@/components/ResourceDetailScreen";
import { resourceScalar } from "@/lib/resources";
export default function ResourceDetailRoute() { const { id } = useLocalSearchParams(); return <ResourceDetailScreen id={resourceScalar(id) ?? ""}/>; }
