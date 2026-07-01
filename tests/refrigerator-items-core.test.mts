import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createEmptyRefrigeratorItems,
  createEmptyRefrigeratorPhotos,
  createRefrigeratorFoodExpirationAlert,
  parseRefrigeratorItemsByLocation,
  parseRefrigeratorPhotosByLocation,
  removeRefrigeratorItemFromLocation,
  removeRefrigeratorPhotoFromLocation,
  saveRefrigeratorItemToLocation,
} from "../src/lib/refrigerator-items-core.ts";

describe("refrigerator items core", () => {
  test("creates food expiration alerts from refrigerator items", () => {
    const itemsByLocation = createEmptyRefrigeratorItems();

    itemsByLocation["bajaul-1"] = [
      {
        category: "식품",
        expirationDate: "2026-06-29",
        id: "refrigerator-item-001",
        name: "샐러드",
        purchasedAt: "2026-06-28",
      },
      {
        category: "음료",
        expirationDate: "2026-08-10",
        id: "refrigerator-item-002",
        name: "탄산수",
        purchasedAt: "2026-06-28",
      },
    ];

    const alert = createRefrigeratorFoodExpirationAlert(
      itemsByLocation,
      "2026-06-29",
    );

    assert.equal(alert?.itemName, "샐러드");
    assert.equal(alert?.ddayLabel, "D-Day");
    assert.equal(alert?.items.length, 1);
    assert.equal(alert?.items[0]?.locationLabel, "바자울 1");
  });

  test("parses saved refrigerator items defensively", () => {
    const itemsByLocation = parseRefrigeratorItemsByLocation(
      JSON.stringify({
        "bajaul-1": [
          {
            category: "식품",
            expirationDate: "2026-07-01",
            id: "refrigerator-item-001",
            name: "우유",
            purchasedAt: "2026-06-29",
          },
          {
            category: "식품",
            expirationDate: "not-a-date",
            id: "bad-item",
            name: "무시",
            purchasedAt: "2026-06-29",
          },
        ],
      }),
    );

    assert.equal(itemsByLocation["bajaul-1"].length, 1);
    assert.equal(itemsByLocation["bajaul-1"][0]?.name, "우유");
    assert.equal(itemsByLocation["bajaul-2"].length, 0);
  });

  test("keeps refrigerator items with only a name and an image data url", () => {
    const itemsByLocation = parseRefrigeratorItemsByLocation(
      JSON.stringify({
        "bajaul-1": [
          {
            category: "",
            expirationDate: "",
            id: "optional-item",
            name: "water",
            photoSrc: "data:image/webp;base64,abc",
            purchasedAt: "",
          },
          {
            category: "",
            expirationDate: "",
            id: "invalid-photo-item",
            name: "tea",
            photoSrc: "https://example.com/tea.png",
            purchasedAt: "",
          },
        ],
      }),
    );

    assert.equal(itemsByLocation["bajaul-1"].length, 2);
    assert.equal(
      itemsByLocation["bajaul-1"][0]?.photoSrc,
      "data:image/webp;base64,abc",
    );
    assert.equal(itemsByLocation["bajaul-1"][1]?.photoSrc, "");
  });

  test("parses saved refrigerator photos defensively", () => {
    const photosByLocation = parseRefrigeratorPhotosByLocation(
      JSON.stringify({
        "bajaul-1": "data:image/webp;base64,abc",
        "bajaul-2": "https://example.com/fridge.png",
      }),
    );

    assert.deepEqual(createEmptyRefrigeratorPhotos(), {
      "bajaul-1": "",
      "bajaul-2": "",
    });
    assert.equal(photosByLocation["bajaul-1"], "data:image/webp;base64,abc");
    assert.equal(photosByLocation["bajaul-2"], "");
  });

  test("updates and moves refrigerator items between locations", () => {
    const itemsByLocation = createEmptyRefrigeratorItems();
    const originalItem = {
      category: "food",
      expirationDate: "2026-07-02",
      id: "item-001",
      name: "milk",
      purchasedAt: "2026-06-29",
    };

    itemsByLocation["bajaul-1"] = [originalItem];

    const movedItems = saveRefrigeratorItemToLocation({
      item: { ...originalItem, name: "soy milk" },
      itemsByLocation,
      previousLocationId: "bajaul-1",
      targetLocationId: "bajaul-2",
    });

    assert.equal(movedItems["bajaul-1"].length, 0);
    assert.equal(movedItems["bajaul-2"][0]?.name, "soy milk");
  });

  test("removes refrigerator items from a location", () => {
    const itemsByLocation = createEmptyRefrigeratorItems();

    itemsByLocation["bajaul-1"] = [
      {
        category: "food",
        expirationDate: "2026-07-02",
        id: "item-001",
        name: "milk",
        purchasedAt: "2026-06-29",
      },
    ];

    const nextItems = removeRefrigeratorItemFromLocation(
      itemsByLocation,
      "bajaul-1",
      "item-001",
    );

    assert.equal(nextItems["bajaul-1"].length, 0);
  });

  test("removes refrigerator photos from a location", () => {
    const photosByLocation = createEmptyRefrigeratorPhotos();

    photosByLocation["bajaul-1"] = "data:image/webp;base64,abc";
    photosByLocation["bajaul-2"] = "data:image/webp;base64,def";

    const nextPhotos = removeRefrigeratorPhotoFromLocation(
      photosByLocation,
      "bajaul-1",
    );

    assert.equal(nextPhotos["bajaul-1"], "");
    assert.equal(nextPhotos["bajaul-2"], "data:image/webp;base64,def");
    assert.equal(photosByLocation["bajaul-1"], "data:image/webp;base64,abc");
  });
});
