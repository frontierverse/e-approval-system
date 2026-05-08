export type PasswordChangeFields = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type PasswordChangeValidationResult = {
  errors: {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };
};

export function validatePasswordChangeFields({
  currentPassword,
  newPassword,
  confirmPassword,
}: PasswordChangeFields): PasswordChangeValidationResult {
  const errors: PasswordChangeValidationResult["errors"] = {};

  if (!currentPassword) {
    errors.currentPassword = "현재 비밀번호를 입력하세요.";
  }

  if (newPassword.length < 12) {
    errors.newPassword = "새 비밀번호는 12자 이상 입력하세요.";
  }

  if (newPassword.length > 128) {
    errors.newPassword = "새 비밀번호는 128자 이내로 입력하세요.";
  }

  if (newPassword && newPassword === currentPassword) {
    errors.newPassword = "현재 비밀번호와 다른 비밀번호를 사용하세요.";
  }

  if (!confirmPassword) {
    errors.confirmPassword = "새 비밀번호 확인을 입력하세요.";
  } else if (newPassword !== confirmPassword) {
    errors.confirmPassword = "새 비밀번호가 서로 일치하지 않습니다.";
  }

  return { errors };
}

export function hasPasswordChangeValidationErrors(
  result: PasswordChangeValidationResult,
) {
  return Object.keys(result.errors).length > 0;
}
