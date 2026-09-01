import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const notificationSource = await readFile("src/lib/notifications.ts", "utf8");

describe("notification document privacy", () => {
  test("filters notification counts and rows through document read policy", () => {
    assert.match(notificationSource, /getVisibleNotificationWhere\(userId\)/);
    assert.match(notificationSource, /getReadableDocumentWhere\(userId, "USER"\)/);
    assert.match(
      notificationSource,
      /notification\.count\([\s\S]*?\.\.\.visibleNotificationWhere/,
    );
    assert.match(
      notificationSource,
      /notification\.findMany\([\s\S]*?where: visibleNotificationWhere/,
    );
  });
});
