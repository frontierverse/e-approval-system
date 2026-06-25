import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CompanyInfoBoard,
  CompanyInfoSkeleton,
} from "../src/components/company-info-board.tsx";
import type { CompanyInfoData } from "../src/lib/company-info.ts";

const companyInfo = {
  business: {
    activeDepartmentCount: 2,
    activeStaffCount: 2,
    admittedYouthCount: 1,
    appName: "사내 시스템",
    businesses: [
      {
        id: "youth-self-reliance-school",
        address: null,
        name: "사회적협동조합 청소년자립학교",
        registrationNumber: null,
        representative: {
          id: "staff-representative-001",
          name: "안윤숙",
        },
      },
      {
        id: "bajaul-youth-recovery-support-facility",
        address: null,
        name: "바자울 청소년회복지원시설",
        registrationNumber: null,
        representative: {
          id: "staff-representative-001",
          name: "안윤숙",
        },
      },
    ],
    canManageBusinessInfo: false,
    referenceDate: "2026-06-22",
  },
  staff: [
    {
      id: "staff-001",
      name: "김민지",
      email: "staff@example.com",
      birthDate: "1990-03-15",
      hireDate: "2026-01-01",
      departmentName: "바자울",
      positionName: "팀장",
      profileImageStorageKey: null,
      profileImageUpdatedAt: null,
    },
    {
      id: "staff-002",
      name: "박서준",
      email: null,
      birthDate: null,
      hireDate: null,
      departmentName: "법인",
      positionName: "주임",
      profileImageStorageKey: null,
      profileImageUpdatedAt: null,
    },
  ],
  admittedYouths: [
    {
      id: "youth-001",
      name: "최하늘",
      admissionDate: "2026-05-01",
      dischargeDate: null,
      age: 17,
      phone: "010-1111-2222",
    },
  ],
} satisfies CompanyInfoData;

describe("CompanyInfoBoard", () => {
  test("renders business, staff, and admitted youth sections", () => {
    const html = renderToStaticMarkup(
      React.createElement(CompanyInfoBoard, {
        data: companyInfo,
      }),
    );

    assert.match(html, /aria-label="회사 정보"/);
    assert.match(html, /사업자 정보/);
    assert.match(html, /사회적협동조합 청소년자립학교/);
    assert.match(html, /바자울 청소년회복지원시설/);
    assert.equal((html.match(/사회적협동조합 청소년자립학교/g) ?? []).length, 1);
    assert.equal((html.match(/바자울 청소년회복지원시설/g) ?? []).length, 1);
    assert.match(html, /대표자/);
    assert.match(html, /안윤숙/);
    assert.equal((html.match(/안윤숙/g) ?? []).length, 2);
    assert.match(html, /사업자등록번호/);
    assert.match(html, /미등록/);
    assert.match(html, /2026\. 06\. 22\./);
    assert.match(html, /직원 목록/);
    assert.match(html, /재직 직원 2명/);
    assert.match(html, /김민지/);
    assert.match(html, /생년월일/);
    assert.match(html, /1990\. 03\. 15\./);
    assert.match(html, /staff@example\.com/);
    assert.match(html, /박서준/);
    assert.match(html, /입소중 청소년 목록/);
    assert.match(html, /입소중 청소년 1명/);
    assert.match(html, /최하늘/);
    assert.match(html, /17세/);
    assert.match(html, /010-1111-2222/);
  });

  test("renders loading skeleton panels", () => {
    const html = renderToStaticMarkup(React.createElement(CompanyInfoSkeleton));

    assert.match(html, /회사 정보 불러오는 중/);
    assert.match(html, /사업자 정보/);
    assert.match(html, /직원 목록/);
    assert.match(html, /입소중 청소년 목록/);
    assert.match(html, /animate-pulse/);
    assert.match(html, /dark:bg-\[#161b22\]/);
    assert.match(html, /dark:bg-\[#2a3038\]/);
  });

  test("renders business info edit modal triggers for admins", () => {
    const html = renderToStaticMarkup(
      React.createElement(CompanyInfoBoard, {
        data: {
          ...companyInfo,
          business: {
            ...companyInfo.business,
            canManageBusinessInfo: true,
            businesses: companyInfo.business.businesses.map((business) => ({
              ...business,
              address: "서울특별시 테스트로 1",
              registrationNumber: "123-45-67890",
            })),
          },
        },
      }),
    );

    assert.match(html, /123-45-67890/);
    assert.match(html, /서울특별시 테스트로 1/);
    assert.match(html, /aria-haspopup="dialog"/);
    assert.equal((html.match(/aria-haspopup="dialog"/g) ?? []).length, 2);
    assert.match(html, /사업자 정보 수정/);
    assert.doesNotMatch(html, /name="registrationNumber"/);
    assert.doesNotMatch(html, />저장</);
  });
});
