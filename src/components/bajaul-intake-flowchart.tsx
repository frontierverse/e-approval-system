"use client";

import { useState } from "react";

type NodeKind = "process" | "decision" | "key" | "exit" | "end";

type FlowBranchDetail = {
  chip: string;
  continues: boolean;
  text: string;
};

type FlowNode = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: NodeKind;
  lines: string[];
  title: string;
  description: string;
  branches?: FlowBranchDetail[];
};

type FlowEdge = {
  id: string;
  from: string;
  to: string;
  d: string;
  label?: string;
  labelX?: number;
  labelY?: number;
};

const MAIN_X = 230;
const MAIN_W = 340;
const MAIN_CX = MAIN_X + MAIN_W / 2;
const SIDE_X = 630;
const SIDE_W = 240;
const NODE_H = 52;

const kindLabels: Record<NodeKind, string> = {
  process: "진행",
  decision: "분기",
  key: "핵심",
  exit: "다른 경로",
  end: "종료",
};

const nodes: FlowNode[] = [
  {
    id: "detect",
    x: MAIN_X,
    y: 20,
    w: MAIN_W,
    h: NODE_H,
    kind: "process",
    lines: ["비행·범죄·우범 상황 발생 또는", "보호가 필요한 소년 발견"],
    title: "발견·인지",
    description:
      "비행·범죄·우범 상황이 발생했거나 보호가 필요한 소년이 발견되면서 절차가 시작됩니다.",
  },
  {
    id: "case-entry",
    x: MAIN_X,
    y: 116,
    w: MAIN_W,
    h: NODE_H,
    kind: "decision",
    lines: ["소년보호사건으로 법원", "소년부에 들어가는가?"],
    title: "법원 소년부 사건 해당 여부",
    description: "소년보호사건으로 법원 소년부에 들어가는지 판단합니다.",
    branches: [
      {
        chip: "송치·통고",
        continues: true,
        text: "경찰·검찰의 송치 또는 보호자·학교장·복리시설장의 통고로 사건 접수로 이어집니다.",
      },
      {
        chip: "대상 아님",
        continues: false,
        text: "바자울 입소 경로가 아니며, 쉼터·상담복지센터 등 별도 지원을 검토합니다.",
      },
    ],
  },
  {
    id: "not-target",
    x: SIDE_X,
    y: 116,
    w: SIDE_W,
    h: NODE_H,
    kind: "exit",
    lines: ["바자울 입소 경로 아님", "쉼터 등 별도 지원 검토"],
    title: "바자울 입소 경로 아님",
    description:
      "소년보호사건 대상이 아니면 바자울 입소 경로가 아닙니다. 쉼터·상담복지센터 등 별도 지원을 검토합니다.",
  },
  {
    id: "receipt",
    x: MAIN_X,
    y: 212,
    w: MAIN_W,
    h: NODE_H,
    kind: "process",
    lines: ["관할 가정법원·지방법원", "소년부 사건 접수"],
    title: "사건 접수",
    description: "관할 가정법원 또는 지방법원 소년부에 사건이 접수됩니다.",
  },
  {
    id: "investigation",
    x: MAIN_X,
    y: 308,
    w: MAIN_W,
    h: NODE_H,
    kind: "process",
    lines: ["소년부 조사", "생활환경·비행 원인·재범 위험 파악"],
    title: "소년부 조사",
    description:
      "소년과 보호자, 생활환경, 비행 원인, 재범 위험을 파악하는 조사가 진행됩니다.",
  },
  {
    id: "classification-need",
    x: MAIN_X,
    y: 404,
    w: MAIN_W,
    h: NODE_H,
    kind: "decision",
    lines: ["분류심사원 위탁 등", "추가 조사 필요?"],
    title: "추가 조사 필요 여부",
    description: "분류심사원 위탁 등 추가 조사가 필요한지 판단합니다.",
    branches: [
      {
        chip: "필요",
        continues: true,
        text: "소년분류심사와 보고를 거친 뒤 심리로 넘어갑니다.",
      },
      {
        chip: "불필요",
        continues: true,
        text: "추가 조사 없이 바로 심리로 넘어갑니다.",
      },
    ],
  },
  {
    id: "classification",
    x: SIDE_X,
    y: 404,
    w: SIDE_W,
    h: NODE_H,
    kind: "process",
    lines: ["소년분류심사 및 보고", "(필요 시 임시위탁)"],
    title: "소년분류심사 및 보고",
    description:
      "분류심사 결과를 보고하며, 필요하면 임시위탁이 이뤄집니다. 심사 후 소년부 심리로 합류합니다.",
  },
  {
    id: "hearing",
    x: MAIN_X,
    y: 500,
    w: MAIN_W,
    h: NODE_H,
    kind: "process",
    lines: ["소년부 심리"],
    title: "소년부 심리",
    description: "조사·심사 결과를 바탕으로 소년부 판사가 심리를 진행합니다.",
  },
  {
    id: "guardian-need",
    x: MAIN_X,
    y: 596,
    w: MAIN_W,
    h: NODE_H,
    kind: "decision",
    lines: ["가정 보호가 어렵고", "대안 보호자가 필요한가?"],
    title: "대안 보호자 필요 여부",
    description: "가정 보호가 어렵고 대안 보호자가 필요한지 판단합니다.",
    branches: [
      {
        chip: "예",
        continues: true,
        text: "바자울 배치 가능 여부 검토로 이어집니다.",
      },
      {
        chip: "아니오",
        continues: false,
        text: "보호자 위탁 또는 다른 보호처분으로 결정되며, 바자울 입소로 이어지지 않습니다.",
      },
    ],
  },
  {
    id: "other-disposition",
    x: SIDE_X,
    y: 596,
    w: SIDE_W,
    h: NODE_H,
    kind: "exit",
    lines: ["보호자 위탁 또는", "다른 보호처분 결정"],
    title: "보호자 위탁·다른 보호처분",
    description:
      "가정 보호가 가능하면 보호자 위탁 또는 다른 보호처분으로 결정됩니다. 바자울 입소 절차는 여기서 끝납니다.",
  },
  {
    id: "capacity",
    x: MAIN_X,
    y: 692,
    w: MAIN_W,
    h: NODE_H,
    kind: "decision",
    lines: ["바자울 배치가 가능한가?", "(여성 청소년·정원·사건 적합성)"],
    title: "바자울 배치 가능 여부",
    description:
      "여성 청소년 대상 여부, 정원, 사건 적합성을 확인해 바자울 배치가 가능한지 판단합니다.",
    branches: [
      {
        chip: "가능",
        continues: true,
        text: "소년부 판사의 제1호 감호위탁 결정으로 이어집니다.",
      },
      {
        chip: "불가",
        continues: false,
        text: "다른 위탁보호위원, 다른 회복지원시설 또는 다른 보호처분을 검토합니다.",
      },
    ],
  },
  {
    id: "other-facility",
    x: SIDE_X,
    y: 692,
    w: SIDE_W,
    h: NODE_H,
    kind: "exit",
    lines: ["다른 위탁위원·시설 또는", "다른 보호처분 검토"],
    title: "다른 경로 검토",
    description:
      "바자울 배치가 어려우면 다른 위탁보호위원, 다른 회복지원시설 또는 다른 보호처분을 검토합니다.",
  },
  {
    id: "court-decision",
    x: MAIN_X,
    y: 788,
    w: MAIN_W,
    h: NODE_H,
    kind: "key",
    lines: ["소년부 판사 결정", "제1호 감호위탁"],
    title: "소년부 판사 결정 — 제1호 감호위탁",
    description:
      "소년부 판사가 제1호 감호위탁을 결정합니다. 수탁자는 바자울 측 위탁보호위원입니다.",
  },
  {
    id: "admission",
    x: MAIN_X,
    y: 884,
    w: MAIN_W,
    h: NODE_H,
    kind: "key",
    lines: ["법원 결정에 따라 신병 인계", "바자울 입소"],
    title: "바자울 입소",
    description: "법원 결정에 따라 신병을 인계받아 바자울에 입소합니다.",
  },
  {
    id: "initial-care",
    x: MAIN_X,
    y: 980,
    w: MAIN_W,
    h: NODE_H,
    kind: "process",
    lines: ["초기 적응·생활기록·안전 확인", "상담·학업·주거·자립 계획 수립"],
    title: "초기 적응과 지원 계획 수립",
    description:
      "초기 적응을 돕고 생활기록과 건강·안전을 확인하며, 상담·학업·주거·자립 지원 계획을 세웁니다.",
  },
  {
    id: "duration",
    x: MAIN_X,
    y: 1076,
    w: MAIN_W,
    h: NODE_H,
    kind: "process",
    lines: ["원칙상 6개월 보호", "법원 결정으로 1회 최대 6개월 연장"],
    title: "보호 기간",
    description:
      "보호 기간은 원칙상 6개월이며, 필요하면 법원 결정으로 1회에 한해 최대 6개월까지 연장할 수 있습니다.",
  },
  {
    id: "discharge",
    x: MAIN_X,
    y: 1172,
    w: MAIN_W,
    h: NODE_H,
    kind: "end",
    lines: ["위탁 종료", "가정·학교·사회 복귀 또는 자립 연계"],
    title: "위탁 종료",
    description:
      "위탁이 종료되면 가정·학교·사회로 복귀하거나 자립을 연계합니다.",
  },
];

const edges: FlowEdge[] = [
  { id: "e1", from: "detect", to: "case-entry", d: `M${MAIN_CX},72 L${MAIN_CX},116` },
  {
    id: "e2",
    from: "case-entry",
    to: "receipt",
    d: `M${MAIN_CX},168 L${MAIN_CX},212`,
    label: "송치·통고",
    labelX: MAIN_CX + 12,
    labelY: 196,
  },
  {
    id: "e3",
    from: "case-entry",
    to: "not-target",
    d: "M570,142 L630,142",
    label: "대상 아님",
    labelX: 574,
    labelY: 130,
  },
  { id: "e4", from: "receipt", to: "investigation", d: `M${MAIN_CX},264 L${MAIN_CX},308` },
  { id: "e5", from: "investigation", to: "classification-need", d: `M${MAIN_CX},360 L${MAIN_CX},404` },
  {
    id: "e6",
    from: "classification-need",
    to: "hearing",
    d: `M${MAIN_CX},456 L${MAIN_CX},500`,
    label: "불필요",
    labelX: MAIN_CX + 12,
    labelY: 484,
  },
  {
    id: "e7",
    from: "classification-need",
    to: "classification",
    d: "M570,430 L630,430",
    label: "필요",
    labelX: 584,
    labelY: 418,
  },
  { id: "e8", from: "classification", to: "hearing", d: "M750,456 L750,526 L570,526" },
  { id: "e9", from: "hearing", to: "guardian-need", d: `M${MAIN_CX},552 L${MAIN_CX},596` },
  {
    id: "e10",
    from: "guardian-need",
    to: "capacity",
    d: `M${MAIN_CX},648 L${MAIN_CX},692`,
    label: "예",
    labelX: MAIN_CX + 12,
    labelY: 676,
  },
  {
    id: "e11",
    from: "guardian-need",
    to: "other-disposition",
    d: "M570,622 L630,622",
    label: "아니오",
    labelX: 576,
    labelY: 610,
  },
  {
    id: "e12",
    from: "capacity",
    to: "court-decision",
    d: `M${MAIN_CX},744 L${MAIN_CX},788`,
    label: "가능",
    labelX: MAIN_CX + 12,
    labelY: 772,
  },
  {
    id: "e13",
    from: "capacity",
    to: "other-facility",
    d: "M570,718 L630,718",
    label: "불가",
    labelX: 584,
    labelY: 706,
  },
  { id: "e14", from: "court-decision", to: "admission", d: `M${MAIN_CX},840 L${MAIN_CX},884` },
  { id: "e15", from: "admission", to: "initial-care", d: `M${MAIN_CX},936 L${MAIN_CX},980` },
  { id: "e16", from: "initial-care", to: "duration", d: `M${MAIN_CX},1032 L${MAIN_CX},1076` },
  { id: "e17", from: "duration", to: "discharge", d: `M${MAIN_CX},1128 L${MAIN_CX},1172` },
];

const relatedNodesById = new Map<string, Set<string>>(
  nodes.map((node) => [node.id, new Set([node.id])]),
);
const relatedEdgesById = new Map<string, Set<string>>(
  nodes.map((node) => [node.id, new Set<string>()]),
);

for (const edge of edges) {
  relatedNodesById.get(edge.from)?.add(edge.to);
  relatedNodesById.get(edge.to)?.add(edge.from);
  relatedEdgesById.get(edge.from)?.add(edge.id);
  relatedEdgesById.get(edge.to)?.add(edge.id);
}

const nodeStyles: Record<
  NodeKind,
  { fill: string; stroke: string; text: string; dash?: string; strokeWidth: number }
> = {
  process: {
    fill: "var(--surface)",
    stroke: "var(--border-strong)",
    text: "var(--foreground)",
    strokeWidth: 1.5,
  },
  decision: {
    fill: "var(--brand-soft)",
    stroke: "var(--brand)",
    text: "var(--foreground)",
    strokeWidth: 1.5,
  },
  key: {
    fill: "var(--brand)",
    stroke: "var(--brand)",
    text: "#ffffff",
    strokeWidth: 1.5,
  },
  exit: {
    fill: "var(--surface-muted)",
    stroke: "var(--border-strong)",
    text: "var(--text-muted)",
    dash: "5 4",
    strokeWidth: 1.5,
  },
  end: {
    fill: "var(--surface-muted)",
    stroke: "var(--border-strong)",
    text: "var(--foreground)",
    strokeWidth: 2,
  },
};

const FONT_SIZE = 14;
const LINE_HEIGHT = 19;

export function BajaulIntakeFlowchart() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeNode = activeId
    ? nodes.find((node) => node.id === activeId) ?? null
    : null;

  function isNodeDimmed(nodeId: string) {
    return activeId !== null && !relatedNodesById.get(activeId)?.has(nodeId);
  }

  function isEdgeDimmed(edgeId: string) {
    return activeId !== null && !relatedEdgesById.get(activeId)?.has(edgeId);
  }

  function isEdgeHighlighted(edgeId: string) {
    return activeId !== null && relatedEdgesById.get(activeId)?.has(edgeId) === true;
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section
        aria-label="입소 절차 순서도"
        className="rounded-md border border-[var(--border)] bg-[var(--surface)]"
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--foreground)]">
            전체 흐름도
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            단계에 마우스를 올리거나 선택하면 해당 단계만 강조됩니다.
          </p>
        </div>
        <div className="overflow-x-auto p-3">
          <svg
            role="group"
            aria-label="소년보호 1호처분에 따른 바자울 입소 절차 순서도"
            viewBox="0 0 900 1248"
            className="h-auto w-full min-w-[760px] max-w-[900px]"
            onMouseLeave={() => setActiveId(null)}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setActiveId(null);
              }
            }}
          >
            <defs>
              <marker
                id="intake-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 Z" style={{ fill: "var(--border-strong)" }} />
              </marker>
              <marker
                id="intake-arrow-active"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 Z" style={{ fill: "var(--brand)" }} />
              </marker>
            </defs>

            {edges.map((edge) => {
              const highlighted = isEdgeHighlighted(edge.id);

              return (
                <g
                  key={edge.id}
                  className={[
                    "transition-opacity duration-200 motion-reduce:transition-none",
                    isEdgeDimmed(edge.id) ? "opacity-15" : "opacity-100",
                  ].join(" ")}
                >
                  <path
                    d={edge.d}
                    fill="none"
                    strokeWidth={highlighted ? 2.5 : 1.5}
                    markerEnd={
                      highlighted
                        ? "url(#intake-arrow-active)"
                        : "url(#intake-arrow)"
                    }
                    style={{
                      stroke: highlighted
                        ? "var(--brand)"
                        : "var(--border-strong)",
                    }}
                  />
                  {edge.label ? (
                    <>
                      <rect
                        x={edge.labelX! - 5}
                        y={edge.labelY! - 13}
                        width={edge.label.length * 12 + 10}
                        height={18}
                        rx={4}
                        style={{ fill: "var(--surface)" }}
                      />
                      <text
                        x={edge.labelX}
                        y={edge.labelY}
                        fontSize={12}
                        fontWeight={highlighted ? 600 : 500}
                        style={{
                          fill: highlighted
                            ? "var(--brand)"
                            : "var(--text-muted)",
                        }}
                      >
                        {edge.label}
                      </text>
                    </>
                  ) : null}
                </g>
              );
            })}

            {nodes.map((node) => {
              const style = nodeStyles[node.kind];
              const isActive = activeId === node.id;
              const totalTextHeight = (node.lines.length - 1) * LINE_HEIGHT;
              const firstLineY =
                node.y + node.h / 2 - totalTextHeight / 2 + FONT_SIZE * 0.35;

              return (
                <g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${kindLabels[node.kind]} 단계: ${node.title}. 선택하면 상세 설명이 표시됩니다.`}
                  className={[
                    "cursor-pointer outline-none transition-opacity duration-200 motion-reduce:transition-none",
                    isNodeDimmed(node.id) ? "opacity-15" : "opacity-100",
                  ].join(" ")}
                  onMouseEnter={() => setActiveId(node.id)}
                  onFocus={() => setActiveId(node.id)}
                  onBlur={() => setActiveId(null)}
                  onClick={() =>
                    setActiveId((current) =>
                      current === node.id ? null : node.id,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setActiveId(null);
                    }
                  }}
                >
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.w}
                    height={node.h}
                    rx={10}
                    strokeWidth={isActive ? 2.5 : style.strokeWidth}
                    strokeDasharray={isActive ? undefined : style.dash}
                    style={{
                      fill: style.fill,
                      stroke: isActive ? "var(--brand)" : style.stroke,
                    }}
                  />
                  {node.kind === "decision" || node.kind === "exit" ? (
                    <text
                      x={node.x + 10}
                      y={node.y - 7}
                      fontSize={11}
                      fontWeight={600}
                      style={{
                        fill:
                          node.kind === "decision"
                            ? "var(--brand)"
                            : "var(--text-muted)",
                      }}
                    >
                      {kindLabels[node.kind]}
                    </text>
                  ) : null}
                  <text
                    x={node.x + node.w / 2}
                    y={firstLineY}
                    textAnchor="middle"
                    fontSize={FONT_SIZE}
                    fontWeight={node.kind === "key" ? 600 : 500}
                    style={{ fill: style.text }}
                  >
                    {node.lines.map((line, index) => (
                      <tspan
                        key={index}
                        x={node.x + node.w / 2}
                        dy={index === 0 ? 0 : LINE_HEIGHT}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      <aside
        aria-label="선택한 단계 상세"
        aria-live="polite"
        className="sticky bottom-3 z-10 rounded-md border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg lg:bottom-auto lg:top-4 lg:shadow-none"
      >
        {activeNode ? (
          <>
            <p className="flex flex-wrap items-center gap-2">
              <span
                className={[
                  "rounded-sm px-1.5 py-0.5 text-xs font-semibold",
                  activeNode.kind === "exit"
                    ? "border border-[var(--border-strong)] bg-[var(--surface-muted)] text-[var(--text-muted)]"
                    : "bg-[var(--brand-soft)] text-[var(--brand)]",
                ].join(" ")}
              >
                {kindLabels[activeNode.kind]}
              </span>
            </p>
            <h3 className="mt-2 break-words text-[15px] font-semibold leading-snug text-[var(--foreground)] [overflow-wrap:anywhere]">
              {activeNode.title}
            </h3>
            <p className="mt-1.5 break-words text-sm leading-6 text-[var(--text-muted)] [overflow-wrap:anywhere]">
              {activeNode.description}
            </p>
            {activeNode.branches ? (
              <ul className="mt-3 space-y-2">
                {activeNode.branches.map((branch) => (
                  <li
                    key={branch.chip}
                    className={[
                      "rounded-md border px-3 py-2 text-sm leading-6",
                      branch.continues
                        ? "border-[var(--border)] bg-[var(--surface)]"
                        : "border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)]",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "mr-2 rounded-sm px-1.5 py-0.5 text-xs font-semibold",
                        branch.continues
                          ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                          : "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)]",
                      ].join(" ")}
                    >
                      {branch.chip}
                    </span>
                    <span
                      className={[
                        "break-words [overflow-wrap:anywhere]",
                        branch.continues
                          ? "text-[var(--foreground)]"
                          : "text-[var(--text-muted)]",
                      ].join(" ")}
                    >
                      {branch.text}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              단계 상세
            </h3>
            <p className="mt-1.5 text-sm leading-6 text-[var(--text-muted)]">
              순서도의 단계에 마우스를 올리거나 선택하면 상세 설명이 여기에
              표시됩니다.
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-[var(--text-muted)]">
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-sm border border-[var(--border-strong)] bg-[var(--surface)]" />
                일반 절차
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-sm border border-[var(--brand)] bg-[var(--brand-soft)]" />
                분기(판단) 지점
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-sm bg-[var(--brand)]" />
                핵심 단계(위탁 결정·입소)
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 rounded-sm border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)]" />
                바자울 경로에서 벗어나는 길
              </li>
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}
