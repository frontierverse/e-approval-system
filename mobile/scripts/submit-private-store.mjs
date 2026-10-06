import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { checkPrivateStore } from "./check-private-store.mjs";

const { values } = parseArgs({ options: { platform: { type: "string" }, id: { type: "string" } } });
if (!["android", "ios"].includes(values.platform) ||
    !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(values.id ?? "")) {
  console.error("--platform android|ios 및 검증한 스토어 빌드의 --id UUID를 지정하세요.");
  process.exit(1);
}
const problems = checkPrivateStore(values.platform);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
const result = spawnSync("npx", ["eas-cli@latest", "submit", "--platform", values.platform,
  "--profile", "private-store", "--id", values.id, "--non-interactive"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "inherit",
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
