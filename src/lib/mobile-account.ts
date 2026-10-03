import "server-only";

import sharp from "sharp";
import { AuditAction, UserStatus, type Prisma } from "@/generated/prisma/client";
import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { hasPasswordChangeValidationErrors, validatePasswordChangeFields } from "@/lib/password-change-policy";
import { persistAttachmentFiles, prepareAttachmentFiles, readStoredAttachmentFile, removeStoredAttachmentFiles, type PreparedAttachmentFile } from "@/lib/attachment-storage";
import { profileImageInputName, profileImagePolicy, profileImageStoragePrefix, profileImageCompressionMaxDimension } from "@/lib/profile-image-policy";
import { signatureImageInputName, signatureImagePolicy, signatureImageStoragePrefix, signatureImageCompressionMaxDimension } from "@/lib/signature-image-policy";

export type AccountImageKind = "profile" | "signature";
export const mobileAccountImageInputMaxBytes = 4 * 1024 * 1024;
const multipartMaxBytes = mobileAccountImageInputMaxBytes + 64 * 1024;
const accountSelect = {
  id: true, name: true, email: true, status: true, passwordHash: true,
  department: { select: { name: true } }, position: { select: { name: true } },
  profileImageStorageProvider: true, profileImageStorageKey: true, profileImageMimeType: true,
  profileImageSize: true, profileImageUpdatedAt: true,
  signatureImageStorageProvider: true, signatureImageStorageKey: true, signatureImageMimeType: true,
  signatureImageSize: true, signatureImageUpdatedAt: true,
} satisfies Prisma.UserSelect;
type AccountUser = Prisma.UserGetPayload<{ select: typeof accountSelect }>;

class AccountError extends Error {
  constructor(message: string, readonly status = 400, readonly fields?: Record<string, string>) { super(message); }
}
function failure(cause: unknown) {
  return cause instanceof AccountError
    ? mobileJson({ error: cause.message, ...(cause.fields ? { fields: cause.fields } : {}) }, cause.status)
    : mobileJson({ error: "계정 정보를 처리하지 못했습니다. 잠시 후 다시 시도하세요." }, 500);
}
function imageRef(user: AccountUser, kind: AccountImageKind) {
  return kind === "profile" ? {
    storageProvider: user.profileImageStorageProvider, storageKey: user.profileImageStorageKey,
    mimeType: user.profileImageMimeType, size: user.profileImageSize, updatedAt: user.profileImageUpdatedAt,
  } : {
    storageProvider: user.signatureImageStorageProvider, storageKey: user.signatureImageStorageKey,
    mimeType: user.signatureImageMimeType, size: user.signatureImageSize, updatedAt: user.signatureImageUpdatedAt,
  };
}
function imageSummary(image: ReturnType<typeof imageRef>) {
  return { exists: Boolean(image.storageKey), mimeType: image.storageKey ? image.mimeType : null,
    size: image.storageKey ? image.size : null, updatedAt: image.storageKey ? image.updatedAt?.toISOString() ?? null : null };
}
function imageUpdate(kind: AccountImageKind, image: PreparedAttachmentFile | null, updatedAt: Date | null) {
  return kind === "profile" ? {
    profileImageStorageProvider: image?.storageProvider ?? null, profileImageStorageKey: image?.storageKey ?? null,
    profileImageMimeType: image?.mimeType ?? null, profileImageSize: image?.size ?? null, profileImageUpdatedAt: updatedAt,
  } : {
    signatureImageStorageProvider: image?.storageProvider ?? null, signatureImageStorageKey: image?.storageKey ?? null,
    signatureImageMimeType: image?.mimeType ?? null, signatureImageSize: image?.size ?? null, signatureImageUpdatedAt: updatedAt,
  };
}
async function ownUser(userId: string, db: Pick<Prisma.TransactionClient, "user"> = prisma) {
  const user = await db.user.findUnique({ where: { id: userId }, select: accountSelect });
  if (!user || user.status !== UserStatus.ACTIVE) throw new AccountError("로그인이 필요합니다.", 401);
  return user;
}
async function lockedUser(tx: Prisma.TransactionClient, session: { id: string; userId: string }) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${session.userId} FOR UPDATE`;
  const currentSession = await tx.mobileSession.findUnique({ where: { id: session.id }, select: { userId: true, expiresAt: true } });
  if (!currentSession || currentSession.userId !== session.userId || currentSession.expiresAt.getTime() <= Date.now()) throw new AccountError("로그인이 필요합니다.", 401);
  return ownUser(session.userId, tx);
}

async function boundedBody(request: Request, maxBytes: number, oversizedMessage = "요청이 너무 큽니다. 더 작은 이미지를 선택하세요.") {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new AccountError(oversizedMessage, 413);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const deadline = Date.now() + 10_000;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new AccountError("업로드 시간이 초과되었습니다. 연결을 확인하고 다시 시도하세요.", 408)); void reader.cancel().catch(() => undefined); }, Math.max(1, deadline - Date.now()));
      });
      const next = await Promise.race([reader.read(), timedOut]).finally(() => clearTimeout(timer));
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) { void reader.cancel().catch(() => undefined); throw new AccountError(oversizedMessage, 413); }
      chunks.push(next.value);
    }
    return new Uint8Array(Buffer.concat(chunks, size));
  } finally { reader.releaseLock(); }
}

export async function getMobileAccountResponse(request: Request) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  try {
    const user = await ownUser(session.userId);
    return mobileJson({ account: { id: user.id, name: user.name, email: user.email,
      departmentName: user.department.name, positionName: user.position.name,
      canChangePassword: Boolean(user.passwordHash),
      profileImage: imageSummary(imageRef(user, "profile")), signatureImage: imageSummary(imageRef(user, "signature")),
    } });
  } catch (cause) { return failure(cause); }
}

export async function changeMobilePasswordResponse(request: Request) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  try {
    let input: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(await boundedBody(request, 8192, "비밀번호 변경 요청이 너무 큽니다. 입력 내용을 확인하세요.")));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      input = parsed as Record<string, unknown>;
    } catch (cause) { if (cause instanceof AccountError) throw cause; throw new AccountError("비밀번호 변경 요청이 올바르지 않습니다."); }
    const fields = {
      currentPassword: typeof input.currentPassword === "string" ? input.currentPassword : "",
      newPassword: typeof input.newPassword === "string" ? input.newPassword : "",
      confirmPassword: typeof input.confirmPassword === "string" ? input.confirmPassword : "",
    };
    const validation = validatePasswordChangeFields(fields);
    if (hasPasswordChangeValidationErrors(validation)) throw new AccountError("입력한 비밀번호를 확인하세요.", 400, validation.errors);
    await prisma.$transaction(async (tx) => {
      const user = await lockedUser(tx, session);
      if (!user.passwordHash) throw new AccountError("비밀번호 로그인 계정이 아닙니다. 관리자에게 문의하세요.", 403);
      if (!verifyPassword(fields.currentPassword, user.passwordHash)) throw new AccountError("현재 비밀번호가 올바르지 않습니다.", 400, { currentPassword: "현재 비밀번호가 올바르지 않습니다." });
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(fields.newPassword) } });
      // Match the web account policy, including the session making this request.
      await tx.mobileSession.deleteMany({ where: { userId: user.id } });
      await tx.auditLog.create({ data: { actorId: user.id, action: AuditAction.CHANGE_PASSWORD,
        targetType: "User", targetId: user.id, message: "사용자가 비밀번호를 변경했습니다.", metadata: { source: "account", client: "mobile" } } });
    });
    return mobileJson({ ok: true, message: "비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인하세요.", reauthenticate: true });
  } catch (cause) { return failure(cause); }
}

export async function getMobileAccountImageResponse(request: Request, kind: AccountImageKind) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  try {
    const image = imageRef(await ownUser(session.userId), kind);
    if (!image.storageKey) throw new AccountError("이미지를 찾을 수 없습니다.", 404);
    const file = await readStoredAttachmentFile({ storageKey: image.storageKey, storageProvider: image.storageProvider });
    const mimeType = file.mimeType ?? image.mimeType;
    if (!mimeType || !/^image\/(jpeg|png|webp)(?:;|$)/i.test(mimeType)) throw new AccountError("이미지를 불러올 수 없습니다.", 404);
    return new Response(file.body, { headers: { "Cache-Control": "private, no-store", Pragma: "no-cache",
      "Content-Type": mimeType.split(";")[0]!, "X-Content-Type-Options": "nosniff",
      ...(file.size ?? image.size ? { "Content-Length": String(file.size ?? image.size) } : {}),
    } });
  } catch (cause) { return cause instanceof AccountError ? failure(cause) : mobileJson({ error: "이미지를 불러올 수 없습니다." }, 404); }
}

async function prepareImage(request: Request, kind: AccountImageKind) {
  const inputName = kind === "profile" ? profileImageInputName : signatureImageInputName;
  let form: FormData;
  try {
    form = await new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("content-type") ?? "" }, body: await boundedBody(request, multipartMaxBytes) }).formData();
  } catch (cause) { if (cause instanceof AccountError) throw cause; throw new AccountError("이미지 업로드 요청이 올바르지 않습니다."); }
  const images = form.getAll(inputName);
  if (images.length !== 1 || !(images[0] instanceof File) || images[0].size === 0) throw new AccountError("이미지 파일을 하나 선택하세요.");
  const image = images[0];
  if (image.size > mobileAccountImageInputMaxBytes) throw new AccountError("이미지는 4MB 이하로 선택하세요.", 413);
  if (!/\.(jpe?g|png|webp)$/i.test(image.name)) throw new AccountError("JPG, PNG, WEBP 이미지만 사용할 수 있습니다.");
  let buffer: Buffer;
  try {
    const input = Buffer.from(await image.arrayBuffer());
    const processor = sharp(input, { limitInputPixels: 40_000_000, failOn: "warning" });
    const metadata = await processor.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error();
    const maxDimension = kind === "profile" ? profileImageCompressionMaxDimension : signatureImageCompressionMaxDimension;
    buffer = await processor.rotate().resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
      .webp({ quality: kind === "profile" ? 82 : 90 }).timeout({ seconds: 10 }).toBuffer();
  } catch { throw new AccountError("이미지를 읽지 못했습니다. 4천만 화소 이하의 정상 JPG, PNG, WEBP 파일을 선택하세요."); }
  const policy = kind === "profile" ? profileImagePolicy : signatureImagePolicy;
  const prepared = await prepareAttachmentFiles([new File([new Uint8Array(buffer)], "account-image.webp", { type: "image/webp" })], policy,
    { storageKeyPrefix: kind === "profile" ? profileImageStoragePrefix : signatureImageStoragePrefix });
  if (prepared.error) throw new AccountError(prepared.error.replaceAll("첨부파일", "이미지"));
  if (!prepared.files[0]) throw new AccountError("이미지를 준비하지 못했습니다.");
  return prepared.files[0];
}

export async function updateMobileAccountImageResponse(request: Request, kind: AccountImageKind) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  let prepared: PreparedAttachmentFile | null = null;
  try {
    prepared = await prepareImage(request, kind);
    try { await persistAttachmentFiles([prepared]); }
    catch { throw new AccountError("이미지 저장소에 연결하지 못했습니다. 잠시 후 다시 시도하세요.", 503); }
    const image = prepared;
    const result = await prisma.$transaction(async (tx) => {
      const user = await lockedUser(tx, session);
      const previous = imageRef(user, kind);
      const updatedAt = new Date();
      await tx.user.update({ where: { id: user.id }, data: imageUpdate(kind, image, updatedAt) });
      await tx.auditLog.create({ data: { actorId: user.id, action: AuditAction.UPDATE_USER,
        targetType: "User", targetId: user.id, message: `사용자가 ${kind === "profile" ? "프로필" : "결재 도장/서명"} 이미지를 변경했습니다.`, metadata: { source: "account", client: "mobile" } } });
      return { previous, image: { exists: true, mimeType: image.mimeType, size: image.size, updatedAt: updatedAt.toISOString() } };
    });
    prepared = null;
    if (result.previous.storageKey) await removeStoredAttachmentFiles([{ storageKey: result.previous.storageKey, storageProvider: result.previous.storageProvider }]).catch(() => undefined);
    return mobileJson({ ok: true, message: "이미지가 저장되었습니다.", image: result.image });
  } catch (cause) {
    if (prepared) await removeStoredAttachmentFiles([prepared]).catch(() => undefined);
    return failure(cause);
  }
}

export async function deleteMobileAccountImageResponse(request: Request, kind: AccountImageKind) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  try {
    const previous = await prisma.$transaction(async (tx) => {
      const user = await lockedUser(tx, session);
      const previous = imageRef(user, kind);
      if (!previous.storageKey) return previous;
      await tx.user.update({ where: { id: user.id }, data: imageUpdate(kind, null, null) });
      await tx.auditLog.create({ data: { actorId: user.id, action: AuditAction.UPDATE_USER,
        targetType: "User", targetId: user.id, message: `사용자가 ${kind === "profile" ? "프로필" : "결재 도장/서명"} 이미지를 삭제했습니다.`, metadata: { source: "account", client: "mobile" } } });
      return previous;
    });
    if (previous.storageKey) await removeStoredAttachmentFiles([{ storageKey: previous.storageKey, storageProvider: previous.storageProvider }]).catch(() => undefined);
    return mobileJson({ ok: true, message: "이미지가 삭제되었습니다.", image: { exists: false, mimeType: null, size: null, updatedAt: null } });
  } catch (cause) { return failure(cause); }
}
