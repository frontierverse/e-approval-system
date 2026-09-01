import "server-only";

import { requireUser } from "@/lib/auth";
import {
  getEffectiveYouthPermissions,
  type YouthPermissionKey,
} from "@/lib/youth-permissions-core";

const youthPermissionErrorMessages: Record<YouthPermissionKey, string> = {
  canViewYouthDetails: "청소년 상세정보 열람 권한이 없습니다.",
  canViewYouthContacts: "청소년 연락처 열람 권한이 없습니다.",
  canDownloadYouthDocuments: "청소년 결정문 다운로드 권한이 없습니다.",
  canManageYouth: "청소년 정보 관리 권한이 없습니다.",
};

export class YouthPermissionError extends Error {
  readonly code = "YOUTH_PERMISSION_DENIED";

  constructor(permission: YouthPermissionKey) {
    super(youthPermissionErrorMessages[permission]);
    this.name = "YouthPermissionError";
  }
}

export async function requireYouthBasicAccess() {
  const user = await requireUser();
  const permissions = getEffectiveYouthPermissions(user);

  if (!permissions.canViewYouthBasic) {
    throw new Error("청소년 기본정보 열람 권한이 없습니다.");
  }

  return user;
}

export async function requireYouthPermission(permission: YouthPermissionKey) {
  const user = await requireUser();
  const permissions = getEffectiveYouthPermissions(user);

  if (!permissions[permission]) {
    throw new YouthPermissionError(permission);
  }

  return user;
}
