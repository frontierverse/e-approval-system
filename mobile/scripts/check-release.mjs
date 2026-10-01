import { readFileSync } from "node:fs";

const profile = process.env.EAS_BUILD_PROFILE ?? "preview";
if (profile === "development") process.exit(0);

const problems = [];
const value = process.env.EXPO_PUBLIC_API_URL?.trim();
let url;
try { url = new URL(value ?? ""); } catch { /* Report below. */ }
if (!url || url.protocol !== "https:") {
  problems.push("EXPO_PUBLIC_API_URL에 실제 HTTPS 서버 주소를 설정하세요.");
} else {
  const host = url.hostname;
  if (/^(localhost|\[::1\])$/.test(host) || host.startsWith("127.") ||
      /(^|\.)(example\.(com|net|org)|localhost)$/.test(host)) {
    problems.push("예시 주소나 localhost로 테스트·운영 앱을 빌드할 수 없습니다.");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    problems.push("서버 주소는 경로·쿼리·인증 정보가 없는 HTTPS origin을 사용하세요.");
  }
}

const { expo } = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"));
if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(expo.extra?.eas?.projectId ?? "")) {
  problems.push("EAS 프로젝트를 먼저 연결하세요: npx eas-cli@latest init");
}
if (!expo.ios?.bundleIdentifier || !expo.android?.package) {
  problems.push("iOS bundleIdentifier와 Android package가 필요합니다.");
}
if (process.env.EAS_BUILD_PLATFORM !== "ios") {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim() ||
    new URL("../google-services.json", import.meta.url);
  try {
    const firebase = JSON.parse(readFileSync(googleServicesFile, "utf8"));
    const matchingClient = firebase.client?.find((client) =>
      client.client_info?.android_client_info?.package_name === expo.android?.package);
    if (!firebase.project_info?.project_number || !matchingClient?.client_info?.mobilesdk_app_id) {
      problems.push("Firebase Android 앱의 package가 app.json과 일치해야 합니다.");
    }
    if (firebase.private_key || firebase.type === "service_account") {
      problems.push("GOOGLE_SERVICES_JSON에는 서비스 계정 비밀 키가 아닌 Android 앱 설정 파일을 사용하세요.");
    }
  } catch {
    problems.push("Android 푸시 등록에 필요한 google-services.json 또는 GOOGLE_SERVICES_JSON 파일 변수를 설정하세요.");
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("모바일 릴리스 설정 확인 완료 (" + profile + ")");
