import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatYouthSchoolGradeLabel } from "../src/lib/youth-management-core.ts";

describe("youth school grade labels", () => {
  test("calculates middle and high school grades from birth year", () => {
    assert.equal(
      formatYouthSchoolGradeLabel(
        { age: null, birthDate: "2013-06-10" },
        "2026-06-22",
      ),
      "중1",
    );
    assert.equal(
      formatYouthSchoolGradeLabel(
        { age: null, birthDate: "2009-06-10" },
        "2026-06-22",
      ),
      "고2",
    );
  });

  test("falls back to stored age when birth date is missing", () => {
    assert.equal(
      formatYouthSchoolGradeLabel(
        { age: 17, birthDate: null },
        "2026-06-22",
      ),
      "고2",
    );
  });
});
