import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  YouthRosterBoard,
  YouthRosterFormModal,
  YouthRosterSkeleton,
} from "../src/components/youth-roster-board.tsx";
import type {
  YouthRosterChangeLog,
  YouthRosterChangeLogFilters,
  YouthRosterData,
} from "../src/lib/youth-roster.ts";
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
      birthDate: "2009-06-10",
      initialDischargeDate: "2026-07-15",
      dischargeDate: "2026-07-15",
      dischargeExtensions: [],
      age: 17,
      koreanAge: 18,
      phone: "010-1111-2222",
      decisionDocuments: [
        {
          id: "decision-document-001",
          originalName: "김하늘_결정문.pdf",
          size: 204800,
          createdAt: "2026-05-01T09:00:00.000Z",
        },
      ],
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
      birthDate: "2008-04-20",
      initialDischargeDate: "2026-04-30",
      dischargeDate: "2026-04-30",
      dischargeExtensions: [],
      age: 18,
      koreanAge: 19,
      phone: null,
      decisionDocuments: [],
      familyContacts: [],
    },
  ],
} satisfies YouthRosterData;

const changeLogs: YouthRosterChangeLog[] = [
  {
    id: "log-001",
    action: "CREATE_YOUTH",
    targetType: "Youth",
    targetId: "youth-admitted-001",
    message: "created roster item",
    metadata: {},
    createdAt: "2026-06-22T09:30:00.000Z",
    actor: {
      id: "user-001",
      name: "staff user",
      email: "staff@example.com",
      profileImageStorageKey: null,
      profileImageUpdatedAt: null,
    },
  },
];

const changeLogFilters: YouthRosterChangeLogFilters = {
  page: 1,
  pageSize: 5,
  total: 6,
  totalPages: 2,
};

const rosterActions = {
  createYouth: async (values: YouthCreateInput) => ({
    ok: true,
    data: {
      youth: {
        id: "created-youth",
        name: values.name,
        admissionDate: values.admissionDate || null,
        birthDate: values.birthDate || null,
        dischargeDate: values.dischargeDate || null,
        age: values.birthDate ? 17 : null,
        phone: values.phone || null,
        familyContacts: values.familyContacts.map((contact, index) => ({
          id: `created-family-contact-${index}`,
          relationship: contact.relationship || null,
          phone: contact.phone || null,
        })),
        decisionDocuments: [],
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
        birthDate: values.birthDate || null,
        dischargeDate: values.dischargeDate || null,
        age: values.birthDate ? 17 : null,
        phone: values.phone || null,
        familyContacts: values.familyContacts.map((contact, index) => ({
          id: `updated-family-contact-${index}`,
          relationship: contact.relationship || null,
          phone: contact.phone || null,
        })),
        decisionDocuments: [],
        notes: [],
      },
    },
  }),
  deleteYouth: async (youthId: string) => ({
    ok: true,
    data: {
      youthId,
    },
  }),
  deleteDecisionDocument: async (documentId: string) => ({
    ok: true,
    data: {
      documentId,
      youthId: "youth-admitted-001",
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
    assert.match(html, /role="button"/);
    assert.match(html, /group cursor-pointer transition hover:bg-\[#f7fbfb\]/);
    assert.match(html, /만 17세\(18세\)/);
    assert.match(html, /고2/);
    assert.match(html, /입소중/);
    assert.match(html, /010-1111-2222/);
    assert.match(html, /어머니/);
    assert.match(html, /010-3333-4444/);
    assert.match(html, /이도현/);
    assert.match(html, /이도현 정보 수정/);
    assert.match(html, /2026\. 04\. 30\./);
    assert.match(html, /미등록/);
    assert.match(html, /aria-label="나이 오름차순 정렬"/);
    assert.match(html, /aria-label="입소 날짜 내림차순 정렬"/);
    assert.match(html, /aria-label="퇴소 예정 오름차순 정렬"/);
    assert.match(html, /aria-sort="ascending"/);
    assert.equal((html.match(/aria-haspopup="dialog"/g) ?? []).length, 3);
    assert.doesNotMatch(html, /name="name"/);
    assert.doesNotMatch(html, />저장</);
    assert.match(html, /결정문/);
    assert.doesNotMatch(html, /href="\/youth\/decision-documents\/decision-document-001"/);
    assert.match(
      html,
      /aria-label="김하늘 결정문 김하늘_결정문\.pdf 다운로드"/,
    );
    assert.match(html, />PDF<\/text>/);
    assert.match(html, /fill="#d92d20"/);
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

  test("renders roster change logs with pagination links", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthRosterBoard, {
        ...rosterActions,
        changeLogFilters,
        changeLogs,
        data: roster,
      }),
    );

    assert.match(html, /created roster item/);
    assert.match(html, /staff user/);
    assert.match(html, /staff@example\.com/);
    assert.match(html, /1 \/ 2/);
    assert.match(html, /href="\/youth\/roster\?logPage=2"/);
  });

  test("renders a delete action in admitted youth edit modals", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthRosterFormModal, {
        ...rosterActions,
        modal: {
          mode: "edit",
          canDelete: true,
          youth: roster.admittedYouths[0],
        },
        onClose: () => {},
        onDeleted: () => {},
        onSaved: () => {},
      }),
    );

    assert.match(html, /청소년 정보 수정/);
    assert.match(html, /TAB키를 이용하여 입력칸 이동 가능/);
    assert.match(html, /김하늘/);
    assert.match(html, /aria-label="입소 날짜 년"/);
    assert.match(html, /aria-label="입소 날짜 월"/);
    assert.match(html, /aria-label="입소 날짜 일"/);
    assert.match(html, /현재 적용: 2026\. 07\. 15\./);
    assert.match(html, /기본 예정일: 2026\. 07\. 15\. · 연장 0\/2회/);
    assert.match(html, />퇴소 연장</);
    assert.match(html, /aria-label="생년월일 년"/);
    assert.match(html, /value="2026"/);
    assert.match(html, /value="5"/);
    assert.match(html, /value="2009"/);
    assert.match(html, /aria-label="김하늘 청소년 삭제"/);
    assert.doesNotMatch(html, />청소년 삭제</);
    assert.match(html, /결정문 파일/);
    assert.match(html, /김하늘_결정문\.pdf/);
    assert.match(html, /200\.0 KB/);
    assert.doesNotMatch(html, /href="\/youth\/decision-documents\/decision-document-001"/);
    assert.match(html, />다운로드</);
    assert.match(html, /type="file"/);
  });

  test("does not render the youth delete action in discharged edit modals", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthRosterFormModal, {
        ...rosterActions,
        modal: {
          mode: "edit",
          canDelete: false,
          youth: roster.dischargedYouths[0],
        },
        onClose: () => {},
        onDeleted: () => {},
        onSaved: () => {},
      }),
    );

    assert.match(html, /청소년 정보 수정/);
    assert.doesNotMatch(html, /aria-label="이도현 청소년 삭제"/);
  });

  test("renders loading skeleton panels", () => {
    const html = renderToStaticMarkup(React.createElement(YouthRosterSkeleton));

    assert.match(html, /청소년 명단 불러오는 중/);
    assert.match(html, /입소중인 청소년 목록/);
    assert.match(html, /퇴소 청소년 목록/);
    assert.match(html, /animate-pulse/);
    assert.match(html, /dark:bg-\[#2a3038\]/);
  });
});
