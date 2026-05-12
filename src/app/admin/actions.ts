"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { AuditAction, UserRole, UserStatus } from "@/generated/prisma/client";
import {
  attachmentPolicyId,
  parseExtensionText,
  upsertAttachmentPolicy,
} from "@/lib/attachment-policy";
import { removeStoredAttachmentFiles } from "@/lib/attachment-storage";
import { maxAttachmentPolicyTotalSizeMb } from "@/lib/attachment-limits";
import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export type AdminUserFormState = {
  success?: string;
  error?: string;
  values?: {
    name?: string;
    email?: string;
    departmentId?: string;
    positionId?: string;
    role?: string;
    status?: string;
  };
};

export type AdminDepartmentFormState = {
  success?: string;
  error?: string;
  values?: {
    name?: string;
    parentId?: string;
    sortOrder?: string;
    isActive?: string;
  };
};

export type AdminPositionFormState = {
  success?: string;
  error?: string;
  values?: {
    name?: string;
    level?: string;
    sortOrder?: string;
    isActive?: string;
  };
};

export type AdminTemplateFormState = {
  success?: string;
  error?: string;
  values?: {
    name?: string;
    description?: string;
    isActive?: string;
  };
};

export type AdminAttachmentPolicyFormState = {
  success?: string;
  error?: string;
  values?: {
    maxFileCount?: string;
    maxFileSizeMb?: string;
    allowedExtensions?: string;
  };
};

export async function createAdminUserAction(
  _state: AdminUserFormState,
  formData: FormData,
): Promise<AdminUserFormState> {
  const admin = await requireAdmin();
  const values = getUserFormValues(formData);
  const password = String(formData.get("password") ?? "");
  const error = await validateUserFormValues(values, {
    requireEmail: false,
    requirePassword: true,
    password,
  });

  if (error) {
    return {
      error,
      values,
    };
  }

  const exists = values.email
    ? await prisma.user.findUnique({
        where: {
          email: values.email,
        },
        select: {
          id: true,
        },
      })
    : null;

  if (exists) {
    return {
      error: "이미 등록된 이메일입니다.",
      values,
    };
  }

  const user = await prisma.user.create({
    data: {
      name: values.name,
      email: values.email || null,
      passwordHash: hashPassword(password),
      role: values.role,
      status: values.status,
      departmentId: values.departmentId,
      positionId: values.positionId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: AuditAction.CREATE_USER,
      targetType: "User",
      targetId: user.id,
      message: `${user.name} 사용자를 생성했습니다.`,
    },
  });

  revalidatePath("/admin");

  return {
    success: "사용자를 생성했습니다.",
  };
}

export async function updateAdminUserAction(
  userId: string,
  _state: AdminUserFormState,
  formData: FormData,
): Promise<AdminUserFormState> {
  const admin = await requireAdmin();
  const values = getUserFormValues(formData);
  const password = String(formData.get("password") ?? "");
  const error = await validateUserFormValues(values, {
    requireEmail: false,
    requirePassword: false,
    password,
  });

  if (error) {
    return {
      error,
      values,
    };
  }

  const target = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      role: true,
      status: true,
    },
  });

  if (!target) {
    return {
      error: "수정할 사용자를 찾을 수 없습니다.",
      values,
    };
  }

  if (
    target.id === admin.id &&
    (values.role !== UserRole.ADMIN || values.status !== UserStatus.ACTIVE)
  ) {
    return {
      error: "현재 로그인한 관리자 계정은 권한을 낮추거나 비활성화할 수 없습니다.",
      values,
    };
  }

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      name: values.name,
      role: values.role,
      status: values.status,
      departmentId: values.departmentId,
      positionId: values.positionId,
      ...(password ? { passwordHash: hashPassword(password) } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: AuditAction.UPDATE_USER,
      targetType: "User",
      targetId: userId,
      message: `${values.name} 사용자 정보를 수정했습니다.`,
    },
  });

  revalidatePath("/admin");

  return {
    success: "사용자 정보를 수정했습니다.",
  };
}

export async function resetAdminUserProfileImageAction(
  userId: string,
  previousState: AdminUserFormState,
): Promise<AdminUserFormState> {
  void previousState;

  const admin = await requireAdmin();
  const target = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      profileImageStorageProvider: true,
      profileImageStorageKey: true,
    },
  });

  if (!target) {
    return {
      error: "초기화할 사용자를 찾을 수 없습니다.",
    };
  }

  if (!target.profileImageStorageKey) {
    return {
      success: "이미 기본 이미지 상태입니다.",
    };
  }

  const previousImage = {
    storageKey: target.profileImageStorageKey,
    storageProvider: target.profileImageStorageProvider,
  };

  await prisma.$transaction([
    prisma.user.update({
      where: {
        id: userId,
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
        actorId: admin.id,
        action: AuditAction.UPDATE_USER,
        targetType: "User",
        targetId: userId,
        message: `${target.name} 사용자의 프로필 이미지를 초기화했습니다.`,
        metadata: {
          source: "admin",
        },
      },
    }),
  ]);

  await removeStoredAttachmentFiles([previousImage]).catch(() => undefined);

  revalidatePath("/");
  revalidatePath("/account");
  revalidatePath("/admin");

  return {
    success: "프로필 이미지를 초기화했습니다.",
  };
}

export async function createAdminDepartmentAction(
  _state: AdminDepartmentFormState,
  formData: FormData,
): Promise<AdminDepartmentFormState> {
  const admin = await requireAdmin();
  const values = getDepartmentFormValues(formData);
  const error = await validateDepartmentFormValues(values);

  if (error) {
    return {
      error,
      values,
    };
  }

  const department = await prisma.department.create({
    data: {
      name: values.name,
      code: await generateDepartmentCode(),
      parentId: values.parentId || null,
      sortOrder: Number(values.sortOrder),
      isActive: values.isActive === "ACTIVE",
    },
    select: {
      id: true,
      name: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: AuditAction.CREATE_DEPARTMENT,
      targetType: "Department",
      targetId: department.id,
      message: `${department.name} 부서를 생성했습니다.`,
    },
  });

  revalidatePath("/admin");

  return {
    success: "부서를 생성했습니다.",
  };
}

export async function updateAdminDepartmentAction(
  departmentId: string,
  _state: AdminDepartmentFormState,
  formData: FormData,
): Promise<AdminDepartmentFormState> {
  const admin = await requireAdmin();
  const values = getDepartmentFormValues(formData);
  const error = await validateDepartmentFormValues(values, departmentId);

  if (error) {
    return {
      error,
      values,
    };
  }

  const target = await prisma.department.findUnique({
    where: {
      id: departmentId,
    },
    select: {
      id: true,
    },
  });

  if (!target) {
    return {
      error: "수정할 부서를 찾을 수 없습니다.",
      values,
    };
  }

  if (await wouldCreateDepartmentCycle(departmentId, values.parentId)) {
    return {
      error: "하위 부서를 상위 부서로 지정할 수 없습니다.",
      values,
    };
  }

  await prisma.department.update({
    where: {
      id: departmentId,
    },
    data: {
      name: values.name,
      parentId: values.parentId || null,
      sortOrder: Number(values.sortOrder),
      isActive: values.isActive === "ACTIVE",
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: AuditAction.UPDATE_DEPARTMENT,
      targetType: "Department",
      targetId: departmentId,
      message: `${values.name} 부서 정보를 수정했습니다.`,
    },
  });

  revalidatePath("/admin");

  return {
    success: "부서 정보를 수정했습니다.",
  };
}

export async function createAdminPositionAction(
  _state: AdminPositionFormState,
  formData: FormData,
): Promise<AdminPositionFormState> {
  const admin = await requireAdmin();
  const values = getPositionFormValues(formData);
  const error = validatePositionFormValues(values);

  if (error) {
    return {
      error,
      values,
    };
  }

  const duplicate = await findDuplicatePosition(values);

  if (duplicate) {
    return {
      error: duplicate,
      values,
    };
  }

  const position = await prisma.position.create({
    data: {
      name: values.name,
      level: Number(values.level),
      sortOrder: Number(values.sortOrder),
      isActive: values.isActive === "ACTIVE",
    },
    select: {
      id: true,
      name: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: AuditAction.CREATE_POSITION,
      targetType: "Position",
      targetId: position.id,
      message: `${position.name} 직급을 생성했습니다.`,
    },
  });

  revalidatePath("/admin");

  return {
    success: "직급을 생성했습니다.",
  };
}

export async function updateAdminPositionAction(
  positionId: string,
  _state: AdminPositionFormState,
  formData: FormData,
): Promise<AdminPositionFormState> {
  const admin = await requireAdmin();
  const values = getPositionFormValues(formData);
  const error = validatePositionFormValues(values);

  if (error) {
    return {
      error,
      values,
    };
  }

  const target = await prisma.position.findUnique({
    where: {
      id: positionId,
    },
    select: {
      id: true,
    },
  });

  if (!target) {
    return {
      error: "수정할 직급을 찾을 수 없습니다.",
      values,
    };
  }

  const duplicate = await findDuplicatePosition(values, positionId);

  if (duplicate) {
    return {
      error: duplicate,
      values,
    };
  }

  await prisma.position.update({
    where: {
      id: positionId,
    },
    data: {
      name: values.name,
      level: Number(values.level),
      sortOrder: Number(values.sortOrder),
      isActive: values.isActive === "ACTIVE",
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: AuditAction.UPDATE_POSITION,
      targetType: "Position",
      targetId: positionId,
      message: `${values.name} 직급 정보를 수정했습니다.`,
    },
  });

  revalidatePath("/admin");

  return {
    success: "직급 정보를 수정했습니다.",
  };
}

export async function createAdminTemplateAction(
  _state: AdminTemplateFormState,
  formData: FormData,
): Promise<AdminTemplateFormState> {
  const admin = await requireAdmin();
  const values = getTemplateFormValues(formData);
  const error = validateTemplateFormValues(values);

  if (error) {
    return {
      error,
      values,
    };
  }

  const exists = await prisma.documentTemplate.findFirst({
    where: {
      name: values.name,
    },
    select: {
      id: true,
    },
  });

  if (exists) {
    return {
      error: "이미 사용 중인 양식명입니다.",
      values,
    };
  }

  const template = await prisma.documentTemplate.create({
    data: {
      name: values.name,
      description: values.description || null,
      schema: getDefaultTemplateSchema(),
      isActive: values.isActive === "ACTIVE",
    },
    select: {
      id: true,
      name: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: AuditAction.CREATE_TEMPLATE,
      targetType: "DocumentTemplate",
      targetId: template.id,
      message: `${template.name} 문서 양식을 생성했습니다.`,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/drafts/new");

  return {
    success: "문서 양식을 생성했습니다.",
  };
}

export async function updateAdminTemplateAction(
  templateId: string,
  _state: AdminTemplateFormState,
  formData: FormData,
): Promise<AdminTemplateFormState> {
  const admin = await requireAdmin();
  const values = getTemplateFormValues(formData);
  const error = validateTemplateFormValues(values);

  if (error) {
    return {
      error,
      values,
    };
  }

  const target = await prisma.documentTemplate.findUnique({
    where: {
      id: templateId,
    },
    select: {
      id: true,
    },
  });

  if (!target) {
    return {
      error: "수정할 문서 양식을 찾을 수 없습니다.",
      values,
    };
  }

  const nameOwner = await prisma.documentTemplate.findFirst({
    where: {
      name: values.name,
    },
    select: {
      id: true,
    },
  });

  if (nameOwner && nameOwner.id !== templateId) {
    return {
      error: "이미 사용 중인 양식명입니다.",
      values,
    };
  }

  await prisma.documentTemplate.update({
    where: {
      id: templateId,
    },
    data: {
      name: values.name,
      description: values.description || null,
      isActive: values.isActive === "ACTIVE",
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: AuditAction.UPDATE_TEMPLATE,
      targetType: "DocumentTemplate",
      targetId: templateId,
      message: `${values.name} 문서 양식을 수정했습니다.`,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/drafts/new");

  return {
    success: "문서 양식을 수정했습니다.",
  };
}

export async function updateAdminAttachmentPolicyAction(
  _state: AdminAttachmentPolicyFormState,
  formData: FormData,
): Promise<AdminAttachmentPolicyFormState> {
  const admin = await requireAdmin();
  const values = getAttachmentPolicyFormValues(formData);
  const validation = validateAttachmentPolicyFormValues(values);

  if (validation.error) {
    return {
      error: validation.error,
      values,
    };
  }

  const policy = await upsertAttachmentPolicy({
    maxFileCount: validation.maxFileCount,
    maxFileSizeMb: validation.maxFileSizeMb,
    allowedExtensions: validation.allowedExtensions,
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: AuditAction.UPDATE_ATTACHMENT_POLICY,
      targetType: "AttachmentPolicy",
      targetId: attachmentPolicyId,
      message: "첨부파일 정책을 수정했습니다.",
      metadata: policy,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/drafts/new");

  return {
    success: "첨부파일 정책을 수정했습니다.",
  };
}

function getUserFormValues(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    departmentId: String(formData.get("departmentId") ?? "").trim(),
    positionId: String(formData.get("positionId") ?? "").trim(),
    role:
      formData.get("role") === UserRole.ADMIN ? UserRole.ADMIN : UserRole.USER,
    status:
      formData.get("status") === UserStatus.INACTIVE
        ? UserStatus.INACTIVE
        : UserStatus.ACTIVE,
  };
}

async function validateUserFormValues(
  values: ReturnType<typeof getUserFormValues>,
  options: {
    requireEmail: boolean;
    requirePassword: boolean;
    password: string;
  },
) {
  if (values.name.length < 2) {
    return "이름은 2자 이상 입력하세요.";
  }

  if (options.requireEmail && !values.email) {
    return "이메일을 입력하세요.";
  }

  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    return "이메일 형식이 올바르지 않습니다.";
  }

  if (options.requirePassword && options.password.length < 8) {
    return "초기 비밀번호는 8자 이상 입력하세요.";
  }

  if (!options.requirePassword && options.password && options.password.length < 8) {
    return "새 비밀번호는 8자 이상 입력하세요.";
  }

  const [department, position] = await Promise.all([
    prisma.department.findUnique({
      where: {
        id: values.departmentId,
      },
      select: {
        id: true,
      },
    }),
    prisma.position.findUnique({
      where: {
        id: values.positionId,
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!department) {
    return "부서를 선택하세요.";
  }

  if (!position) {
    return "직급을 선택하세요.";
  }

  return null;
}

function getDepartmentFormValues(formData: FormData) {
  const sortOrder = String(formData.get("sortOrder") ?? "0").trim();

  return {
    name: String(formData.get("name") ?? "").trim(),
    parentId: String(formData.get("parentId") ?? "").trim(),
    sortOrder: sortOrder || "0",
    isActive:
      formData.get("isActive") === "INACTIVE" ? "INACTIVE" : "ACTIVE",
  };
}

async function validateDepartmentFormValues(
  values: ReturnType<typeof getDepartmentFormValues>,
  departmentId?: string,
) {
  if (values.name.length < 2) {
    return "부서명은 2자 이상 입력하세요.";
  }

  const sortOrder = Number(values.sortOrder);

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    return "정렬 순서는 0 이상의 정수로 입력하세요.";
  }

  if (values.parentId) {
    if (values.parentId === departmentId) {
      return "자기 자신을 상위 부서로 지정할 수 없습니다.";
    }

    const parent = await prisma.department.findUnique({
      where: {
        id: values.parentId,
      },
      select: {
        id: true,
      },
    });

    if (!parent) {
      return "상위 부서를 다시 선택하세요.";
    }
  }

  return null;
}

async function generateDepartmentCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `DEPT-${randomUUID().slice(0, 8).toUpperCase()}`;
    const exists = await prisma.department.findUnique({
      where: {
        code,
      },
      select: {
        id: true,
      },
    });

    if (!exists) {
      return code;
    }
  }

  return `DEPT-${Date.now().toString(36).toUpperCase()}`;
}

async function wouldCreateDepartmentCycle(
  departmentId: string,
  parentId: string,
) {
  if (!parentId) {
    return false;
  }

  const departments = await prisma.department.findMany({
    select: {
      id: true,
      parentId: true,
    },
  });
  const parentById = new Map(
    departments.map((department) => [department.id, department.parentId]),
  );
  let currentParentId: string | null | undefined = parentId;

  while (currentParentId) {
    if (currentParentId === departmentId) {
      return true;
    }

    currentParentId = parentById.get(currentParentId);
  }

  return false;
}

function getTemplateFormValues(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    isActive:
      formData.get("isActive") === "INACTIVE" ? "INACTIVE" : "ACTIVE",
  };
}

function validateTemplateFormValues(
  values: ReturnType<typeof getTemplateFormValues>,
) {
  if (values.name.length < 2) {
    return "양식명은 2자 이상 입력하세요.";
  }

  if (values.name.length > 40) {
    return "양식명은 40자 이내로 입력하세요.";
  }

  if (values.description.length > 200) {
    return "설명은 200자 이내로 입력하세요.";
  }

  return null;
}

function getDefaultTemplateSchema() {
  return {
    fields: [
      { name: "title", label: "제목", type: "text", required: true },
      {
        name: "content",
        label: "기안 내용",
        type: "textarea",
        required: true,
      },
      {
        name: "attachments",
        label: "첨부파일",
        type: "attachments",
        required: false,
      },
    ],
  };
}

function getAttachmentPolicyFormValues(formData: FormData) {
  return {
    maxFileCount: String(formData.get("maxFileCount") ?? "").trim(),
    maxFileSizeMb: String(formData.get("maxFileSizeMb") ?? "").trim(),
    allowedExtensions: String(formData.get("allowedExtensions") ?? "").trim(),
  };
}

function validateAttachmentPolicyFormValues(
  values: ReturnType<typeof getAttachmentPolicyFormValues>,
) {
  const maxFileCount = Number(values.maxFileCount);

  if (!Number.isInteger(maxFileCount) || maxFileCount < 1 || maxFileCount > 20) {
    return {
      error: "최대 파일 개수는 1~20 사이의 정수로 입력하세요.",
      maxFileCount: 0,
      maxFileSizeMb: 0,
      allowedExtensions: [],
    };
  }

  const maxFileSizeMb = Number(values.maxFileSizeMb);

  if (
    !Number.isInteger(maxFileSizeMb) ||
    maxFileSizeMb < 1 ||
    maxFileSizeMb > maxAttachmentPolicyTotalSizeMb
  ) {
    return {
      error: `파일당 최대 크기는 1~${maxAttachmentPolicyTotalSizeMb}MB 사이의 정수로 입력하세요.`,
      maxFileCount,
      maxFileSizeMb: 0,
      allowedExtensions: [],
    };
  }

  if (maxFileCount * maxFileSizeMb > maxAttachmentPolicyTotalSizeMb) {
    return {
      error: `첨부파일 총 용량은 ${maxAttachmentPolicyTotalSizeMb}MB 이하가 되도록 설정하세요.`,
      maxFileCount,
      maxFileSizeMb,
      allowedExtensions: [],
    };
  }

  const allowedExtensions = parseExtensionText(values.allowedExtensions);

  if (allowedExtensions.length === 0) {
    return {
      error: "허용 확장자를 1개 이상 입력하세요.",
      maxFileCount,
      maxFileSizeMb,
      allowedExtensions,
    };
  }

  return {
    maxFileCount,
    maxFileSizeMb,
    allowedExtensions,
  };
}

function getPositionFormValues(formData: FormData) {
  const level = String(formData.get("level") ?? "").trim();
  const sortOrder = String(formData.get("sortOrder") ?? "0").trim();

  return {
    name: String(formData.get("name") ?? "").trim(),
    level,
    sortOrder: sortOrder || "0",
    isActive:
      formData.get("isActive") === "INACTIVE" ? "INACTIVE" : "ACTIVE",
  };
}

function validatePositionFormValues(
  values: ReturnType<typeof getPositionFormValues>,
) {
  if (values.name.length < 2) {
    return "직급명은 2자 이상 입력하세요.";
  }

  const level = Number(values.level);

  if (!Number.isInteger(level) || level < 1) {
    return "레벨은 1 이상의 정수로 입력하세요.";
  }

  const sortOrder = Number(values.sortOrder);

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    return "정렬 순서는 0 이상의 정수로 입력하세요.";
  }

  return null;
}

async function findDuplicatePosition(
  values: ReturnType<typeof getPositionFormValues>,
  positionId?: string,
) {
  const [sameName, sameLevel] = await Promise.all([
    prisma.position.findFirst({
      where: {
        name: values.name,
      },
      select: {
        id: true,
      },
    }),
    prisma.position.findFirst({
      where: {
        level: Number(values.level),
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (sameName && sameName.id !== positionId) {
    return "이미 사용 중인 직급명입니다.";
  }

  if (sameLevel && sameLevel.id !== positionId) {
    return "이미 사용 중인 레벨입니다.";
  }

  return null;
}
