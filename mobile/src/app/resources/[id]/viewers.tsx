import { useLocalSearchParams } from "expo-router";
import { ResourceViewersScreen } from "@/components/ResourceViewersScreen";
import { resourceScalar } from "@/lib/resources";
export default function ResourceViewersRoute() { const { id } = useLocalSearchParams(); return <ResourceViewersScreen id={resourceScalar(id) ?? ""}/>; }
