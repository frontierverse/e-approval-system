import { existsSync } from "node:fs";
import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  // EAS file variables become paths on the build runner. Local development can
  // use the ignored Firebase app configuration beside app.json.
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim() ||
    (existsSync("./google-services.json") ? "./google-services.json" : undefined);

  return {
    ...config,
    name: config.name ?? "바자울",
    slug: config.slug ?? "gyeoljaeon",
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
