import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkFeatureUpdateList } from "../src/components/work-feature-update-list.tsx";
import type { WorkFeatureUpdate } from "../src/lib/work-feature-updates.ts";

const updates: WorkFeatureUpdate[] = [
  {
    createdAt: "2026-06-29T00:00:00.000Z",
    createdBy: { id: "admin-001", name: "Admin" },
    description: "First feature",
    id: "feature-001",
    title: "Feature 1",
  },
  {
    createdAt: "2026-06-28T00:00:00.000Z",
    createdBy: { id: "admin-001", name: "Admin" },
    description: "Second feature",
    id: "feature-002",
    title: "Feature 2",
  },
  {
    createdAt: "2026-06-27T00:00:00.000Z",
    createdBy: { id: "admin-001", name: "Admin" },
    description: "Third feature",
    id: "feature-003",
    title: "Feature 3",
  },
  {
    createdAt: "2026-06-26T00:00:00.000Z",
    createdBy: { id: "admin-001", name: "Admin" },
    description: "Fourth feature",
    id: "feature-004",
    title: "Feature 4",
  },
];

describe("WorkFeatureUpdateList", () => {
  test("renders only three feature update rows", () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkFeatureUpdateList, {
        canCreate: false,
        updates,
      }),
    );

    assert.match(html, /업무 시스템 업데이트/);
    assert.match(html, /Feature 1/);
    assert.match(html, /Feature 2/);
    assert.match(html, /Feature 3/);
    assert.doesNotMatch(html, /Feature 4/);
    assert.equal(html.match(/<article/g)?.length ?? 0, 3);
    assert.doesNotMatch(html, />추가</);
  });

  test("keeps system usage private to administrators", () => {
    const nonAdminHtml = renderToStaticMarkup(
      React.createElement(WorkFeatureUpdateList, {
        canCreate: false,
        usageSummary: {
          database: {
            label: "DB",
            limitLabel: "500 MB",
            usedLabel: "14.8 MB",
            usedPercent: 3,
          },
          storage: {
            label: "스토리지",
            limitLabel: "1 GB",
            usedLabel: "590.4 MB",
            usedPercent: 57.6,
          },
        },
        updates: updates.slice(0, 1),
      }),
    );

    const adminHtml = renderToStaticMarkup(
      React.createElement(WorkFeatureUpdateList, {
        canCreate: true,
        usageSummary: {
          database: {
            label: "DB",
            limitLabel: "500 MB",
            usedLabel: "14.8 MB",
            usedPercent: 3,
          },
          storage: {
            label: "스토리지",
            limitLabel: "1 GB",
            usedLabel: "590.4 MB",
            usedPercent: 57.6,
          },
        },
        updates: updates.slice(0, 1),
      }),
    );

    assert.doesNotMatch(nonAdminHtml, /14\.8 MB \/ 500 MB/);
    assert.doesNotMatch(nonAdminHtml, /590\.4 MB \/ 1 GB/);
    assert.match(adminHtml, /DB/);
    assert.match(adminHtml, /14\.8 MB \/ 500 MB/);
    assert.match(adminHtml, /스토리지/);
    assert.match(adminHtml, /590\.4 MB \/ 1 GB/);
  });

  test("renders the add button for admins", () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkFeatureUpdateList, {
        canCreate: true,
        updates: updates.slice(0, 1),
      }),
    );

    assert.match(html, />추가</);
  });
});
