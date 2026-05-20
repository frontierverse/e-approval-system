import Link from "next/link";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

type TitleBackLinkProps = {
  href: string;
  label?: string;
};

export function TitleBackLink({
  href,
  label = "목록으로",
}: TitleBackLinkProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={buttonClass(
        buttonStyles.base,
        buttonStyles.neutral,
        "h-10 w-10 shrink-0 p-0",
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </svg>
    </Link>
  );
}
