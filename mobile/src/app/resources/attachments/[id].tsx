import { useLocalSearchParams } from "expo-router";
import { ResourceAttachmentScreen } from "@/components/ResourceAttachmentScreen";
import { resourceScalar } from "@/lib/resources";
export default function ResourceAttachmentRoute() { const { id } = useLocalSearchParams(); return <ResourceAttachmentScreen id={resourceScalar(id) ?? ""}/>; }
