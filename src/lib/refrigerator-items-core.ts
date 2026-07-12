import { getKoreanDateValue } from "@/lib/document-archive-policy";

export const refrigeratorItemsStorageKey = "e-approval:refrigerator-items:v1";
export const refrigeratorItemsStorageEventName =
  "e-approval:refrigerator-items-updated";
export const refrigeratorPhotosStorageKey = "e-approval:refrigerator-photos:v1";
export const refrigeratorPhotosStorageEventName =
  "e-approval:refrigerator-photos-updated";

export const refrigeratorLocations = [
  { id: "bajaul-1", title: "바자울 1" },
  { id: "bajaul-2", title: "바자울 2" },
] as const;

export type RefrigeratorLocationId = (typeof refrigeratorLocations)[number]["id"];

export type RefrigeratorItem = {
  category: string;
  expirationDate: string;
  id: string;
  name: string;
  photoSrc?: string;
  purchasedAt: string;
};

export type RefrigeratorItemsByLocation = Record<
  RefrigeratorLocationId,
  RefrigeratorItem[]
>;

export type RefrigeratorPhotosByLocation = Record<RefrigeratorLocationId, string>;

export type RefrigeratorFoodExpirationAlert = {
  ddayLabel: string;
  itemName: string;
  items: RefrigeratorFoodExpirationAlertItem[];
};

export type RefrigeratorFoodExpirationAlertItem = {
  ddayLabel: string;
  expirationDate: string;
  href: string;
  id: string;
  itemName: string;
  locationLabel: string;
};

const dayInMs = 24 * 60 * 60 * 1000;
const expirationAlertWindowDays = 31;

export function createEmptyRefrigeratorItems(): RefrigeratorItemsByLocation {
  return {
    "bajaul-1": [],
    "bajaul-2": [],
  };
}

export function createEmptyRefrigeratorPhotos(): RefrigeratorPhotosByLocation {
  return {
    "bajaul-1": "",
    "bajaul-2": "",
  };
}

export function removeRefrigeratorItemFromLocation(
  itemsByLocation: RefrigeratorItemsByLocation,
  locationId: RefrigeratorLocationId,
  itemId: string,
): RefrigeratorItemsByLocation {
  return {
    ...itemsByLocation,
    [locationId]: itemsByLocation[locationId].filter((item) => item.id !== itemId),
  };
}

export function removeRefrigeratorPhotoFromLocation(
  photosByLocation: RefrigeratorPhotosByLocation,
  locationId: RefrigeratorLocationId,
): RefrigeratorPhotosByLocation {
  return {
    ...photosByLocation,
    [locationId]: "",
  };
}

export function saveRefrigeratorItemToLocation({
  item,
  itemsByLocation,
  previousLocationId,
  targetLocationId,
}: {
  item: RefrigeratorItem;
  itemsByLocation: RefrigeratorItemsByLocation;
  previousLocationId?: RefrigeratorLocationId;
  targetLocationId: RefrigeratorLocationId;
}): RefrigeratorItemsByLocation {
  if (!previousLocationId) {
    return {
      ...itemsByLocation,
      [targetLocationId]: [item, ...itemsByLocation[targetLocationId]],
    };
  }

  if (previousLocationId === targetLocationId) {
    return {
      ...itemsByLocation,
      [targetLocationId]: itemsByLocation[targetLocationId].map((currentItem) =>
        currentItem.id === item.id ? item : currentItem,
      ),
    };
  }

  return {
    ...itemsByLocation,
    [previousLocationId]: itemsByLocation[previousLocationId].filter(
      (currentItem) => currentItem.id !== item.id,
    ),
    [targetLocationId]: [item, ...itemsByLocation[targetLocationId]],
  };
}

export function createRefrigeratorFoodExpirationAlert(
  itemsByLocation: RefrigeratorItemsByLocation,
  today = getKoreanDateValue(),
): RefrigeratorFoodExpirationAlert | null {
  const alertItems = refrigeratorLocations
    .flatMap((location): RefrigeratorFoodExpirationAlertItem[] =>
      itemsByLocation[location.id].flatMap((item) => {
        if (!isRefrigeratorDate(item.expirationDate)) {
          return [];
        }

        const daysUntil = getDateDiffInDays(today, item.expirationDate);

        if (daysUntil > expirationAlertWindowDays) {
          return [];
        }

        return [
          {
            ddayLabel: formatTargetDday(daysUntil),
            expirationDate: item.expirationDate,
            href: "/work-schedule/refrigerator",
            id: item.id,
            itemName: item.name,
            locationLabel: location.title,
          },
        ];
      }),
    )
    .sort(compareRefrigeratorFoodExpirationAlertItems);
  const firstItem = alertItems[0];

  if (!firstItem) {
    return null;
  }

  return {
    ddayLabel: firstItem.ddayLabel,
    itemName: firstItem.itemName,
    items: alertItems,
  };
}

export function getRefrigeratorLocationTitle(locationId: RefrigeratorLocationId) {
  return (
    refrigeratorLocations.find((location) => location.id === locationId)?.title ??
    ""
  );
}

export function isRefrigeratorLocationId(
  value: string,
): value is RefrigeratorLocationId {
  return refrigeratorLocations.some((location) => location.id === value);
}

export function parseRefrigeratorItemsByLocation(
  value: string | null,
): RefrigeratorItemsByLocation {
  if (!value) {
    return createEmptyRefrigeratorItems();
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return createEmptyRefrigeratorItems();
    }

    const source = parsed as Record<string, unknown>;
    const itemsByLocation = createEmptyRefrigeratorItems();

    refrigeratorLocations.forEach((location) => {
      const items = source[location.id];

      if (!Array.isArray(items)) {
        return;
      }

      itemsByLocation[location.id] = items.flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }

        const sourceItem = item as Record<string, unknown>;
        const normalizedItem: RefrigeratorItem = {
          category: getStringValue(sourceItem.category),
          expirationDate: getStringValue(sourceItem.expirationDate),
          id: getStringValue(sourceItem.id),
          name: getStringValue(sourceItem.name),
          photoSrc: getImageDataUrlValue(sourceItem.photoSrc),
          purchasedAt: getStringValue(sourceItem.purchasedAt),
        };

        return normalizedItem.id &&
          normalizedItem.name &&
          isOptionalRefrigeratorDate(normalizedItem.purchasedAt) &&
          isOptionalRefrigeratorDate(normalizedItem.expirationDate)
          ? [normalizedItem]
          : [];
      });
    });

    return itemsByLocation;
  } catch {
    return createEmptyRefrigeratorItems();
  }
}

export function parseRefrigeratorPhotosByLocation(
  value: string | null,
): RefrigeratorPhotosByLocation {
  if (!value) {
    return createEmptyRefrigeratorPhotos();
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return createEmptyRefrigeratorPhotos();
    }

    const source = parsed as Record<string, unknown>;
    const photosByLocation = createEmptyRefrigeratorPhotos();

    refrigeratorLocations.forEach((location) => {
      const photo = source[location.id];

      if (isImageDataUrl(photo)) {
        photosByLocation[location.id] = photo;
      }
    });

    return photosByLocation;
  } catch {
    return createEmptyRefrigeratorPhotos();
  }
}

export function readRefrigeratorItemsFromStorage() {
  if (typeof window === "undefined") {
    return createEmptyRefrigeratorItems();
  }

  return parseRefrigeratorItemsByLocation(
    window.localStorage.getItem(refrigeratorItemsStorageKey),
  );
}

export function readRefrigeratorPhotosFromStorage() {
  if (typeof window === "undefined") {
    return createEmptyRefrigeratorPhotos();
  }

  return parseRefrigeratorPhotosByLocation(
    window.localStorage.getItem(refrigeratorPhotosStorageKey),
  );
}

export function writeRefrigeratorItemsToStorage(
  itemsByLocation: RefrigeratorItemsByLocation,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    refrigeratorItemsStorageKey,
    JSON.stringify(itemsByLocation),
  );
  window.dispatchEvent(new Event(refrigeratorItemsStorageEventName));
}

export function writeRefrigeratorPhotosToStorage(
  photosByLocation: RefrigeratorPhotosByLocation,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    refrigeratorPhotosStorageKey,
    JSON.stringify(photosByLocation),
  );
  window.dispatchEvent(new Event(refrigeratorPhotosStorageEventName));
}

function compareRefrigeratorFoodExpirationAlertItems(
  first: RefrigeratorFoodExpirationAlertItem,
  second: RefrigeratorFoodExpirationAlertItem,
) {
  return (
    first.expirationDate.localeCompare(second.expirationDate) ||
    first.locationLabel.localeCompare(second.locationLabel, "ko-KR") ||
    first.itemName.localeCompare(second.itemName, "ko-KR")
  );
}

function formatTargetDday(daysUntil: number) {
  if (daysUntil === 0) {
    return "D-Day";
  }

  return daysUntil > 0 ? `D-${daysUntil}` : `D+${Math.abs(daysUntil)}`;
}

function getDateDiffInDays(from: string, to: string) {
  return Math.round(
    (parseDateValue(to).getTime() - parseDateValue(from).getTime()) / dayInMs,
  );
}

function getStringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getImageDataUrlValue(value: unknown) {
  return isImageDataUrl(value) ? value : "";
}

function isImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

function isOptionalRefrigeratorDate(value: string) {
  return !value || isRefrigeratorDate(value);
}

function isRefrigeratorDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  return !Number.isNaN(parseDateValue(value).getTime());
}

function parseDateValue(value: string) {
  const [yearText, monthText, dayText] = value.split("-");

  return new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );
}
