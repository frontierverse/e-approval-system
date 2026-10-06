import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const platforms = ["android", "ios"];
const hasOrganizationIds = (ids) => Array.isArray(ids) && ids.length > 0 &&
  ids.every((id) => typeof id === "string" && id.trim() === id && id.length > 0 &&
    !/placeholder|example|your[-_ ]|todo|pending/i.test(id)) &&
  new Set(ids).size === ids.length;

// Console confirmation is an operator record, not an API verification of store visibility.
export function privateStoreProblems(targets, eas, platform = "all") {
  if (![...platforms, "all"].includes(platform)) return ["platform은 android, ios, all 중 하나여야 합니다."];
  const problems = [];
  const build = eas?.build?.["private-store"];
  const base = eas?.build?.production;
  if (build?.extends !== "production" || build?.distribution !== "store" ||
      (build.channel ?? base?.channel) !== "production" ||
      (build.environment ?? base?.environment) !== "production") {
    problems.push("private-store 빌드는 production 채널·환경의 store 배포여야 합니다.");
  }
  for (const selected of platform === "all" ? platforms : [platform]) {
    const target = targets?.[selected];
    const expected = selected === "android" ? "managed-google-play-private" : "apple-custom-app-private";
    if (target?.distribution !== expected) problems.push(`${selected}: 직원 전용 비공개 배포 방식이 필요합니다.`);
    if (!hasOrganizationIds(target?.organizationIds)) problems.push(`${selected}: 확인된 회사 조직 ID를 입력하세요.`);
    if (target?.consolePrivateDistributionConfirmed !== true) {
      problems.push(`${selected}: 실제 스토어 콘솔에서 비공개 배포와 대상 조직을 먼저 확인하세요.`);
    }
    if (selected === "android") {
      if (build?.android?.buildType !== "app-bundle") problems.push("android: 스토어용 AAB 빌드가 필요합니다.");
      const submit = eas?.submit?.["private-store"]?.android;
      if (submit?.track !== "production" || submit?.releaseStatus !== "draft") {
        problems.push("android: 비공개 운영 트랙의 draft 제출만 허용합니다.");
      }
    } else {
      const appId = target?.appStoreConnectAppId;
      if (typeof appId !== "string" || !/^\d+$/.test(appId) ||
          eas?.submit?.["private-store"]?.ios?.ascAppId !== appId) {
        problems.push("ios: 실제 App Store Connect 앱 ID를 targets와 eas.json의 ascAppId에 동일하게 설정하세요.");
      }
    }
  }
  return problems;
}

export function checkPrivateStore(platform = "all") {
  const targets = JSON.parse(readFileSync(new URL("../private-store.json", import.meta.url), "utf8"));
  const eas = JSON.parse(readFileSync(new URL("../eas.json", import.meta.url), "utf8"));
  return privateStoreProblems(targets, eas, platform);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkPrivateStore(process.argv[2]);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("비공개 스토어 제출 설정 확인 완료. 최종 설치 대상은 스토어 콘솔에서 확인합니다.");
  }
}
