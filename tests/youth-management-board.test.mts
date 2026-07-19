import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { YouthManagementBoard } from "../src/components/youth-management-board.tsx";
import type { YouthProfile } from "../src/lib/youth-management-core.ts";

const youths: YouthProfile[] = [
  {
    id: "youth-test-001",
    name: "김하늘",
    admissionDate: "2026-05-01",
    dischargeDate: "2026-12-31",
    birthDate: "2009-06-10",
    age: 17,
    phone: "010-1111-2222",
    decisionDocuments: [],
    familyContacts: [
      {
        id: "family-contact-test-001",
        relationship: "어머니",
        phone: "010-3333-4444",
      },
      {
        id: "family-contact-test-002",
        relationship: "아버지",
        phone: "010-7777-8888",
      },
    ],
    notes: [
      {
        id: "note-test-001",
        title: "등원 후 컨디션 저하",
        summary: "오전 프로그램 시작 전 피로감을 호소했습니다.",
        detail: "휴식 후 활동에 참여했습니다.",
        category: "가족",
        recordedAt: "2026-05-28",
        author: "박서연",
        priority: "보통",
      },
    ],
    updatedAt: "2026-06-21T12:45:00.000Z",
  },
  {
    id: "youth-test-002",
    name: "이도현",
    admissionDate: null,
    dischargeDate: null,
    birthDate: null,
    age: null,
    phone: null,
    decisionDocuments: [],
    familyContacts: [],
    notes: [],
    updatedAt: "2026-06-20T09:00:00.000Z",
  },
];

describe("YouthManagementBoard", () => {
  test("renders youth tabs and the active youth's special note cards", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthManagementBoard, {
        createYouth: async (name) => ({
          ok: true,
          data: {
            youth: {
              id: "created-youth",
              name: name.name,
              admissionDate: name.admissionDate || null,
              dischargeDate: name.dischargeDate || null,
              birthDate: name.birthDate || null,
              age: name.birthDate ? 17 : null,
              phone: name.phone || null,
              familyContacts: name.familyContacts.map((contact, index) => ({
                id: `created-family-contact-${index}`,
                relationship: contact.relationship || null,
                phone: contact.phone || null,
              })),
              decisionDocuments: [],
              notes: [],
              updatedAt: "2026-06-22T01:00:00.000Z",
            },
          },
        }),
        deleteYouthNote: async (noteId) => ({
          ok: true,
          data: { noteId, youthId: "youth-test-001" },
        }),
        initialYouths: youths,
        updateYouth: async (_youthId, values) => ({
          ok: true,
          data: {
            youth: {
              id: "youth-test-001",
              name: values.name,
              admissionDate: values.admissionDate || null,
              dischargeDate: values.dischargeDate || null,
              birthDate: values.birthDate || null,
              age: values.birthDate ? 17 : null,
              phone: values.phone || null,
              familyContacts: values.familyContacts.map((contact, index) => ({
                id: `updated-family-contact-${index}`,
                relationship: contact.relationship || null,
                phone: contact.phone || null,
              })),
              decisionDocuments: [],
              notes: [],
              updatedAt: "2026-06-22T02:00:00.000Z",
            },
          },
        }),
        updateYouthNote: async (_noteId, values) => ({
          ok: true,
          data: { note: { id: "note-test-001", ...values } },
        }),
      }),
    );

    assert.match(html, /청소년별 특이사항/);
    assert.match(html, /role="tablist"/);
    assert.match(html, />등록</);
    assert.match(html, /김하늘/);
    assert.match(html, /이도현/);
    assert.match(html, /입소 날짜/);
    assert.match(html, /퇴소까지/);
    assert.match(html, /기본 정보 수정/);
    assert.match(html, /가족 연락처/);
    assert.match(html, /010-3333-4444/);
    assert.match(html, /010-7777-8888/);
    assert.match(html, /등원 후 컨디션 저하/);
    assert.doesNotMatch(html, /등록된 특이사항이 없습니다/);
  });
});
