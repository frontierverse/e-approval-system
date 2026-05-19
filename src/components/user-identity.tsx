import {
  UserAvatar,
  type AvatarUser,
} from "@/components/user-avatar";

type UserIdentityProps = {
  user: AvatarUser;
  meta?: React.ReactNode;
  size?: "xs" | "sm";
  className?: string;
  nameClassName?: string;
  metaClassName?: string;
};

export function UserIdentity({
  user,
  meta,
  size = "xs",
  className = "",
  nameClassName = "text-[#16181d]",
  metaClassName = "text-[#697386]",
}: UserIdentityProps) {
  return (
    <div
      className={`flex min-w-0 flex-row items-center gap-2 ${className}`.trim()}
    >
      <span className="shrink-0">
        <UserAvatar user={user} size={size} decorative />
      </span>
      <div className="min-w-0">
        <p className={`truncate font-semibold ${nameClassName}`.trim()}>
          {user.name}
        </p>
        {meta ? (
          <p className={`mt-0.5 truncate text-xs ${metaClassName}`.trim()}>
            {meta}
          </p>
        ) : null}
      </div>
    </div>
  );
}
