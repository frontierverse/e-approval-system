import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminUserManagement } from "../src/components/admin-user-management.tsx";

describe("AdminUserManagement", () => {
  test("renders split staff date fields and birth date labels", () => {
    const html = renderToStaticMarkup(
      React.createElement(AdminUserManagement, {
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
