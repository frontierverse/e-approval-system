import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PDFDocument,
  PageSizes,
  type PDFFont,
  type PDFPage,
  rgb,
} from "pdf-lib";
import {
  createLunchBoxServingOrderGroups,
  createLunchBoxStatusSummary,
  formatLunchBoxDateLabel,
  formatLunchBoxMenuItems,
  isLunchBoxDate,
  type LunchBoxCountGrid,
} from "@/lib/lunch-box-counts-core";
import {
  createLunchBoxCoolerBagTableLayout,
  drawLunchBoxCoolerBagTableLayoutPage,
} from "@/lib/lunch-box-daily-school-list-pdf";

type LunchBoxStatusPdfInput = {
  generatedAt: Date;
  grid: LunchBoxCountGrid;
};

type LunchBoxWeeklyStatusPdfInput = {
  generatedAt: Date;
  grids: LunchBoxCountGrid[];
};

type LunchBoxStatusLayoutPolicy = "after-each-date" | "none";

type StatusMetric = {
  blankWhenZero?: boolean;
  label: string;
  unit: "개" | "인";
  value: number;
};

const koreanFontPath = path.join(
  process.cwd(),
  "public",
  "fonts",
  "NanumGothic-Regular.ttf",
);
const landscapeA4: [number, number] = [PageSizes.A4[1], PageSizes.A4[0]];
const pageMargin = 18;
const titleHeight = 78;
const menuHeight = 56;
const utensilHeight = 44;
const summaryHeaderHeight = 52;
const summaryValueHeight = 52;
const menuLabelWidth = 121;
const outerBorderWidth = 1.15;
const innerBorderWidth = 0.55;
const titleFontSize = 25;
const menuLabelFontSize = 21;
const menuFontSize = 16;
const summaryLabelFontSize = 18;
const summaryValueFontSize = 19;
const groupPersonFontSize = 27;
const groupCountFontSize = 24;
const lavender = rgb(0.94, 0.89, 0.96);
const paperWhite = rgb(1, 1, 1);
const ink = rgb(0.03, 0.03, 0.04);
const mutedInk = rgb(0.35, 0.35, 0.38);
const ruleColor = rgb(0.08, 0.08, 0.09);
const statusUtensils =
  "미니 집게 4, 주걱 1, 스탠 국자 1, 검정 소스 국자 1, 스탠 배식스푼 1";

export async function createLunchBoxStatusPdf({
  generatedAt,
  grid,
}: LunchBoxStatusPdfInput) {
  return createLunchBoxStatusPdfDocument({
    generatedAt,
    grids: [grid],
    layoutPolicy: "after-each-date",
  });
}

export async function createLunchBoxWeeklyStatusPdf({
  generatedAt,
  grids,
}: LunchBoxWeeklyStatusPdfInput) {
  return createLunchBoxStatusPdfDocument({
    generatedAt,
    grids,
    layoutPolicy: "after-each-date",
  });
}

async function createLunchBoxStatusPdfDocument({
  generatedAt,
  grids,
  layoutPolicy,
}: LunchBoxWeeklyStatusPdfInput & {
  layoutPolicy: LunchBoxStatusLayoutPolicy;
}) {
  if (grids.length === 0) {
    throw new Error("인쇄할 도시락 현황표가 없습니다.");
  }

  for (const grid of grids) {
    if (!isLunchBoxDate(grid.date)) {
      throw new Error("도시락 현황표 인쇄 날짜가 올바르지 않습니다.");
    }
  }

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await readFile(koreanFontPath), {
    subset: false,
  });
  pdf.setTitle(formatStatusDocumentTitle(grids));
  pdf.setSubject(
    layoutPolicy === "after-each-date"
      ? "초등학교 및 병설유치원 방학도시락 일자별 현황표 및 학교 그룹별 보냉백 배치도"
      : "초등학교 및 병설유치원 방학도시락 일자별 현황표",
  );
  pdf.setCreator("바자울 사내 시스템");
  pdf.setProducer("바자울 사내 시스템");
  pdf.setCreationDate(generatedAt);
  pdf.setModificationDate(generatedAt);

  const pageCount =
    grids.length * (layoutPolicy === "after-each-date" ? 2 : 1);
  let pageNumber = 1;

  for (const grid of grids) {
    const page = pdf.addPage(landscapeA4);
    const summary = createLunchBoxStatusSummary(grid.rows);
    const title = formatStatusTitle(grid.date);
    const menu = formatLunchBoxMenuItems(grid.menuItems);

    drawStatusSheet(page, font, {
      groupDistribution: summary.groupDistribution,
      menu,
      metrics: [
        {
          blankWhenZero: true,
          label: "배송기사",
          unit: "개",
          value: summary.deliveryDriverCount,
        },
        {
          label: "보존식",
          unit: "개",
          value: summary.preservationCount,
        },
        {
          label: "병설도시락",
          unit: "개",
          value: summary.kindergartenCount,
        },
        {
          label: "배식",
          unit: "인",
          value: summary.elementaryServingCount,
        },
        {
          label: "남초 도시락",
          unit: "개",
          value: summary.namchoLunchBoxCount,
        },
        {
          label: "전체",
          unit: "인",
          value: summary.totalCount,
        },
      ],
      title,
    });

    if (layoutPolicy === "after-each-date") {
      drawStatusPageNumber(page, font, pageNumber, pageCount);
      pageNumber += 1;

      const layoutPage = pdf.addPage(landscapeA4);
      const coolerBagTableLayout = createLunchBoxCoolerBagTableLayout(
        createLunchBoxServingOrderGroups(grid.rows),
      );

      drawLunchBoxCoolerBagTableLayoutPage({
        coolerBagTableLayout,
        dateLabel: formatLunchBoxDateLabel(grid.date),
        font,
        page: layoutPage,
        pageCount,
        pageNumber,
        variant: "school-groups",
      });
    }

    pageNumber += 1;
  }

  return pdf.save();
}

function drawStatusSheet(
  page: PDFPage,
  font: PDFFont,
  {
    groupDistribution,
    menu,
    metrics,
    title,
  }: {
    groupDistribution: Array<{ groupCount: number; personCount: number }>;
    menu: string;
    metrics: StatusMetric[];
    title: string;
  },
) {
  const { height: pageHeight, width: pageWidth } = page.getSize();
  const contentX = pageMargin;
  const contentWidth = pageWidth - pageMargin * 2;
  const contentTop = pageHeight - pageMargin;
  const contentBottom = pageMargin;
  const titleY = contentTop - titleHeight;
  const menuY = titleY - menuHeight;
  const utensilY = menuY - utensilHeight;
  const summaryHeaderY = utensilY - summaryHeaderHeight;
  const summaryValueY = summaryHeaderY - summaryValueHeight;
  const distributionHeight = summaryValueY - contentBottom;
  const distributionRowHeight = distributionHeight / 2;

  page.drawRectangle({
    x: contentX,
    y: titleY,
    width: contentWidth,
    height: titleHeight,
    color: lavender,
  });
  page.drawRectangle({
    x: contentX,
    y: menuY,
    width: contentWidth,
    height: menuHeight,
    color: lavender,
  });
  page.drawRectangle({
    x: contentX,
    y: utensilY,
    width: contentWidth,
    height: utensilHeight,
    color: lavender,
  });
  page.drawRectangle({
    x: contentX,
    y: contentBottom,
    width: contentWidth,
    height: summaryHeaderY - contentBottom,
    color: paperWhite,
  });

  drawCenteredText(page, font, title, {
    color: ink,
    height: titleHeight,
    maxWidth: contentWidth - 32,
    preferredSize: titleFontSize,
    x: contentX,
    y: titleY,
    width: contentWidth,
  });
  drawCenteredText(page, font, "식단", {
    color: ink,
    height: menuHeight,
    maxWidth: menuLabelWidth - 16,
    preferredSize: menuLabelFontSize,
    x: contentX,
    y: menuY,
    width: menuLabelWidth,
  });
  drawCenteredText(page, font, menu || "등록된 식단이 없습니다.", {
    align: "left",
    color: menu ? ink : mutedInk,
    height: menuHeight,
    maxWidth: contentWidth - menuLabelWidth - 28,
    minSize: 8,
    padding: 14,
    preferredSize: menuFontSize,
    x: contentX + menuLabelWidth,
    y: menuY,
    width: contentWidth - menuLabelWidth,
  });
  drawCenteredText(page, font, "식기", {
    color: ink,
    height: utensilHeight,
    maxWidth: menuLabelWidth - 16,
    preferredSize: menuLabelFontSize,
    x: contentX,
    y: utensilY,
    width: menuLabelWidth,
  });
  drawCenteredText(page, font, statusUtensils, {
    align: "left",
    color: ink,
    height: utensilHeight,
    maxWidth: contentWidth - menuLabelWidth - 28,
    minSize: 8,
    padding: 14,
    preferredSize: 13,
    x: contentX + menuLabelWidth,
    y: utensilY,
    width: contentWidth - menuLabelWidth,
  });

  const summaryWidths = createSummaryWidths(contentWidth, metrics.length);
  let summaryX = contentX;

  metrics.forEach((metric, index) => {
    const width = summaryWidths[index];
    const displayValue =
      metric.blankWhenZero && metric.value === 0
        ? ""
        : `${formatCount(metric.value)}${metric.unit}`;

    drawCenteredText(page, font, metric.label, {
      color: ink,
      height: summaryHeaderHeight,
      maxWidth: width - 14,
      preferredSize: summaryLabelFontSize,
      x: summaryX,
      y: summaryHeaderY,
      width,
    });
    if (displayValue) {
      drawCenteredText(page, font, displayValue, {
        color: ink,
        height: summaryValueHeight,
        maxWidth: width - 14,
        preferredSize: summaryValueFontSize,
        x: summaryX,
        y: summaryValueY,
        width,
      });
    }
    summaryX += width;
  });

  const displayGroups =
    groupDistribution.length > 0
      ? groupDistribution
      : [{ groupCount: 0, personCount: 0 }];
  const groupWidth = contentWidth / displayGroups.length;

  displayGroups.forEach((group, index) => {
    const x = contentX + index * groupWidth;
    const isEmpty = groupDistribution.length === 0;

    drawCenteredText(
      page,
      font,
      isEmpty ? "초등학교 배식 인원이 없습니다." : `${group.personCount}인`,
      {
        color: isEmpty ? mutedInk : ink,
        height: distributionRowHeight,
        maxWidth: groupWidth - 12,
        minSize: 9,
        preferredSize: isEmpty ? 17 : groupPersonFontSize,
        x,
        y: contentBottom + distributionRowHeight,
        width: groupWidth,
      },
    );
    drawCenteredText(page, font, `${group.groupCount}개`, {
      color: isEmpty ? mutedInk : ink,
      height: distributionRowHeight,
      maxWidth: groupWidth - 12,
      minSize: 9,
      preferredSize: groupCountFontSize,
      x,
      y: contentBottom,
      width: groupWidth,
    });
  });

  drawHorizontalRule(page, contentX, contentX + contentWidth, titleY);
  drawHorizontalRule(page, contentX, contentX + contentWidth, menuY);
  drawHorizontalRule(page, contentX, contentX + contentWidth, utensilY);
  drawHorizontalRule(page, contentX, contentX + contentWidth, summaryHeaderY);
  drawHorizontalRule(page, contentX, contentX + contentWidth, summaryValueY, {
    width: outerBorderWidth,
  });
  drawHorizontalRule(
    page,
    contentX,
    contentX + contentWidth,
    contentBottom + distributionRowHeight,
  );

  drawVerticalRule(page, contentX + menuLabelWidth, menuY, titleY);
  drawVerticalRule(page, contentX + menuLabelWidth, utensilY, menuY);

  summaryX = contentX;
  summaryWidths.slice(0, -1).forEach((width) => {
    summaryX += width;
    drawVerticalRule(page, summaryX, summaryValueY, utensilY);
  });

  for (let index = 1; index < displayGroups.length; index += 1) {
    drawVerticalRule(
      page,
      contentX + index * groupWidth,
      contentBottom,
      summaryValueY,
    );
  }

  page.drawRectangle({
    x: contentX,
    y: contentBottom,
    width: contentWidth,
    height: contentTop - contentBottom,
    borderColor: ruleColor,
    borderWidth: outerBorderWidth,
  });
}

function drawStatusPageNumber(
  page: PDFPage,
  font: PDFFont,
  pageNumber: number,
  pageCount: number,
) {
  const fontSize = 7;
  const label = `${pageNumber} / ${pageCount}`;
  const labelWidth = font.widthOfTextAtSize(label, fontSize);

  page.drawText(label, {
    x: page.getWidth() - 24 - labelWidth,
    y: 12,
    size: fontSize,
    font,
    color: mutedInk,
  });
}

function createSummaryWidths(contentWidth: number, metricCount: number) {
  if (metricCount <= 1) {
    return [contentWidth];
  }

  const remainingWidth = contentWidth - menuLabelWidth;
  const standardWidth = remainingWidth / (metricCount - 1);

  return [
    menuLabelWidth,
    ...Array.from({ length: metricCount - 1 }, () => standardWidth),
  ];
}

function drawCenteredText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  {
    align = "center",
    color,
    height,
    maxWidth,
    minSize = 10,
    padding = 0,
    preferredSize,
    width,
    x,
    y,
  }: {
    align?: "center" | "left";
    color: ReturnType<typeof rgb>;
    height: number;
    maxWidth: number;
    minSize?: number;
    padding?: number;
    preferredSize: number;
    width: number;
    x: number;
    y: number;
  },
) {
  const fontSize = fitFontSize(
    font,
    text,
    maxWidth,
    preferredSize,
    minSize,
  );
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const textHeight = font.heightAtSize(fontSize, { descender: false });

  page.drawText(text, {
    x:
      align === "left"
        ? x + padding
        : x + (width - textWidth) / 2,
    y: y + (height - textHeight) / 2,
    size: fontSize,
    font,
    color,
  });
}

function fitFontSize(
  font: PDFFont,
  text: string,
  maxWidth: number,
  preferredSize: number,
  minSize: number,
) {
  const textWidthAtPreferredSize = font.widthOfTextAtSize(text, preferredSize);

  if (textWidthAtPreferredSize <= maxWidth || textWidthAtPreferredSize === 0) {
    return preferredSize;
  }

  return Math.max(
    minSize,
    preferredSize * (maxWidth / textWidthAtPreferredSize),
  );
}

function drawHorizontalRule(
  page: PDFPage,
  startX: number,
  endX: number,
  y: number,
  { width = innerBorderWidth }: { width?: number } = {},
) {
  page.drawLine({
    start: { x: startX, y },
    end: { x: endX, y },
    color: ruleColor,
    thickness: width,
  });
}

function drawVerticalRule(
  page: PDFPage,
  x: number,
  startY: number,
  endY: number,
) {
  page.drawLine({
    start: { x, y: startY },
    end: { x, y: endY },
    color: ruleColor,
    thickness: innerBorderWidth,
  });
}

function formatStatusTitle(date: string) {
  const [, month, day] = date.split("-");

  return `${Number(month)}월 ${Number(day)}일 초등 및 병설 방학도시락 현황표`;
}

function formatStatusDocumentTitle(grids: LunchBoxCountGrid[]) {
  if (grids.length === 1) {
    return formatStatusTitle(grids[0].date);
  }

  const firstDate = grids[0].date;
  const lastDate = grids[grids.length - 1].date;
  const [, firstMonth, firstDay] = firstDate.split("-");
  const [, lastMonth, lastDay] = lastDate.split("-");

  return `${Number(firstMonth)}월 ${Number(firstDay)}일~${Number(lastMonth)}월 ${Number(lastDay)}일 초등 및 병설 방학도시락 현황표`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}
