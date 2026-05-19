export const buttonStyles = {
  base: "inline-flex cursor-pointer items-center justify-center rounded-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
  primary: "bg-[#2563eb] text-white hover:bg-[#1d4ed8]",
  create: "bg-[#0f6f8f] text-white hover:bg-[#0b5973]",
  save: "bg-[#3b5f7f] text-white hover:bg-[#2f4d68]",
  approve: "bg-[#16834a] text-white hover:bg-[#11683a]",
  danger: "bg-[#b42318] text-white hover:bg-[#8f1d15]",
  dangerOutline:
    "border border-[#e4b4ad] bg-white text-[#9f241a] hover:bg-[#fff1ef] dark:border-[#f851498c] dark:bg-[#da363329] dark:text-[#ff7b72] dark:hover:bg-[#da363338]",
  neutral:
    "border border-[#cfd6e3] bg-white text-[#394150] hover:bg-[#f7f9fc]",
  cancel:
    "border border-[#cfd6e3] bg-[#eef1f5] text-[#394150] hover:bg-[#f7f9fc]",
  filter: "bg-[#475569] text-white hover:bg-[#334155]",
} as const;

export function buttonClass(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}
