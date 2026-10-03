import { useLocalSearchParams } from "expo-router";
import { ResourcesScreen } from "@/components/ResourcesScreen";
import { resourceScalar } from "@/lib/resources";
export default function ResourceListRoute() {
    const params = useLocalSearchParams();
    return <ResourcesScreen category={resourceScalar(params.category)} level={resourceScalar(params.level)} q={resourceScalar(params.q)} page={resourceScalar(params.page)} invalidQuery={params.q !== undefined && typeof params.q !== "string"}/>;
}
