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
  });
});
