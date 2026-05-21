export type TextDiffRow = {
  type: "unchanged" | "removed" | "added";
  text: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
};

export function createLineDiffRows(before: string, after: string): TextDiffRow[] {
  const beforeLines = splitDiffLines(before);
  const afterLines = splitDiffLines(after);
  const lcs = createLcsMatrix(beforeLines, afterLines);
  const rows: TextDiffRow[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeLines.length || afterIndex < afterLines.length) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      rows.push({
        type: "unchanged",
        text: beforeLines[beforeIndex] ?? "",
        oldLineNumber: beforeIndex + 1,
        newLineNumber: afterIndex + 1,
      });
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    if (
      afterIndex >= afterLines.length ||
      (beforeIndex < beforeLines.length &&
        lcs[beforeIndex + 1][afterIndex] >= lcs[beforeIndex][afterIndex + 1])
    ) {
      rows.push({
        type: "removed",
        text: beforeLines[beforeIndex] ?? "",
        oldLineNumber: beforeIndex + 1,
        newLineNumber: null,
      });
      beforeIndex += 1;
      continue;
    }

    rows.push({
      type: "added",
      text: afterLines[afterIndex] ?? "",
      oldLineNumber: null,
      newLineNumber: afterIndex + 1,
    });
    afterIndex += 1;
  }

  return rows;
}

function splitDiffLines(value: string) {
  if (value.length === 0) {
    return [];
  }

  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function createLcsMatrix(beforeLines: string[], afterLines: string[]) {
  const lcs = Array.from({ length: beforeLines.length + 1 }, () =>
    Array(afterLines.length + 1).fill(0) as number[],
  );

  for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
      lcs[beforeIndex][afterIndex] =
        beforeLines[beforeIndex] === afterLines[afterIndex]
          ? lcs[beforeIndex + 1][afterIndex + 1] + 1
          : Math.max(
              lcs[beforeIndex + 1][afterIndex],
              lcs[beforeIndex][afterIndex + 1],
            );
    }
  }

  return lcs;
}
