"use client";

import NextImage from "next/image";
import { useActionState, useRef, useState, useTransition } from "react";
import {
  removeSignatureImageAction,
  updateSignatureImageAction,
  type SignatureImageState,
} from "@/app/account/actions";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  signatureImageCompressionMaxDimension,
  signatureImageCompressionMimeType,
  signatureImageCompressionQualitySteps,
  getSignatureImagePolicyText,
  signatureImageInputName,
  signatureImagePolicy,
} from "@/lib/signature-image-policy";

const initialState: SignatureImageState = {};
const compressibleImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type SignatureImageFormProps = {
  hasSignatureImage: boolean;
  userId: string;
};

export function SignatureImageForm({
  hasSignatureImage,
  userId,
}: SignatureImageFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clientError, setClientError] = useState("");
  const [compressionMessage, setCompressionMessage] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [isSubmittingCompressedImage, startCompressedImageSubmit] =
    useTransition();
  const [uploadState, uploadAction, uploading] = useActionState(
    updateSignatureImageAction,
    initialState,
  );
  const [removeState, removeAction, removing] = useActionState(
    removeSignatureImageAction,
    initialState,
  );
  const state =
    uploadState.error || uploadState.success ? uploadState : removeState;
  const uploadPending = uploading || compressing || isSubmittingCompressedImage;

  async function handleUploadSubmit(event: React.FormEvent<HTMLFormElement>) {
    const selectedFile = fileInputRef.current?.files?.[0];

    if (!selectedFile || !compressibleImageTypes.has(selectedFile.type)) {
      return;
    }

    event.preventDefault();
    setClientError("");
    setCompressionMessage("");
    setCompressing(true);

    try {
      const formData = new FormData(event.currentTarget);
      const compressedFile = await compressSignatureImage(selectedFile);
      const shouldUseCompressedFile =
        selectedFile.size > getMaxSignatureImageBytes() ||
        compressedFile.size < selectedFile.size;

      if (shouldUseCompressedFile) {
        formData.set(signatureImageInputName, compressedFile);
        setCompressionMessage(
          `${formatFileSize(selectedFile.size)}에서 ${formatFileSize(compressedFile.size)}로 압축했습니다.`,
        );
      }

      startCompressedImageSubmit(() => {
        uploadAction(formData);
      });
    } catch {
      setClientError("이미지를 압축하지 못했습니다. 다른 파일을 선택하세요.");
    } finally {
      setCompressing(false);
    }
  }

  return (
    <div className="space-y-4">
      {hasSignatureImage ? (
        <div className="rounded-md border border-[#d9dee7] bg-[#fbfcfd] p-4">
          <p className="text-xs font-semibold text-[#697386]">
            등록된 도장/서명 이미지
          </p>
          <div className="mt-3 flex min-h-24 items-center justify-center rounded-md border border-dashed border-[#cfd6e3] bg-white p-3">
            <NextImage
              src={getSignatureImageSrc(userId)}
              alt="등록된 결재 도장/서명 이미지"
              width={220}
              height={120}
              unoptimized
              className="max-h-24 w-auto object-contain"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-5 text-sm text-[#697386]">
          등록된 도장/서명 이미지가 없습니다.
        </div>
      )}

      <form
        action={uploadAction}
        className="space-y-3"
        onSubmit={handleUploadSubmit}
      >
        <div>
          <label
            htmlFor={signatureImageInputName}
            className="text-sm font-semibold text-[#394150]"
          >
            도장/서명 이미지
          </label>
          <input
            id={signatureImageInputName}
            name={signatureImageInputName}
            type="file"
            ref={fileInputRef}
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            aria-invalid={Boolean(clientError || uploadState.error)}
            onChange={() => {
              setClientError("");
              setCompressionMessage("");
            }}
            className={[
              "mt-2 block w-full rounded-md border bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#e5f2f1] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#0f5553] hover:file:bg-[#d7eceb]",
              clientError || uploadState.error
                ? "border-[#d92d20]"
                : "border-[#cfd6e3]",
            ].join(" ")}
          />
          <p className="mt-2 text-xs text-[#697386]">
            {getSignatureImagePolicyText()}
          </p>
          {compressionMessage ? (
            <p className="mt-2 text-xs font-medium text-[#2f4d68]">
              {compressionMessage}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={uploadPending}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.save,
            "h-10 px-4 text-sm",
          )}
        >
          {compressing ? "압축 중" : uploadPending ? "저장 중" : "이미지 저장"}
        </button>
      </form>

      {hasSignatureImage ? (
        <form action={removeAction}>
          <button
            type="submit"
            disabled={removing}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.dangerOutline,
              "h-10 px-4 text-sm",
            )}
          >
            {removing ? "삭제 중" : "이미지 삭제"}
          </button>
        </form>
      ) : null}

      {clientError || state.error ? (
        <p className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
          {clientError || state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="rounded-md border border-[#bddfc9] bg-[#e8f5ed] px-3 py-2 text-sm text-[#22633a]">
          {state.success}
        </p>
      ) : null}
    </div>
  );
}

async function compressSignatureImage(file: File) {
  const image = await loadImage(file);
  const { width, height } = getScaledImageSize(
    image.width,
    image.height,
    signatureImageCompressionMaxDimension,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is unavailable.");
  }

  context.drawImage(image, 0, 0, width, height);

  const blobs = await Promise.all(
    signatureImageCompressionQualitySteps.map((quality) =>
      canvasToBlob(canvas, signatureImageCompressionMimeType, quality),
    ),
  );
  const maxBytes = getMaxSignatureImageBytes();
  const blob =
    blobs.find((candidate) => candidate.size <= maxBytes) ??
    blobs.reduce((smallest, candidate) =>
      candidate.size < smallest.size ? candidate : smallest,
    );

  return new File([blob], getCompressedFileName(file.name), {
    type: signatureImageCompressionMimeType,
  });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image load failed."));
    };
    image.src = objectUrl;
  });
}

function getScaledImageSize(width: number, height: number, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Image compression failed."));
          return;
        }

        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

function getCompressedFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "").trim() || "signature-image";

  return `${baseName}.webp`;
}

function getMaxSignatureImageBytes() {
  return signatureImagePolicy.maxFileSizeMb * 1024 * 1024;
}

function getSignatureImageSrc(userId: string) {
  return `/signature-images/${userId}`;
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
