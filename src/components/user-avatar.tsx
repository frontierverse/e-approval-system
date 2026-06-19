import Image from "next/image";

export type AvatarUser = {
  id: string;
  name: string;
  profileImageStorageKey?: string | null;
  profileImageUpdatedAt?: Date | string | null;
};

const sizeClasses = {
  xs: {
    wrapper: "size-7 text-xs",
    image: "size-7",
    pixel: 28,
  },
  sm: {
    wrapper: "size-9 text-sm",
    image: "size-9",
    pixel: 36,
  },
  lg: {
    wrapper: "size-24 text-3xl",
    image: "size-24",
    pixel: 96,
  },
} as const;

const fallbackColorClasses = [
  "border-[#8cc5d8] bg-[#e8f6fb] text-[#155366]",
  "border-[#a7c8ef] bg-[#eef6ff] text-[#1d4d7a]",
  "border-[#b8c4f3] bg-[#f1f3ff] text-[#3e4a8a]",
  "border-[#c6b8ee] bg-[#f5f0ff] text-[#59418d]",
  "border-[#e4b6d3] bg-[#fff0f7] text-[#7b315b]",
  "border-[#efb0aa] bg-[#fff1ef] text-[#8a352d]",
  "border-[#e6bf80] bg-[#fff6e4] text-[#76511a]",
  "border-[#c9cf83] bg-[#fbfbe8] text-[#5a621b]",
  "border-[#a7cf9a] bg-[#eff9ec] text-[#326b2c]",
  "border-[#95d0ba] bg-[#eaf8f2] text-[#236451]",
  "border-[#93d0d0] bg-[#e8f8f8] text-[#1d6464]",
  "border-[#adc1ce] bg-[#f0f5f7] text-[#344f60]",
] as const;

const hangulSyllableStart = 0xac00;
const hangulSyllableEnd = 0xd7a3;
const hangulSyllablesPerInitial = 588;

export function UserAvatar({
  user,
  size = "sm",
  decorative = false,
}: {
  user: AvatarUser;
  size?: keyof typeof sizeClasses;
  decorative?: boolean;
}) {
  const initial = user.name.trim().slice(0, 1) || "?";
  const classNames = sizeClasses[size];
  const fallbackColorClass = getUserAvatarColorClass(user.name);

  if (user.profileImageStorageKey) {
    return (
      <Image
        src={getProfileImageSrc(user)}
        alt={decorative ? "" : `${user.name} 프로필 사진`}
        width={classNames.pixel}
        height={classNames.pixel}
        unoptimized
        className={`${classNames.image} rounded-full border border-[#cfd6e3] object-cover`}
      />
    );
  }

  return (
    <span
      className={`${classNames.wrapper} grid place-items-center rounded-full border font-semibold ${fallbackColorClass}`}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : `${user.name} 프로필 기본 이미지`}
    >
      {initial}
    </span>
  );
}

export function getUserAvatarColorClass(name: string) {
  const colorIndex = getUserAvatarColorIndex(name);

  return fallbackColorClasses[colorIndex];
}

function getUserAvatarColorIndex(name: string) {
  const firstCharacter = Array.from(name.trim())[0] ?? "?";
  const codePoint = firstCharacter.codePointAt(0) ?? 0;

  if (codePoint >= hangulSyllableStart && codePoint <= hangulSyllableEnd) {
    const initialIndex = Math.floor(
      (codePoint - hangulSyllableStart) / hangulSyllablesPerInitial,
    );

    return initialIndex % fallbackColorClasses.length;
  }

  return (
    hashString(firstCharacter.toLocaleUpperCase("ko-KR")) %
    fallbackColorClasses.length
  );
}

function hashString(value: string) {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }

  return hash;
}

function getProfileImageSrc(user: AvatarUser) {
  const updatedAt =
    user.profileImageUpdatedAt instanceof Date
      ? user.profileImageUpdatedAt.getTime()
      : user.profileImageUpdatedAt
        ? new Date(user.profileImageUpdatedAt).getTime()
        : 0;

  return `/profile-images/${user.id}?v=${updatedAt}`;
}
