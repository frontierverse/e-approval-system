import "server-only";

import { createHash } from "node:crypto";
import {
  lunchBoxCountFields,
  type LunchBoxCountValues,
} from "@/lib/lunch-box-counts-core";

type LunchBoxSchoolSnapshotSchool = {
  active: boolean;
  id: string;
  name: string;
  preservationClass: number | null;
  type: string;
};

type LunchBoxSchoolSnapshotCount = LunchBoxCountValues & {
  date: string;
};

export function createLunchBoxSchoolCountSnapshot({
  counts,
  school,
}: {
  counts: readonly LunchBoxSchoolSnapshotCount[];
  school: LunchBoxSchoolSnapshotSchool;
}) {
  const canonicalValue = {
    school: {
      active: school.active,
      id: school.id,
      name: school.name,
      preservationClass: school.preservationClass,
      type: school.type,
    },
    counts: [...counts]
      .sort((left, right) =>
        left.date < right.date ? -1 : left.date > right.date ? 1 : 0,
      )
      .map((count) => ({
        date: count.date,
        values: lunchBoxCountFields.map((field) => count[field]),
      })),
  };

  return createHash("sha256")
    .update(JSON.stringify(canonicalValue))
    .digest("hex");
}
