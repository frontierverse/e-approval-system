import { useLocalSearchParams } from "expo-router";
import { ResourceEditor } from "@/components/ResourceEditor";
import { resourceScalar } from "@/lib/resources";
export default function ResourceEditRoute() { const { id } = useLocalSearchParams(); return <ResourceEditor id={resourceScalar(id) ?? ""}/>; }
