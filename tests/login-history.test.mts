import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getLoginFailureReasonLabel,
  getLoginLocationLabel,
  getLoginRequestInfo,
} from "../src/lib/login-history-core.ts";

describe("login history", () => {
  test("extracts request info from forwarding and platform headers", () => {
    const info = getLoginRequestInfo(
      new Headers({
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
        "x-forwarded-for": "203.0.113.7, 10.0.0.1",
        "x-vercel-ip-country": "KR",
        "x-vercel-ip-country-region": "Seoul",
        "x-vercel-ip-city": "Seoul",
      }),
    );

    assert.equal(info.ipAddress, "203.0.113.7");
    assert.equal(info.browser, "Chrome 126");
    assert.equal(info.os, "Windows");
    assert.equal(info.device, "데스크톱");
    assert.equal(getLoginLocationLabel(info), "Seoul / Seoul / KR");
  });

  test("labels login failure reasons", () => {
    assert.equal(
      getLoginFailureReasonLabel("invalid_credentials"),
      "이름 또는 비밀번호 불일치",
    );
    assert.equal(getLoginFailureReasonLabel("inactive_user"), "비활성 계정");
    assert.equal(getLoginFailureReasonLabel(null), "알 수 없음");
  });
});
