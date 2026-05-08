import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  hasPasswordChangeValidationErrors,
  validatePasswordChangeFields,
} from "../src/lib/password-change-policy.ts";

describe("password change policy", () => {
  test("requires current password", () => {
    const result = validatePasswordChangeFields({
      currentPassword: "",
      newPassword: "new-password-123",
      confirmPassword: "new-password-123",
    });

    assert.equal(result.errors.currentPassword, "현재 비밀번호를 입력하세요.");
  });

  test("requires a long enough new password", () => {
    const result = validatePasswordChangeFields({
      currentPassword: "password123",
      newPassword: "short",
      confirmPassword: "short",
    });

    assert.equal(result.errors.newPassword, "새 비밀번호는 12자 이상 입력하세요.");
  });

  test("requires matching confirmation", () => {
    const result = validatePasswordChangeFields({
      currentPassword: "password123",
      newPassword: "new-password-123",
      confirmPassword: "different-password",
    });

    assert.equal(
      result.errors.confirmPassword,
      "새 비밀번호가 서로 일치하지 않습니다.",
    );
  });

  test("accepts valid fields", () => {
    const result = validatePasswordChangeFields({
      currentPassword: "password123",
      newPassword: "new-password-123",
      confirmPassword: "new-password-123",
    });

    assert.equal(hasPasswordChangeValidationErrors(result), false);
  });
});
