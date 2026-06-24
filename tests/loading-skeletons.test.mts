import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import WorkScheduleLoading from "../src/app/work-schedule/loading.tsx";
import WorkScheduleCafeLoading from "../src/app/work-schedule/cafe/loading.tsx";
import YouthCommonScheduleLoading from "../src/app/youth/common-schedule/loading.tsx";
import YouthLearningProgressLoading from "../src/app/youth/learning-progress/loading.tsx";

describe("route loading skeletons", () => {
  test("renders schedule-shaped loading states for timetable routes", () => {
    const workScheduleHtml = renderToStaticMarkup(
      React.createElement(WorkScheduleLoading),
    );
    const commonScheduleHtml = renderToStaticMarkup(
      React.createElement(YouthCommonScheduleLoading),
    );
    const learningProgressHtml = renderToStaticMarkup(
      React.createElement(YouthLearningProgressLoading),
    );

    assert.match(workScheduleHtml, /업무 일정 달력/);
    assert.match(workScheduleHtml, /min-w-\[980px\]/);
    assert.doesNotMatch(workScheduleHtml, /자료 목록/);
    assert.match(commonScheduleHtml, /공통 일정표/);
    assert.match(commonScheduleHtml, /min-w-\[820px\]/);
    assert.match(learningProgressHtml, /학습지도 시간표/);
    assert.match(learningProgressHtml, /min-w-\[680px\]/);
  });

  test("renders cafe registration and list loading states for cafe management", () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkScheduleCafeLoading),
    );

    assert.match(html, /물품 등록/);
    assert.match(html, /물품 목록/);
    assert.match(html, /카페 물품 등록 로딩/);
    assert.match(html, /카페 물품 목록 로딩/);
    assert.match(html, /카페 물품 변경내역 로딩/);
    assert.match(html, /min-w-\[1152px\]/);
    assert.match(html, /min-w-\[900px\]/);
    assert.doesNotMatch(html, /자료 목록/);
  });
});
