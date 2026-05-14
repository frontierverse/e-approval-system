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

const countryLabels: Record<string, string> = {
  KR: "대한민국",
};

const koreaRegionLabels: Record<string, string> = {
  "11": "서울",
  "26": "부산",
  "27": "대구",
  "28": "인천",
  "29": "광주",
  "30": "대전",
  "31": "울산",
  "36": "세종",
  "41": "경기",
  "42": "강원",
  "43": "충북",
  "44": "충남",
  "45": "전북",
  "46": "전남",
  "47": "경북",
  "48": "경남",
  "49": "제주",
  "50": "세종",
  "51": "강원",
  "52": "전북",
  busan: "부산",
  chungbuk: "충북",
  chungnam: "충남",
  daegu: "대구",
  daejeon: "대전",
  gangwon: "강원",
  gwangju: "광주",
  gyeongbuk: "경북",
  gyeonggi: "경기",
  gyeongnam: "경남",
  incheon: "인천",
  jeju: "제주",
  jeonbuk: "전북",
  jeonnam: "전남",
  sejong: "세종",
  seoul: "서울",
  ulsan: "울산",
};

const koreaCityLabels: Record<string, string> = {
  ansan: "안산",
  anseong: "안성",
  anyang: "안양",
  asan: "아산",
  boryeong: "보령",
  bucheon: "부천",
  busan: "부산",
  changwon: "창원",
  cheonan: "천안",
  cheongju: "청주",
  chuncheon: "춘천",
  chungju: "충주",
  daegu: "대구",
  daejeon: "대전",
  dangjin: "당진",
  dongducheon: "동두천",
  donghae: "동해",
  gangneung: "강릉",
  geoje: "거제",
  gimcheon: "김천",
  gimhae: "김해",
  gimje: "김제",
  gimpo: "김포",
  gongju: "공주",
  gumi: "구미",
  gunpo: "군포",
  gunsan: "군산",
  guri: "구리",
  gwacheon: "과천",
  gwangju: "광주",
  gwangmyeong: "광명",
  gwangyang: "광양",
  gyeongju: "경주",
  gyeongsan: "경산",
  gyeryong: "계룡",
  hanam: "하남",
  hwaseong: "화성",
  icheon: "이천",
  iksan: "익산",
  incheon: "인천",
  jecheon: "제천",
  jeju: "제주",
  jeongeup: "정읍",
  jeonju: "전주",
  jinju: "진주",
  mokpo: "목포",
  mungyeong: "문경",
  namwon: "남원",
  namyangju: "남양주",
  naju: "나주",
  nonsan: "논산",
  osan: "오산",
  paju: "파주",
  pohang: "포항",
  pyeongtaek: "평택",
  samcheok: "삼척",
  sangju: "상주",
  sacheon: "사천",
  sejong: "세종",
  seogwipo: "서귀포",
  seosan: "서산",
  seongnam: "성남",
  seoul: "서울",
  siheung: "시흥",
  sokcho: "속초",
  suncheon: "순천",
  suwon: "수원",
  taebaek: "태백",
  tongyeong: "통영",
  uijeongbu: "의정부",
  uiwang: "의왕",
  ulsan: "울산",
  wonju: "원주",
  yangsan: "양산",
  yeongcheon: "영천",
  yeongju: "영주",
  yeosu: "여수",
  yeoju: "여주",
  yongin: "용인",
};

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
  const country = getCountryLabel(location.country);
  const region = getRegionLabel(location.region, country);
  const city = getCityLabel(location.city, country);
  const parts = getUniqueLocationParts([city, region, country]);

  return parts.length > 0
    ? `${parts.join(", ")} · IP 추정`
    : "위치 정보 없음";
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

function getCountryLabel(country?: string | null) {
  const normalized = country?.trim();

  if (!normalized) {
    return null;
  }

  return countryLabels[normalized.toUpperCase()] ?? normalized;
}

function getRegionLabel(region?: string | null, country?: string | null) {
  const normalized = region?.trim();

  if (!normalized) {
    return null;
  }

  if (country === "대한민국" || country?.toUpperCase() === "KR") {
    const lookupKey = getLocationLookupKey(normalized);
    const regionCode = lookupKey.replace(/^kr-/, "");
    const label =
      koreaRegionLabels[lookupKey] ?? koreaRegionLabels[regionCode];

    if (label) {
      return label;
    }

    return /^\d+$/.test(regionCode) ? null : normalized;
  }

  return normalized;
}

function getCityLabel(city?: string | null, country?: string | null) {
  const normalized = city?.trim();

  if (!normalized) {
    return null;
  }

  if (country === "대한민국" || country?.toUpperCase() === "KR") {
    const lookupKey = getLocationLookupKey(normalized).replace(/-si$/, "");

    return koreaCityLabels[lookupKey] ?? normalized;
  }

  return normalized;
}

function getUniqueLocationParts(parts: Array<string | null>) {
  const seen = new Set<string>();
  const uniqueParts: string[] = [];

  for (const part of parts) {
    if (!part) {
      continue;
    }

    const key = part.toLocaleLowerCase("ko-KR");

    if (!seen.has(key)) {
      seen.add(key);
      uniqueParts.push(part);
    }
  }

  return uniqueParts;
}

function getLocationLookupKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
}
