"use client";

import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { AppModal } from "@/components/app-modal";
import { SplitDateInput } from "@/components/split-date-input";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  createEmptyRefrigeratorItems,
  createEmptyRefrigeratorPhotos,
  getRefrigeratorLocationTitle,
  isRefrigeratorLocationId,
  readRefrigeratorItemsFromStorage,
  readRefrigeratorPhotosFromStorage,
  removeRefrigeratorItemFromLocation,
  refrigeratorLocations,
  saveRefrigeratorItemToLocation,
  writeRefrigeratorItemsToStorage,
  writeRefrigeratorPhotosToStorage,
  type RefrigeratorItem,
  type RefrigeratorLocationId,
} from "@/lib/refrigerator-items-core";

const refrigeratorItemCategories = ["식품", "음료", "간식", "조미료", "기타"];
const refrigeratorTableBodyHeightClassName = "h-[27.5rem]";
const refrigeratorTableRowClassName = "h-11";
const refrigeratorPhotoCompressionMaxBytes = 256 * 1024;
const refrigeratorPhotoCompressionMaxDimension = 640;
const refrigeratorPhotoCompressionMimeType = "image/webp";
const refrigeratorPhotoCompressionQualitySteps = [0.72, 0.58, 0.44] as const;
const refrigeratorItemPhotoPreviewOffset = 14;
const refrigeratorItemPhotoPreviewSize = 224;

type SelectedRefrigeratorItem = {
  item: RefrigeratorItem;
  locationId: RefrigeratorLocationId;
};

type RefrigeratorItemPhotoPreview = {
  alt: string;
  src: string;
  x: number;
  y: number;
};

export function RefrigeratorManagementBoard() {
  const [itemsByLocation, setItemsByLocation] = useState(
    createEmptyRefrigeratorItems,
  );
  const [photosByLocation, setPhotosByLocation] = useState(
    createEmptyRefrigeratorPhotos,
  );
  const [photoError, setPhotoError] = useState("");
  const [uploadingPhotoLocationId, setUploadingPhotoLocationId] =
    useState<RefrigeratorLocationId | null>(null);
  const [draftExpirationDate, setDraftExpirationDate] = useState("");
  const [draftPurchasedAt, setDraftPurchasedAt] = useState("");
  const [itemPhotoError, setItemPhotoError] = useState("");
  const [itemPhotoSrc, setItemPhotoSrc] = useState("");
  const [uploadingItemPhoto, setUploadingItemPhoto] = useState(false);
  const [selectedItem, setSelectedItem] =
    useState<SelectedRefrigeratorItem | null>(null);
  const [selectedLocationId, setSelectedLocationId] =
    useState<RefrigeratorLocationId | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const activeLocationId = selectedItem?.locationId ?? selectedLocationId;
  const selectedLocationTitle = activeLocationId
    ? getRefrigeratorLocationTitle(activeLocationId)
    : "";
  const selectedItemValue = selectedItem?.item ?? null;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setItemsByLocation(readRefrigeratorItemsFromStorage());
      setPhotosByLocation(readRefrigeratorPhotosFromStorage());
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  function closeRegistrationModal() {
    setSelectedItem(null);
    setSelectedLocationId(null);
    setDraftExpirationDate("");
    setDraftPurchasedAt("");
    setItemPhotoError("");
    setItemPhotoSrc("");
    setUploadingItemPhoto(false);
  }

  function openRegistrationModal(locationId: RefrigeratorLocationId) {
    setSelectedItem(null);
    setSelectedLocationId(locationId);
    setDraftExpirationDate("");
    setDraftPurchasedAt("");
    setItemPhotoError("");
    setItemPhotoSrc("");
  }

  function openItemModal(
    locationId: RefrigeratorLocationId,
    item: RefrigeratorItem,
  ) {
    setSelectedItem({ item, locationId });
    setSelectedLocationId(locationId);
    setDraftExpirationDate(item.expirationDate);
    setDraftPurchasedAt(item.purchasedAt);
    setItemPhotoError("");
    setItemPhotoSrc(item.photoSrc ?? "");
  }

  async function handlePhotoChange(
    locationId: RefrigeratorLocationId,
    file: File | null,
  ) {
    if (!file) {
      return;
    }

    if (file.type && !file.type.startsWith("image/")) {
      setPhotoError("이미지 파일만 첨부할 수 있습니다.");
      return;
    }

    setPhotoError("");
    setUploadingPhotoLocationId(locationId);

    try {
      const compressedPhoto = await compressRefrigeratorPhoto(file);
      const nextPhotos = {
        ...readRefrigeratorPhotosFromStorage(),
        [locationId]: compressedPhoto,
      };

      writeRefrigeratorPhotosToStorage(nextPhotos);
      setPhotosByLocation(nextPhotos);
    } catch {
      setPhotoError("사진을 압축해서 저장하지 못했습니다. 다른 이미지를 다시 첨부해 주세요.");
    } finally {
      setUploadingPhotoLocationId(null);
    }
  }

  async function handleItemPhotoChange(file: File | null) {
    if (!file) {
      return;
    }

    if (file.type && !file.type.startsWith("image/")) {
      setItemPhotoError("이미지 파일만 첨부할 수 있습니다.");
      return;
    }

    setItemPhotoError("");
    setUploadingItemPhoto(true);

    try {
      setItemPhotoSrc(await compressRefrigeratorPhoto(file));
    } catch {
      setItemPhotoError("사진을 압축하지 못했습니다. 다른 이미지를 다시 첨부해 주세요.");
    } finally {
      setUploadingItemPhoto(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeLocationId) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const locationValue = String(formData.get("locationId") ?? "").trim();

    if (!isRefrigeratorLocationId(locationValue)) {
      return;
    }

    const item: RefrigeratorItem = {
      category: String(formData.get("category") ?? "").trim(),
      expirationDate: normalizeOptionalRefrigeratorDateInput(
        String(formData.get("expirationDate") ?? "").trim(),
      ),
      id: selectedItemValue?.id ?? `${locationValue}-${Date.now()}`,
      name: String(formData.get("name") ?? "").trim(),
      photoSrc: itemPhotoSrc,
      purchasedAt: normalizeOptionalRefrigeratorDateInput(
        String(formData.get("purchasedAt") ?? "").trim(),
      ),
    };

    if (!item.name) {
      return;
    }

    const nextItems = saveRefrigeratorItemToLocation({
      item,
      itemsByLocation,
      previousLocationId: selectedItem?.locationId,
      targetLocationId: locationValue,
    });

    setItemsByLocation(nextItems);
    writeRefrigeratorItemsToStorage(nextItems);
    closeRegistrationModal();
  }

  function handleDeleteSelectedItem() {
    if (!selectedItem) {
      return;
    }

    if (!window.confirm(`"${selectedItem.item.name}" 식품을 삭제할까요?`)) {
      return;
    }

    const nextItems = removeRefrigeratorItemFromLocation(
      itemsByLocation,
      selectedItem.locationId,
      selectedItem.item.id,
    );

    setItemsByLocation(nextItems);
    writeRefrigeratorItemsToStorage(nextItems);
    closeRegistrationModal();
  }

  return (
    <>
      <section
        aria-label="냉장고 관리"
        className="grid min-w-0 gap-5 lg:grid-cols-2"
      >
        {refrigeratorLocations.map((location) => (
          <RefrigeratorColumn
            key={location.id}
            items={itemsByLocation[location.id]}
            onAdd={() => openRegistrationModal(location.id)}
            onItemSelect={(item) => openItemModal(location.id, item)}
            onPhotoChange={(file) => handlePhotoChange(location.id, file)}
            photoSrc={photosByLocation[location.id]}
            photoUploading={uploadingPhotoLocationId === location.id}
            title={location.title}
          />
        ))}
      </section>

      {photoError ? (
        <p className="mt-3 text-sm font-semibold text-[#9d3f00]" role="alert">
          {photoError}
        </p>
      ) : null}

      {activeLocationId ? (
        <AppModal
          className="max-w-lg"
          describedBy={descriptionId}
          labelledBy={titleId}
          onClose={closeRegistrationModal}
        >
          <form onSubmit={handleSubmit}>
            <div className="flex items-start justify-between gap-4 border-b border-[#eef1f5] px-5 py-4">
              <div>
                <p className="text-xs font-semibold text-[#196b69]">
                  {selectedLocationTitle}
                </p>
                <h2
                  id={titleId}
                  className="mt-1 text-xl font-semibold leading-tight text-[#16181d]"
                >
                  {selectedItemValue ? "식품 수정" : "식품 추가"}
                </h2>
                <p id={descriptionId} className="mt-2 text-sm text-[#697386]">
                  {selectedItemValue
                    ? "식품 정보를 수정하거나 삭제합니다."
                    : "냉장고에 보관할 식품 정보를 입력합니다."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeRegistrationModal}
                className="h-9 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm font-semibold text-[#394150] transition hover:bg-[#f7f9fc]"
              >
                닫기
              </button>
            </div>

            <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
              <div className="block min-w-0 sm:col-span-2">
                <span className="block text-xs font-semibold text-[#697386]">
                  식품 사진
                  <span className="ml-1 font-normal text-[#9aa4b2]">(선택)</span>
                </span>
                <div className="mt-2">
                  <RefrigeratorPhotoSlot
                    ariaLabel="식품 사진 첨부"
                    imageAlt="식품 사진"
                    onPhotoChange={handleItemPhotoChange}
                    photoSrc={itemPhotoSrc}
                    photoUploading={uploadingItemPhoto}
                    title="식품"
                  />
                </div>
                {itemPhotoError ? (
                  <p className="mt-2 text-sm font-semibold text-[#9d3f00]" role="alert">
                    {itemPhotoError}
                  </p>
                ) : null}
              </div>

              <label className="block min-w-0 sm:col-span-2">
                <span className="block text-xs font-semibold text-[#697386]">
                  냉장고
                  <span className="ml-1 font-normal text-[#9aa4b2]">(선택)</span>
                </span>
                <select
                  name="locationId"
                  defaultValue={activeLocationId}
                  className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                >
                  {refrigeratorLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block min-w-0 sm:col-span-2">
                <span className="block text-xs font-semibold text-[#697386]">
                  식품명
                  <span aria-hidden="true" className="ml-1 text-[#c62828]">
                    *
                  </span>
                  <span className="sr-only">필수</span>
                </span>
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={selectedItemValue?.name ?? ""}
                  placeholder="예: 우유, 계란, 샐러드"
                  className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                />
              </label>

              <label className="block min-w-0">
                <span className="block text-xs font-semibold text-[#697386]">
                  카테고리
                  <span className="ml-1 font-normal text-[#9aa4b2]">(선택)</span>
                </span>
                <select
                  name="category"
                  defaultValue={selectedItemValue?.category ?? ""}
                  className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
                >
                  <option value="">선택 안 함</option>
                  {refrigeratorItemCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <div className="block min-w-0">
                <span className="block text-xs font-semibold text-[#697386]">
                  구매일
                  <span className="ml-1 font-normal text-[#9aa4b2]">(선택)</span>
                </span>
                <input
                  name="purchasedAt"
                  readOnly
                  type="hidden"
                  value={draftPurchasedAt}
                />
                <SplitDateInput
                  ariaLabel="구매일"
                  className="h-10 bg-white"
                  onChange={setDraftPurchasedAt}
                  value={draftPurchasedAt}
                />
              </div>

              <div className="block min-w-0 sm:col-span-2">
                <span className="block text-xs font-semibold text-[#697386]">
                  유통기한
                  <span className="ml-1 font-normal text-[#9aa4b2]">(선택)</span>
                </span>
                <input
                  name="expirationDate"
                  readOnly
                  type="hidden"
                  value={draftExpirationDate}
                />
                <SplitDateInput
                  ariaLabel="유통기한"
                  className="h-10 bg-white"
                  onChange={setDraftExpirationDate}
                  value={draftExpirationDate}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eef1f5] px-5 py-4">
              {selectedItemValue ? (
                <button
                  type="button"
                  onClick={handleDeleteSelectedItem}
                  className="h-10 rounded-md border border-[#f1c7c7] bg-white px-4 text-sm font-semibold text-[#b42318] transition hover:bg-[#fff5f5]"
                >
                  삭제
                </button>
              ) : (
                <span aria-hidden="true" />
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeRegistrationModal}
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.neutral,
                    "h-10 px-4 text-sm",
                  )}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className={buttonClass(
                    buttonStyles.base,
                    buttonStyles.create,
                    "h-10 px-4 text-sm",
                  )}
                >
                  {selectedItemValue ? "저장" : "추가"}
                </button>
              </div>
            </div>
          </form>
        </AppModal>
      ) : null}
    </>
  );
}

function RefrigeratorColumn({
  items,
  onAdd,
  onItemSelect,
  onPhotoChange,
  photoSrc,
  photoUploading,
  title,
}: {
  items: RefrigeratorItem[];
  onAdd: () => void;
  onItemSelect: (item: RefrigeratorItem) => void;
  onPhotoChange: (file: File | null) => void;
  photoSrc: string;
  photoUploading: boolean;
  title: string;
}) {
  const [itemPhotoPreview, setItemPhotoPreview] =
    useState<RefrigeratorItemPhotoPreview | null>(null);

  function showItemPhotoPreview(
    item: RefrigeratorItem,
    event: MouseEvent<HTMLElement>,
  ) {
    if (!item.photoSrc) {
      return;
    }

    const position = getRefrigeratorItemPhotoPreviewPosition(
      event.clientX,
      event.clientY,
    );

    setItemPhotoPreview({
      alt: `${item.name} 사진`,
      src: item.photoSrc,
      x: position.x,
      y: position.y,
    });
  }

  function moveItemPhotoPreview(event: MouseEvent<HTMLElement>) {
    setItemPhotoPreview((currentPreview) => {
      if (!currentPreview) {
        return currentPreview;
      }

      const position = getRefrigeratorItemPhotoPreviewPosition(
        event.clientX,
        event.clientY,
      );

      return {
        ...currentPreview,
        x: position.x,
        y: position.y,
      };
    });
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-[#d9dee7] bg-white shadow-sm">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-[#eef1f5] px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <RefrigeratorPhotoSlot
            onPhotoChange={onPhotoChange}
            photoSrc={photoSrc}
            photoUploading={photoUploading}
            title={title}
          />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#16181d]">{title}</h2>
            <p className="mt-1 text-sm text-[#697386]">
              {items.length > 0
                ? `보관 식품 ${items.length}개`
                : "등록된 식품이 없습니다."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.create,
            "h-9 shrink-0 gap-1.5 px-3 text-sm",
          )}
        >
          <span aria-hidden="true" className="text-base leading-none">
            +
          </span>
          추가
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[#eef1f5] bg-[#f7f9fc] text-xs font-semibold text-[#394150]">
              <th className="w-[34%] px-4 py-3.5">식품명</th>
              <th className="w-[22%] px-4 py-3.5">카테고리</th>
              <th className="w-[22%] px-4 py-3.5">구매일</th>
              <th className="w-[22%] px-4 py-3.5">유통기한</th>
            </tr>
          </thead>
        </table>
        <div className={`${refrigeratorTableBodyHeightClassName} overflow-y-auto`}>
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <tbody className="divide-y divide-[#eef1f5]">
              {items.length > 0 ? (
                items.map((item) => (
                  <tr
                    key={item.id}
                    aria-label={`${item.name} 식품 수정`}
                    className={`${refrigeratorTableRowClassName} cursor-pointer transition hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#d7eceb]`}
                    onClick={() => onItemSelect(item)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") {
                        return;
                      }

                      event.preventDefault();
                      onItemSelect(item);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td className="w-[34%] px-4 py-1.5 font-semibold text-[#16181d]">
                      <div className="flex min-w-0 items-center gap-2">
                        <RefrigeratorItemThumbnail
                          item={item}
                          onPreviewHide={() => setItemPhotoPreview(null)}
                          onPreviewMove={moveItemPhotoPreview}
                          onPreviewShow={(event) => showItemPhotoPreview(item, event)}
                        />
                        <span className="min-w-0 truncate">{item.name}</span>
                      </div>
                    </td>
                    <td className="w-[22%] px-4 py-1.5 text-[#394150]">
                      {formatRefrigeratorCellValue(item.category)}
                    </td>
                    <td className="w-[22%] px-4 py-1.5 text-[#394150]">
                      {formatRefrigeratorDate(item.purchasedAt)}
                    </td>
                    <td className="w-[22%] px-4 py-1.5 text-[#394150]">
                      {formatRefrigeratorDate(item.expirationDate)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="h-full">
                  <td
                    colSpan={4}
                    className="px-4 text-center text-sm text-[#697386]"
                  >
                    우측 상단 추가 버튼으로 식품을 등록하세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {itemPhotoPreview ? (
        <RefrigeratorItemPhotoPreviewLayer preview={itemPhotoPreview} />
      ) : null}
    </section>
  );
}

function RefrigeratorPhotoSlot({
  ariaLabel,
  imageAlt,
  onPhotoChange,
  photoSrc,
  photoUploading,
  title,
}: {
  ariaLabel?: string;
  imageAlt?: string;
  onPhotoChange: (file: File | null) => void;
  photoSrc: string;
  photoUploading: boolean;
  title: string;
}) {
  const [photoPreview, setPhotoPreview] =
    useState<RefrigeratorItemPhotoPreview | null>(null);
  const resolvedImageAlt = imageAlt ?? `${title} 냉장고 사진`;

  function showPhotoPreview(event: MouseEvent<HTMLElement>) {
    if (!photoSrc) {
      return;
    }

    const position = getRefrigeratorItemPhotoPreviewPosition(
      event.clientX,
      event.clientY,
    );

    setPhotoPreview({
      alt: resolvedImageAlt,
      src: photoSrc,
      x: position.x,
      y: position.y,
    });
  }

  function movePhotoPreview(event: MouseEvent<HTMLElement>) {
    setPhotoPreview((currentPreview) => {
      if (!currentPreview) {
        return currentPreview;
      }

      const position = getRefrigeratorItemPhotoPreviewPosition(
        event.clientX,
        event.clientY,
      );

      return {
        ...currentPreview,
        x: position.x,
        y: position.y,
      };
    });
  }

  return (
    <>
      <label
        aria-busy={photoUploading}
        aria-label={ariaLabel ?? `${title} 냉장고 사진 첨부`}
        className="group relative grid size-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md border border-dashed border-[#cfd6e3] bg-[#f7f9fc] text-[#196b69] transition hover:border-[#196b69] hover:bg-[#edf8f5]"
        onMouseEnter={photoSrc ? showPhotoPreview : undefined}
        onMouseLeave={photoSrc ? () => setPhotoPreview(null) : undefined}
        onMouseMove={photoSrc ? movePhotoPreview : undefined}
      >
        {photoSrc ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={resolvedImageAlt}
              className="h-full w-full object-cover"
              src={photoSrc}
            />
            <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
          </>
        ) : (
          <span aria-hidden="true" className="text-2xl font-semibold leading-none">
            {photoUploading ? "..." : "+"}
          </span>
        )}
        <input
          accept="image/*"
          aria-label={ariaLabel ?? `${title} 냉장고 사진 첨부`}
          className="sr-only"
          disabled={photoUploading}
          onChange={(event) => {
            onPhotoChange(event.currentTarget.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
          type="file"
        />
      </label>
      {photoPreview ? (
        <RefrigeratorItemPhotoPreviewLayer preview={photoPreview} />
      ) : null}
    </>
  );
}

function RefrigeratorItemThumbnail({
  item,
  onPreviewHide,
  onPreviewMove,
  onPreviewShow,
}: {
  item: RefrigeratorItem;
  onPreviewHide: () => void;
  onPreviewMove: (event: MouseEvent<HTMLElement>) => void;
  onPreviewShow: (event: MouseEvent<HTMLElement>) => void;
}) {
  return (
    <span
      aria-hidden={!item.photoSrc}
      className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-sm border border-[#d9dee7] bg-[#f7f9fc]"
      onMouseEnter={item.photoSrc ? onPreviewShow : undefined}
      onMouseLeave={item.photoSrc ? onPreviewHide : undefined}
      onMouseMove={item.photoSrc ? onPreviewMove : undefined}
    >
      {item.photoSrc ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={`${item.name} 사진`}
            className="h-full w-full object-cover"
            src={item.photoSrc}
          />
        </>
      ) : (
        <span className="size-3 rounded-sm border border-[#cfd6e3] bg-white" />
      )}
    </span>
  );
}

function RefrigeratorItemPhotoPreviewLayer({
  preview,
}: {
  preview: RefrigeratorItemPhotoPreview;
}) {
  return (
    <div
      className="pointer-events-none fixed z-[1000] overflow-hidden rounded-md border border-[#d9dee7] bg-white p-1 shadow-2xl"
      style={{
        height: refrigeratorItemPhotoPreviewSize,
        left: preview.x,
        top: preview.y,
        width: refrigeratorItemPhotoPreviewSize,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={preview.alt}
        className="h-full w-full rounded-[3px] object-cover"
        src={preview.src}
      />
    </div>
  );
}

function getRefrigeratorItemPhotoPreviewPosition(clientX: number, clientY: number) {
  if (typeof window === "undefined") {
    return {
      x: clientX + refrigeratorItemPhotoPreviewOffset,
      y: clientY + refrigeratorItemPhotoPreviewOffset,
    };
  }

  const horizontalOverflow =
    clientX +
    refrigeratorItemPhotoPreviewOffset +
    refrigeratorItemPhotoPreviewSize >
    window.innerWidth;
  const verticalOverflow =
    clientY +
    refrigeratorItemPhotoPreviewOffset +
    refrigeratorItemPhotoPreviewSize >
    window.innerHeight;
  const x = horizontalOverflow
    ? clientX - refrigeratorItemPhotoPreviewSize - refrigeratorItemPhotoPreviewOffset
    : clientX + refrigeratorItemPhotoPreviewOffset;
  const y = verticalOverflow
    ? clientY - refrigeratorItemPhotoPreviewSize - refrigeratorItemPhotoPreviewOffset
    : clientY + refrigeratorItemPhotoPreviewOffset;

  return {
    x: Math.max(8, x),
    y: Math.max(8, y),
  };
}

function normalizeOptionalRefrigeratorDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

async function compressRefrigeratorPhoto(file: File) {
  const image = await loadImage(file);
  const { width, height } = getScaledImageSize(
    image.width,
    image.height,
    refrigeratorPhotoCompressionMaxDimension,
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
    refrigeratorPhotoCompressionQualitySteps.map((quality) =>
      canvasToBlob(canvas, refrigeratorPhotoCompressionMimeType, quality),
    ),
  );
  const blob =
    blobs.find(
      (candidate) => candidate.size <= refrigeratorPhotoCompressionMaxBytes,
    ) ??
    blobs.reduce((smallest, candidate) =>
      candidate.size < smallest.size ? candidate : smallest,
    );

  return blobToDataUrl(blob);
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
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
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

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result));
    };
    reader.onerror = () => {
      reject(new Error("Image storage failed."));
    };
    reader.readAsDataURL(blob);
  });
}

function formatRefrigeratorDate(value: string) {
  return value ? value.replaceAll("-", ".") : "-";
}

function formatRefrigeratorCellValue(value: string) {
  return value || "-";
}
