import { UserRole, UserStatus } from "@/generated/prisma/client";

export const youthPermissionKeys = [
  "canViewYouthDetails",
  "canViewYouthContacts",
  "canDownloadYouthDocuments",
  "canManageYouth",
] as const;

export type YouthPermissionKey = (typeof youthPermissionKeys)[number];

export type YouthPermissionSubject = {
  role: UserRole;
  status: UserStatus;
  canViewYouthDetails: boolean;
  canViewYouthContacts: boolean;
  canDownloadYouthDocuments: boolean;
  canManageYouth: boolean;
};

export type EffectiveYouthPermissions = Record<YouthPermissionKey, boolean> & {
  canViewYouthBasic: boolean;
  canDeleteYouth: boolean;
};

export function getEffectiveYouthPermissions(
  user: YouthPermissionSubject,
): EffectiveYouthPermissions {
  const isActive = user.status === UserStatus.ACTIVE;
  const isAdmin = isActive && user.role === UserRole.ADMIN;

  return {
    canViewYouthBasic: isActive,
    canViewYouthDetails:
      isActive && (isAdmin || user.canViewYouthDetails),
    canViewYouthContacts:
      isActive && (isAdmin || user.canViewYouthContacts),
    canDownloadYouthDocuments:
      isActive && (isAdmin || user.canDownloadYouthDocuments),
    canManageYouth: isActive && (isAdmin || user.canManageYouth),
    canDeleteYouth: isAdmin,
  };
}

export function hasYouthPermission(
  user: YouthPermissionSubject,
  permission: YouthPermissionKey,
) {
  return getEffectiveYouthPermissions(user)[permission];
}
