import {
  getResourceCategoryDisplayLabel,
  type ResourceCategory,
  type ResourceEducationLevel,
} from "@/lib/resource-library-core";

type ResourceCategoryBadgeProps = {
  category: ResourceCategory;
  educationLevel?: ResourceEducationLevel | null;
};

const educationLevelBadgeTone: Record<ResourceEducationLevel, string> = {
  common: "border-[#b8d9d7] bg-[#eef7f6] text-[#196b69]",
  high: "border-[#b9c9ea] bg-[#eaf0fb] text-[#274f9f]",
  middle: "border-[#ead8a8] bg-[#fff8df] text-[#82620d]",
};

export function ResourceCategoryBadge({
  category,
  educationLevel = null,
}: ResourceCategoryBadgeProps) {
  const tone =
    category === "education" && educationLevel
      ? educationLevelBadgeTone[educationLevel]
      : "border-[#d9dee7] bg-[#f7f9fc] text-[#394150]";

  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-xs font-semibold leading-none ${tone}`}
    >
      {getResourceCategoryDisplayLabel({ category, educationLevel })}
    </span>
  );
}
