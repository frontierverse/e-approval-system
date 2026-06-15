import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createYouthManagementAccessValue,
  verifyYouthManagementAccessValue,
} from "../src/lib/youth-management-access.ts";
import { shouldClearYouthManagementAccess } from "../src/lib/youth-management-access-policy.ts";

describe("youth management access token", () => {
  test("allows the matching user without a time limit", () => {
    const value = createYouthManagementAccessValue("user-001");

    assert.equal(
      verifyYouthManagementAccessValue(value, "user-001"),
      true,
    );
  });

  test("rejects another user's token and malformed values", () => {
    const value = createYouthManagementAccessValue("user-001");

    assert.equal(verifyYouthManagementAccessValue(value, "user-002"), false);
    assert.equal(
      verifyYouthManagementAccessValue(`${value}.extra`, "user-001"),
      false,
    );
    assert.equal(
      verifyYouthManagementAccessValue("not-a-valid-token", "user-001"),
      false,
    );
  });

  test("rejects a payload changed after signing", () => {
    const value = createYouthManagementAccessValue("user-001");
    const [, signature] = value.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        purpose: "youth-management",
        userId: "user-002",
      }),
    ).toString("base64url");

    assert.equal(
      verifyYouthManagementAccessValue(
        `${tamperedPayload}.${signature}`,
        "user-001",
      ),
      false,
    );
  });

  test("keeps access while entering youth pages and API requests", () => {
    assert.equal(shouldClearYouthManagementAccess("/youth"), false);
    assert.equal(shouldClearYouthManagementAccess("/youth/history"), false);
    assert.equal(shouldClearYouthManagementAccess("/api/notifications"), false);
    assert.equal(shouldClearYouthManagementAccess("/youth", "POST"), false);
  });

  test("clears access when navigating away from youth pages", () => {
    assert.equal(shouldClearYouthManagementAccess("/"), true);
    assert.equal(shouldClearYouthManagementAccess("/inbox"), true);
    assert.equal(shouldClearYouthManagementAccess("/resources"), true);
  });
});
