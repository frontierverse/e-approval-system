import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  YouthRosterBoard,
  YouthRosterSkeleton,
} from "../src/components/youth-roster-board.tsx";
import type { YouthRosterData } from "../src/lib/youth-roster.ts";
import type {
  YouthCreateInput,
  YouthUpdateInput,
} from "../src/lib/youth-management-core.ts";

const roster = {
  referenceDate: "2026-06-22",
  admittedYouths: [
    {
      id: "youth-admitted-001",
      name: "김하늘",
      admissionDate: "2026-05-01",
      dischargeDate: null,
      age: 17,
      phone: "010-1111-2222",
      familyContacts: [
        {
          id: "family-contact-001",
          relationship: "어머니",
          phone: "010-3333-4444",
        },
      ],
    },
  ],
  dischargedYouths: [
    {
      id: "youth-discharged-001",
      name: "이도현",
      admissionDate: "2025-01-10",
      dischargeDate: "2026-04-30",
      age: 18,
      phone: null,
      familyContacts: [],
    },
  ],
} satisfies YouthRosterData;

const rosterActions = {
  createYouth: async (values: YouthCreateInput) => ({
    ok: true,
    data: {
      youth: {
        id: "created-youth",
        name: values.name,
        admissionDate: values.admissionDate || null,
        dischargeDate: values.dischargeDate || null,
        age: values.age ? Number(values.age) : null,
        phone: values.phone || null,
        familyContacts: values.familyContacts.map((contact, index) => ({
          id: `created-family-contact-${index}`,
          relationship: contact.relationship || null,
          phone: contact.phone || null,
        })),
        notes: [],
      },
    },
  }),
  updateYouth: async (_youthId: string, values: YouthUpdateInput) => ({
    ok: true,
    data: {
      youth: {
        id: _youthId,
        name: values.name,
        admissionDate: values.admissionDate || null,
        dischargeDate: values.dischargeDate || null,
        age: values.age ? Number(values.age) : null,
        phone: values.phone || null,
        familyContacts: values.familyContacts.map((contact, index) => ({
          id: `updated-family-contact-${index}`,
          relationship: contact.relationship || null,
          phone: contact.phone || null,
        })),
        notes: [],
      },
    },
  }),
};

describe("YouthRosterBoard", () => {
  test("renders admitted and discharged youth roster tables", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthRosterBoard, {
        ...rosterActions,
        data: roster,
      }),
    );

    assert.match(html, /aria-label="청소년 명단"/);
    assert.match(html, /기준일/);
    assert.match(html, /2026\. 06\. 22\./);
    assert.match(html, /입소중인 청소년 목록/);
    assert.match(html, /퇴소 청소년 목록/);
    assert.match(html, />청소년 추가</);
    assert.match(html, /김하늘/);
    assert.match(html, /김하늘 정보 수정/);
    assert.match(html, /17세/);
    assert.match(html, /입소중/);
    assert.match(html, /010-1111-2222/);
    assert.match(html, /어머니/);
    assert.match(html, /010-3333-4444/);
    assert.match(html, /이도현/);
    assert.match(html, /이도현 정보 수정/);
    assert.match(html, /2026\. 04\. 30\./);
    assert.match(html, /미등록/);
    assert.equal((html.match(/aria-haspopup="dialog"/g) ?? []).length, 3);
    assert.doesNotMatch(html, /name="name"/);
    assert.doesNotMatch(html, />저장</);
  });

  test("renders empty roster states", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthRosterBoard, {
        ...rosterActions,
        data: {
          referenceDate: "2026-06-22",
          admittedYouths: [],
          dischargedYouths: [],
        },
      }),
    );

    assert.match(html, /입소중인 청소년이 없습니다/);
    assert.match(html, /퇴소 청소년이 없습니다/);
  });

  test("renders loading skeleton panels", () => {
    const html = renderToStaticMarkup(React.createElement(YouthRosterSkeleton));

    assert.match(html, /청소년 명단 불러오는 중/);
    assert.match(html, /입소중인 청소년 목록/);
    assert.match(html, /퇴소 청소년 목록/);
    assert.match(html, /animate-pulse/);
  });
});
