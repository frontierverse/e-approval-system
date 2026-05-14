export type LoginFailureReason =
  | "missing_credentials"
  | "invalid_credentials"
  | "inactive_user"
  | "no_password";

export type LoginRequestInfo = {
  ipAddress: string | null;
  userAgent: string | null;
  browser: string | null;
  os: string | null;
  device: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
};

type HeaderReader = {
  get(name: string): string | null;
};

const maxHeaderLength = 1000;

export function getLoginRequestInfo(headers: HeaderReader): LoginRequestInfo {
  const userAgent = normalizeHeaderValue(headers.get("user-agent"), maxHeaderLength);
  const clientHintsPlatform = normalizeHeaderValue(
    headers.get("sec-ch-ua-platform"),
    80,
  );
  const userAgentInfo = getUserAgentInfo(userAgent, clientHintsPlatform);

  return {
    ipAddress: getClientIp(headers),
    userAgent,
    ...userAgentInfo,
    ...getRequestLocation(headers),
  };
}

export function getLoginFailureReasonLabel(
  reason?: string | null,
): string {
  const labels: Record<LoginFailureReason, string> = {
    missing_credentials: "이름/비밀번호 미입력",
    invalid_credentials: "이름 또는 비밀번호 불일치",
    inactive_user: "비활성 계정",
    no_password: "비밀번호 미설정",
  };

  return reason && reason in labels
    ? labels[reason as LoginFailureReason]
    : "알 수 없음";
}

export function getLoginLocationLabel(location: {
  country?: string | null;
  region?: string | null;
  city?: string | null;
}) {
  const parts = [location.city, location.region, location.country]
    .map((part) => part?.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : "위치 정보 없음";
}

function getClientIp(headers: HeaderReader) {
  const directIp =
    getFirstForwardedIp(headers.get("x-forwarded-for")) ??
    normalizeHeaderValue(headers.get("x-real-ip"), 80) ??
    normalizeHeaderValue(headers.get("cf-connecting-ip"), 80) ??
    normalizeHeaderValue(headers.get("true-client-ip"), 80) ??
    getForwardedHeaderIp(headers.get("forwarded"));

  return directIp ? stripIpPort(directIp) : null;
}

function getRequestLocation(headers: HeaderReader) {
  return {
    country:
      normalizeLocationHeader(headers.get("x-vercel-ip-country")) ??
      normalizeLocationHeader(headers.get("cf-ipcountry")) ??
      normalizeLocationHeader(headers.get("x-appengine-country")),
    region:
      normalizeLocationHeader(headers.get("x-vercel-ip-country-region")) ??
      normalizeLocationHeader(headers.get("x-vercel-ip-region")) ??
      normalizeLocationHeader(headers.get("x-appengine-region")),
    city:
      normalizeLocationHeader(headers.get("x-vercel-ip-city")) ??
      normalizeLocationHeader(headers.get("x-appengine-city")),
  };
}

function getUserAgentInfo(
  userAgent: string | null,
  clientHintsPlatform: string | null,
) {
  if (!userAgent) {
    return {
      browser: null,
      os: normalizeClientHintsPlatform(clientHintsPlatform),
      device: null,
    };
  }

  const lower = userAgent.toLowerCase();

  return {
    browser: getBrowserLabel(userAgent),
    os: getOsLabel(userAgent, clientHintsPlatform),
    device: lower.includes("ipad") || lower.includes("tablet")
      ? "태블릿"
      : lower.includes("mobile") ||
          lower.includes("iphone") ||
          lower.includes("android")
        ? "모바일"
        : "데스크톱",
  };
}

function getBrowserLabel(userAgent: string) {
  const browserMatchers: Array<[RegExp, string]> = [
    [/Whale\/([\d.]+)/, "Whale"],
    [/Edg\/([\d.]+)/, "Edge"],
    [/SamsungBrowser\/([\d.]+)/, "Samsung Internet"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/Chrome\/([\d.]+)/, "Chrome"],
    [/Firefox\/([\d.]+)/, "Firefox"],
    [/Version\/([\d.]+).*Safari\//, "Safari"],
  ];

  for (const [matcher, label] of browserMatchers) {
    const match = userAgent.match(matcher);

    if (match?.[1]) {
      return `${label} ${getMajorVersion(match[1])}`;
    }
  }

  return "알 수 없는 브라우저";
}

function getOsLabel(userAgent: string, clientHintsPlatform: string | null) {
  const lower = userAgent.toLowerCase();

  if (lower.includes("windows")) {
    return "Windows";
  }

  if (lower.includes("iphone") || lower.includes("ipad")) {
    return "iOS";
  }

  if (lower.includes("mac os x") || lower.includes("macintosh")) {
    return "macOS";
  }

  if (lower.includes("android")) {
    return "Android";
  }

  if (lower.includes("linux")) {
    return "Linux";
  }

  return normalizeClientHintsPlatform(clientHintsPlatform) ?? "알 수 없는 OS";
}

function normalizeClientHintsPlatform(value: string | null) {
  return value?.replace(/^"|"$/g, "").trim() || null;
}

function getMajorVersion(version: string) {
  return version.split(".")[0] ?? version;
}

function getFirstForwardedIp(value: string | null) {
  return normalizeHeaderValue(value?.split(",")[0] ?? null, 80);
}

function getForwardedHeaderIp(value: string | null) {
  const normalized = normalizeHeaderValue(value, 400);
  const match = normalized?.match(/for="?([^;,\"]+)/i);

  return match?.[1] ? normalizeHeaderValue(match[1], 80) : null;
}

function stripIpPort(value: string) {
  const normalized = value.trim().replace(/^\[/, "").replace(/\]$/, "");

  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(normalized)) {
    return normalized.slice(0, normalized.lastIndexOf(":"));
  }

  return normalized;
}

function normalizeLocationHeader(value: string | null) {
  const normalized = normalizeHeaderValue(value, 100);

  if (!normalized) {
    return null;
  }

  try {
    return decodeURIComponent(normalized.replace(/\+/g, " "));
  } catch {
    return normalized;
  }
}

function normalizeHeaderValue(value: string | null | undefined, maxLength: number) {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength
    ? normalized.slice(0, maxLength)
    : normalized;
}
