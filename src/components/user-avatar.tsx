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
      className={`${classNames.wrapper} grid place-items-center rounded-full border border-[#cfd6e3] bg-[#f7f9fc] font-semibold text-[#394150]`}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : `${user.name} 프로필 기본 이미지`}
    >
      {initial}
    </span>
  );
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
