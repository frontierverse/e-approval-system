import { PDFDocument } from "pdf-lib";
import type sharpFactory from "sharp";
import { getAttachmentPreviewKind } from "@/lib/attachment-preview";

export type SignaturePlacement = {
  page: number;
  x: number;
  y: number;
  size: number;
};

export type SignedAttachmentFile = {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
};

type CreateSignedAttachmentFileInput = {
  originalName: string;
  mimeType: string;
  placement?: SignaturePlacement;
  placements?: SignaturePlacement[];
  sourceBuffer: Buffer;
  signatureBuffer: Buffer;
};

type SignaturePng = {
  buffer: Buffer;
  width: number;
  height: number;
};

type Sharp = typeof sharpFactory;

const minSignatureSize = 24;
const maxSignatureSize = 600;
const maxCoordinate = 100000;
const maxSignaturePlacements = 12;

export function parseSignaturePlacement(formData: FormData):
  | { ok: true; placement: SignaturePlacement }
  | { ok: false; message: string } {
  const page = readNumber(formData, "page");
  const x = readNumber(formData, "x");
  const y = readNumber(formData, "y");
  const size = readNumber(formData, "size");

  if (page === null || x === null || y === null || size === null) {
    return {
      ok: false,
      message: "도장 위치 값이 올바르지 않습니다.",
    };
  }

  return normalizeSignaturePlacement({ page, x, y, size });
}

export function parseSignaturePlacements(formData: FormData):
  | { ok: true; placements: SignaturePlacement[] }
  | { ok: false; message: string } {
  const rawPlacements = formData.get("placements");

  if (typeof rawPlacements !== "string" || !rawPlacements.trim()) {
    const placement = parseSignaturePlacement(formData);

    if (!placement.ok) {
      return placement;
    }

    return {
      ok: true,
      placements: [placement.placement],
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawPlacements);
  } catch {
    return {
      ok: false,
      message: "도장 위치 값이 올바르지 않습니다.",
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      message: "도장 위치 값이 올바르지 않습니다.",
    };
  }

  return normalizeSignaturePlacements(parsed);
}

export function normalizeSignaturePlacements(
  value: unknown[],
):
  | { ok: true; placements: SignaturePlacement[] }
  | { ok: false; message: string } {
  if (value.length === 0) {
    return {
      ok: false,
      message: "추가된 도장이 없습니다.",
    };
  }

  if (value.length > maxSignaturePlacements) {
    return {
      ok: false,
      message: `도장은 최대 ${maxSignaturePlacements}개까지 추가할 수 있습니다.`,
    };
  }

  const placements: SignaturePlacement[] = [];

  for (const item of value) {
    if (!isRawSignaturePlacement(item)) {
      return {
        ok: false,
        message: "도장 위치 값이 올바르지 않습니다.",
      };
    }

    const placement = normalizeSignaturePlacement(item);

    if (!placement.ok) {
      return placement;
    }

    placements.push(placement.placement);
  }

  return {
    ok: true,
    placements,
  };
}

export function normalizeSignaturePlacement(
  placement: SignaturePlacement,
):
  | { ok: true; placement: SignaturePlacement }
  | { ok: false; message: string } {
  if (
    !Number.isFinite(placement.page) ||
    !Number.isFinite(placement.x) ||
    !Number.isFinite(placement.y) ||
    !Number.isFinite(placement.size)
  ) {
    return {
      ok: false,
      message: "도장 위치 값이 올바르지 않습니다.",
    };
  }

  const page = Math.trunc(placement.page);
  const x = Math.round(placement.x);
  const y = Math.round(placement.y);
  const size = Math.round(placement.size);

  if (page < 1) {
    return {
      ok: false,
      message: "페이지는 1 이상이어야 합니다.",
    };
  }

  if (x < 0 || y < 0 || x > maxCoordinate || y > maxCoordinate) {
    return {
      ok: false,
      message: "도장 좌표가 허용 범위를 벗어났습니다.",
    };
  }

  if (size < minSignatureSize || size > maxSignatureSize) {
    return {
      ok: false,
      message: `도장 크기는 ${minSignatureSize}px 이상 ${maxSignatureSize}px 이하로 지정하세요.`,
    };
  }

  return {
    ok: true,
    placement: { page, x, y, size },
  };
}

export async function createSignedAttachmentFile({
  mimeType,
  originalName,
  placement,
  placements,
  signatureBuffer,
  sourceBuffer,
}: CreateSignedAttachmentFileInput): Promise<SignedAttachmentFile> {
  const previewKind = getAttachmentPreviewKind(originalName, mimeType);
  const signaturePlacements = placements ?? (placement ? [placement] : []);

  if (signaturePlacements.length === 0) {
    throw new Error("추가된 도장이 없습니다.");
  }

  if (previewKind === "pdf") {
    return {
      originalName: createSignedOriginalName(originalName, ".pdf"),
      mimeType: "application/pdf",
      buffer: await signPdf(sourceBuffer, signatureBuffer, signaturePlacements),
    };
  }

  if (previewKind === "image") {
    return {
      originalName: createSignedOriginalName(originalName, ".png"),
      mimeType: "image/png",
      buffer: await signImage(sourceBuffer, signatureBuffer, signaturePlacements),
    };
  }

  throw new Error("도장 찍기를 지원하지 않는 첨부파일입니다.");
}

export function createSignedOriginalName(originalName: string, extension: string) {
  const trimmedName = originalName.trim() || "attachment";
  const dotIndex = trimmedName.lastIndexOf(".");
  const baseName =
    dotIndex > 0 ? trimmedName.slice(0, dotIndex) : trimmedName;

  return `${baseName}_서명본${extension}`;
}

async function signPdf(
  sourceBuffer: Buffer,
  signatureBuffer: Buffer,
  placements: SignaturePlacement[],
) {
  let pdfDocument: PDFDocument;

  try {
    pdfDocument = await PDFDocument.load(sourceBuffer);
  } catch {
    throw new Error("PDF 파일을 읽을 수 없습니다.");
  }

  const pages = pdfDocument.getPages();
  const embeddedSignature = await embedSignatureImage(
    pdfDocument,
    signatureBuffer,
  );

  for (const placement of placements) {
    const page = pages[placement.page - 1];

    if (!page) {
      throw new Error("지정한 페이지를 찾을 수 없습니다.");
    }

    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const width = Math.min(placement.size, pageWidth);
    const height =
      embeddedSignature.height * (width / embeddedSignature.width);
    const x = clamp(placement.x, 0, Math.max(0, pageWidth - width));
    const top = clamp(placement.y, 0, Math.max(0, pageHeight - height));
    const y = pageHeight - top - height;

    page.drawImage(embeddedSignature.image, {
      x,
      y,
      width,
      height,
      opacity: 0.9,
    });
  }

  return Buffer.from(await pdfDocument.save());
}

async function signImage(
  sourceBuffer: Buffer,
  signatureBuffer: Buffer,
  placements: SignaturePlacement[],
) {
  const sharp = await getSharp();
  const sourceMetadata = await sharp(sourceBuffer, { failOn: "none" })
    .rotate()
    .metadata();

  if (!sourceMetadata.width || !sourceMetadata.height) {
    throw new Error("이미지 파일을 읽을 수 없습니다.");
  }

  const compositeInputs = await Promise.all(
    placements.map(async (placement) => {
      const signature = await createSignaturePng(signatureBuffer, placement.size);
      const left = clamp(
        placement.x,
        0,
        Math.max(0, sourceMetadata.width - signature.width),
      );
      const top = clamp(
        placement.y,
        0,
        Math.max(0, sourceMetadata.height - signature.height),
      );

      return {
        input: signature.buffer,
        left: Math.round(left),
        top: Math.round(top),
      };
    }),
  );

  return sharp(sourceBuffer, { failOn: "none" })
    .rotate()
    .composite(compositeInputs)
    .png()
    .toBuffer();
}

async function createSignaturePng(
  signatureBuffer: Buffer,
  targetWidth: number,
): Promise<SignaturePng> {
  const sharp = await getSharp();
  const buffer = await sharp(signatureBuffer, { failOn: "none" })
    .resize({
      width: targetWidth,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(buffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("도장/서명 이미지를 읽을 수 없습니다.");
  }

  return {
    buffer,
    width: metadata.width,
    height: metadata.height,
  };
}

async function embedSignatureImage(
  pdfDocument: PDFDocument,
  signatureBuffer: Buffer,
) {
  try {
    const image = await pdfDocument.embedPng(signatureBuffer);
    const dimensions = image.scale(1);

    return {
      image,
      width: dimensions.width,
      height: dimensions.height,
    };
  } catch {
    try {
      const image = await pdfDocument.embedJpg(signatureBuffer);
      const dimensions = image.scale(1);

      return {
        image,
        width: dimensions.width,
        height: dimensions.height,
      };
    } catch {
      const signature = await createSignaturePng(signatureBuffer, maxSignatureSize);
      const image = await pdfDocument.embedPng(signature.buffer);

      return {
        image,
        width: signature.width,
        height: signature.height,
      };
    }
  }
}

async function getSharp(): Promise<Sharp> {
  const sharpModule = await import("sharp");

  return (sharpModule.default ?? sharpModule) as Sharp;
}

function readNumber(formData: FormData, name: string) {
  const value = formData.get(name);

  if (typeof value !== "string") {
    return null;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function isRawSignaturePlacement(value: unknown): value is SignaturePlacement {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Record<keyof SignaturePlacement, unknown>>;

  return (
    typeof candidate.page === "number" &&
    typeof candidate.x === "number" &&
    typeof candidate.y === "number" &&
    typeof candidate.size === "number"
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
