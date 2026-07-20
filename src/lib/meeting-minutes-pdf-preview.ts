import { meetingMinutesTemplateId } from "@/lib/document-template-schema";

export type MeetingMinutesPdfPreviewValues = {
  approverIds: string[];
  content: string;
  templateId: string;
  title: string;
};

export type MeetingMinutesPdfPreviewParseResult =
  | { ok: true; values: MeetingMinutesPdfPreviewValues }
  | { ok: false; error: string };

const maxApproverCount = 20;
const maxContentLength = 5000;
const maxTitleLength = 120;

export function parseMeetingMinutesPdfPreviewRequest(
  body: unknown,
): MeetingMinutesPdfPreviewParseResult {
  if (!isRecord(body)) {
    return { ok: false, error: "미리보기 요청 형식이 올바르지 않습니다." };
  }

  const templateId = readTrimmedString(body.templateId);

  if (templateId !== meetingMinutesTemplateId) {
    return { ok: false, error: "회의록 양식만 미리볼 수 있습니다." };
  }

  if (typeof body.title !== "string") {
    return { ok: false, error: "제목을 확인해 주세요." };
  }

  const title = body.title.trim();

  if (title.length > maxTitleLength) {
    return {
      ok: false,
      error: `제목은 ${maxTitleLength}자 이내로 입력하세요.`,
    };
  }

  if (typeof body.content !== "string") {
    return { ok: false, error: "회의록 내용을 확인해 주세요." };
  }

  const content = body.content.trim();

  if (content.length > maxContentLength) {
    return {
      ok: false,
      error: `회의록 내용은 ${maxContentLength}자 이내로 입력하세요.`,
    };
  }

  if (!Array.isArray(body.approverIds)) {
    return { ok: false, error: "결재선 정보를 확인해 주세요." };
  }

  const approverIds = body.approverIds.map(readTrimmedString);

  if (
    approverIds.some((approverId) => !approverId) ||
    approverIds.length > maxApproverCount ||
    new Set(approverIds).size !== approverIds.length
  ) {
    return { ok: false, error: "결재선 정보를 확인해 주세요." };
  }

  return {
    ok: true,
    values: {
      approverIds,
      content,
      templateId,
      title,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
