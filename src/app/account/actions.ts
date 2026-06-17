"use server";

import { revalidatePath } from "next/cache";
import { AuditAction } from "@/generated/prisma/client";
import {
  persistAttachmentFiles,
  prepareAttachmentFiles,
  removeStoredAttachmentFiles,
} from "@/lib/attachment-storage";
import { getCurrentUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  hasPasswordChangeValidationErrors,
  validatePasswordChangeFields,
} from "@/lib/password-change-policy";
import { prisma } from "@/lib/prisma";
import {
  profileImageInputName,
  profileImagePolicy,
  profileImageStoragePrefix,
} from "@/lib/profile-image-policy";
import {
  signatureImageInputName,
  signatureImagePolicy,
  signatureImageStoragePrefix,
} from "@/lib/signature-image-policy";

export type ChangePasswordState = {
  success?: string;
  errors?: {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
    form?: string;
  };
};

export type ProfileImageState = {
  success?: string;
  error?: string;
};

export type SignatureImageState = {
  success?: string;
  error?: string;
};

export async function changePasswordAction(
  _state: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const validation = validatePasswordChangeFields({
    currentPassword,
    newPassword,
    confirmPassword,
  });

  if (hasPasswordChangeValidationErrors(validation)) {
    return {
      errors: validation.errors,
    };
  }

  const user = await getCurrentUser();

  if (!user) {
    return {
      errors: {
        form: "로그인 정보가 만료되었습니다. 다시 로그인하세요.",
      },
    };
  }

  if (!user.passwordHash) {
    return {
      errors: {
        form: "비밀번호 로그인 계정이 아닙니다. 관리자에게 문의하세요.",
      },
    };
  }

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return {
      errors: {
        currentPassword: "현재 비밀번호가 올바르지 않습니다.",
      },
    };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        passwordHash: hashPassword(newPassword),
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: AuditAction.CHANGE_PASSWORD,
        targetType: "User",
        targetId: user.id,
        message: "사용자가 비밀번호를 변경했습니다.",
        metadata: {
          source: "account",
        },
      },
    }),
  ]);

  revalidatePath("/account");

  return {
    success: "비밀번호가 변경되었습니다.",
  };
}

export async function updateProfileImageAction(
  _state: ProfileImageState,
  formData: FormData,
): Promise<ProfileImageState> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "로그인 정보가 만료되었습니다. 다시 로그인하세요.",
    };
  }

  const prepared = await prepareAttachmentFiles(
    formData.getAll(profileImageInputName),
    profileImagePolicy,
    {
      storageKeyPrefix: profileImageStoragePrefix,
    },
  );

  if (prepared.error) {
    return {
      error: prepared.error.replaceAll("첨부파일", "프로필 이미지"),
    };
  }

  const [image] = prepared.files;

  if (!image) {
    return {
      error: "프로필 이미지를 선택하세요.",
    };
  }

  const previousImage =
    user.profileImageStorageKey && user.profileImageStorageProvider
      ? {
          storageKey: user.profileImageStorageKey,
          storageProvider: user.profileImageStorageProvider,
        }
      : null;

  try {
    await persistAttachmentFiles([image]);
  } catch {
    return {
      error:
        "프로필 이미지 저장소에 연결하지 못했습니다. 관리자에게 Storage 설정을 확인해 달라고 요청하세요.",
    };
  }

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          profileImageStorageProvider: image.storageProvider,
          profileImageStorageKey: image.storageKey,
          profileImageMimeType: image.mimeType,
          profileImageSize: image.size,
          profileImageUpdatedAt: new Date(),
        },
      }),
      prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: AuditAction.UPDATE_USER,
          targetType: "User",
          targetId: user.id,
          message: "사용자가 프로필 이미지를 변경했습니다.",
          metadata: {
            source: "account",
          },
        },
      }),
    ]);
  } catch (error) {
    await removeStoredAttachmentFiles([image]).catch(() => undefined);
    throw error;
  }

  if (previousImage) {
    await removeStoredAttachmentFiles([previousImage]).catch(() => undefined);
  }

  revalidatePath("/");
  revalidatePath("/account");

  return {
    success: "프로필 이미지가 저장되었습니다.",
  };
}

export async function removeProfileImageAction(
  previousState: ProfileImageState,
): Promise<ProfileImageState> {
  void previousState;

  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "로그인 정보가 만료되었습니다. 다시 로그인하세요.",
    };
  }

  if (!user.profileImageStorageKey) {
    return {
      success: "삭제할 프로필 이미지가 없습니다.",
    };
  }

  const previousImage = {
    storageKey: user.profileImageStorageKey,
    storageProvider: user.profileImageStorageProvider,
  };

  await prisma.$transaction([
    prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        profileImageStorageProvider: null,
        profileImageStorageKey: null,
        profileImageMimeType: null,
        profileImageSize: null,
        profileImageUpdatedAt: null,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: AuditAction.UPDATE_USER,
        targetType: "User",
        targetId: user.id,
        message: "사용자가 프로필 이미지를 삭제했습니다.",
        metadata: {
          source: "account",
        },
      },
    }),
  ]);

  await removeStoredAttachmentFiles([previousImage]).catch(() => undefined);

  revalidatePath("/");
  revalidatePath("/account");

  return {
    success: "프로필 이미지가 삭제되었습니다.",
  };
}

export async function updateSignatureImageAction(
  _state: SignatureImageState,
  formData: FormData,
): Promise<SignatureImageState> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "로그인 정보가 만료되었습니다. 다시 로그인하세요.",
    };
  }

  const prepared = await prepareAttachmentFiles(
    formData.getAll(signatureImageInputName),
    signatureImagePolicy,
    {
      storageKeyPrefix: signatureImageStoragePrefix,
    },
  );

  if (prepared.error) {
    return {
      error: prepared.error.replaceAll("첨부파일", "도장/서명 이미지"),
    };
  }

  const [image] = prepared.files;

  if (!image) {
    return {
      error: "도장/서명 이미지를 선택하세요.",
    };
  }

  const previousImage =
    user.signatureImageStorageKey && user.signatureImageStorageProvider
      ? {
          storageKey: user.signatureImageStorageKey,
          storageProvider: user.signatureImageStorageProvider,
        }
      : null;

  try {
    await persistAttachmentFiles([image]);
  } catch {
    return {
      error:
        "도장/서명 이미지 저장소에 연결하지 못했습니다. 관리자에게 Storage 설정을 확인해 달라고 요청하세요.",
    };
  }

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          signatureImageStorageProvider: image.storageProvider,
          signatureImageStorageKey: image.storageKey,
          signatureImageMimeType: image.mimeType,
          signatureImageSize: image.size,
          signatureImageUpdatedAt: new Date(),
        },
      }),
      prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: AuditAction.UPDATE_USER,
          targetType: "User",
          targetId: user.id,
          message: "사용자가 결재 도장/서명 이미지를 변경했습니다.",
          metadata: {
            source: "account",
          },
        },
      }),
    ]);
  } catch (error) {
    await removeStoredAttachmentFiles([image]).catch(() => undefined);
    throw error;
  }

  if (previousImage) {
    await removeStoredAttachmentFiles([previousImage]).catch(() => undefined);
  }

  revalidatePath("/account");

  return {
    success: "결재 도장/서명 이미지가 저장되었습니다.",
  };
}

export async function removeSignatureImageAction(
  previousState: SignatureImageState,
): Promise<SignatureImageState> {
  void previousState;

  const user = await getCurrentUser();

  if (!user) {
    return {
      error: "로그인 정보가 만료되었습니다. 다시 로그인하세요.",
    };
  }

  if (!user.signatureImageStorageKey) {
    return {
      success: "삭제할 결재 도장/서명 이미지가 없습니다.",
    };
  }

  const previousImage = {
    storageKey: user.signatureImageStorageKey,
    storageProvider: user.signatureImageStorageProvider,
  };

  await prisma.$transaction([
    prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        signatureImageStorageProvider: null,
        signatureImageStorageKey: null,
        signatureImageMimeType: null,
        signatureImageSize: null,
        signatureImageUpdatedAt: null,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: AuditAction.UPDATE_USER,
        targetType: "User",
        targetId: user.id,
        message: "사용자가 결재 도장/서명 이미지를 삭제했습니다.",
        metadata: {
          source: "account",
        },
      },
    }),
  ]);

  await removeStoredAttachmentFiles([previousImage]).catch(() => undefined);

  revalidatePath("/account");

  return {
    success: "결재 도장/서명 이미지가 삭제되었습니다.",
  };
}
