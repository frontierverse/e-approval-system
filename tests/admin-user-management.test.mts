import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminUserManagement } from "../src/components/admin-user-management.tsx";
import { getStaffEmploymentStatus, getStaffEmploymentToday } from "../src/lib/staff-employment.ts";

type StaffProps = React.ComponentProps<typeof AdminUserManagement>;
const referenceData = {
  today: "2026-10-01",
  departments: [{ id: "department-001", isActive: true, name: "바자울" }],
  positions: [{ id: "position-001", isActive: true, level: 3, name: "팀장" }],
};

function staff(overrides: Partial<StaffProps["users"][number]> = {}): StaffProps["users"][number] {
  return {
    id: "staff", name: "검증 직원", email: null, role: "USER", status: "ACTIVE",
    canViewYouthDetails: false, canViewYouthContacts: false,
    canDownloadYouthDocuments: false, canManageYouth: false,
    birthDate: null, hireDate: null, resignationDate: null,
    profileImageStorageKey: null, profileImageUpdatedAt: null,
    departmentId: "department-001", positionId: "position-001",
    department: { name: "바자울" }, position: { name: "팀장" },
    _count: { approvalSteps: 0, draftedDocuments: 0 },
    ...overrides,
  };
}

describe("AdminUserManagement", () => {
  test("separates employment by resignation date regardless of account activation", () => {
    const html = renderToStaticMarkup(React.createElement(AdminUserManagement, {
      ...referenceData,
      users: [
        staff({ id: "inactive", name: "계정중지재직자", status: "INACTIVE" }),
        staff({ id: "future", name: "퇴사예정직원", resignationDate: "2026-10-02" }),
        staff({ id: "past", name: "과거퇴사직원", resignationDate: "2026-09-30" }),
        staff({ id: "today", name: "당일퇴사직원", resignationDate: "2026-10-01" }),
      ],
    }));
    assert.match(html, /재직자<span[^>]*>2명/);
    assert.match(html, /퇴사자<span[^>]*>2명/);
    assert.match(html, /aria-pressed="true"/);
    assert.match(html, /aria-label="재직자 목록"/);
    assert.match(html, /계정중지재직자/);
    assert.match(html, /계정 비활성/);
    assert.match(html, /퇴사 예정 2026\. 10\. 02\./);
    assert.doesNotMatch(html, /과거퇴사직원|당일퇴사직원/);
    assert.ok(html.indexOf("직원 목록") < html.indexOf("직원 추가"));
  });

  test("shows both zero counts and a compact empty state", () => {
    const html = renderToStaticMarkup(React.createElement(AdminUserManagement, {
      ...referenceData, users: [],
    }));
    assert.match(html, /재직자<span[^>]*>0명/);
    assert.match(html, /퇴사자<span[^>]*>0명/);
    assert.match(html, /재직자가 없습니다/);
    assert.match(html, /role="status"/);
  });

  test("uses the Korean date boundary and keeps future resignations employed", () => {
    assert.equal(getStaffEmploymentToday(new Date("2026-09-30T14:59:59Z")), "2026-09-30");
    const today = getStaffEmploymentToday(new Date("2026-09-30T15:00:00Z"));
    assert.equal(today, "2026-10-01");
    assert.equal(getStaffEmploymentStatus(null, today), "employed");
    assert.equal(getStaffEmploymentStatus("2026-09-30", today), "resigned");
    assert.equal(getStaffEmploymentStatus("2026-10-01", today), "resigned");
    assert.equal(getStaffEmploymentStatus("2026-10-02", today), "resigning");
  });

  test("renders split staff date fields and birth date labels", () => {
    const html = renderToStaticMarkup(
      React.createElement(AdminUserManagement, {
        today: "2026-10-01",
        departments: [
          {
            id: "department-001",
            isActive: true,
            name: "바자울",
          },
        ],
        positions: [
          {
            id: "position-001",
            isActive: true,
            level: 3,
            name: "팀장",
          },
        ],
        users: [
          {
            id: "user-001",
            name: "김민지",
            email: "staff@example.com",
            role: "USER",
            status: "ACTIVE",
            canViewYouthDetails: true,
            canViewYouthContacts: false,
            canDownloadYouthDocuments: true,
            canManageYouth: false,
            birthDate: "1990-03-15",
            hireDate: "2026-01-01",
            resignationDate: null,
            profileImageStorageKey: null,
            profileImageUpdatedAt: null,
            departmentId: "department-001",
            positionId: "position-001",
            department: {
              name: "바자울",
            },
            position: {
              name: "팀장",
            },
            _count: {
              approvalSteps: 2,
              draftedDocuments: 1,
            },
          },
        ],
      }),
    );

    assert.match(html, /직원 추가/);
    assert.match(html, /TAB키를 사용하여 입력칸 이동 가능/);
    assert.match(html, /생년월일 1990\. 03\. 15\./);
    assert.match(html, /name="birthDate"/);
    assert.match(html, /name="hireDate"/);
    assert.match(html, /name="resignationDate"/);
    assert.match(html, /aria-label="생년월일 년"/);
    assert.match(html, /aria-label="입사일 월"/);
    assert.match(html, /aria-label="퇴사일 일"/);
    assert.match(html, /청소년 정보 권한/);
    assert.match(html, /업무에 필요한 권한만 선택하세요/);
    assert.match(html, /name="canViewYouthDetails"/);
    assert.match(html, /name="canViewYouthContacts"/);
    assert.match(html, /name="canDownloadYouthDocuments"/);
    assert.match(html, /name="canManageYouth"/);
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, 4);
    assert.doesNotMatch(html, /type="checkbox"[^>]*checked/);
  });
});
