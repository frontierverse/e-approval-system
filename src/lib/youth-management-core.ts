export const youthNoteCategories = [
  "보호관찰",
  "학원",
  "외박",
  "이탈",
  "가족",
] as const;

export const youthNotePriorities = ["보통", "긴급"] as const;

export type YouthNoteCategory = (typeof youthNoteCategories)[number];
export type YouthNotePriority = (typeof youthNotePriorities)[number];

export type YouthSpecialNote = {
  id: string;
  title: string;
  summary: string;
  detail: string;
  category: YouthNoteCategory;
  recordedAt: string;
  author: string;
  priority: YouthNotePriority;
};

export type YouthFamilyContact = {
  id: string;
  relationship: string | null;
  phone: string | null;
};

export type YouthProfile = {
  id: string;
  name: string;
  admissionDate: string | null;
  dischargeDate: string | null;
  age: number | null;
  phone: string | null;
  familyContacts: YouthFamilyContact[];
  notes: YouthSpecialNote[];
};

export type YouthFamilyContactInput = {
  relationship: string;
  phone: string;
};

export type YouthCreateInput = {
  name: string;
  admissionDate: string;
  dischargeDate: string;
  age: string;
  phone: string;
  familyContacts: YouthFamilyContactInput[];
};

export type YouthNoteInput = Omit<YouthSpecialNote, "id">;

export type YouthActionResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

export function isYouthNoteCategory(value: string): value is YouthNoteCategory {
  return youthNoteCategories.some((category) => category === value);
}

export function isYouthNotePriority(value: string): value is YouthNotePriority {
  return youthNotePriorities.some((priority) => priority === value);
}

export function normalizeYouthNoteCategory(value: string): YouthNoteCategory {
  return isYouthNoteCategory(value) ? value : "보호관찰";
}

export function normalizeYouthNotePriority(value: string): YouthNotePriority {
  return isYouthNotePriority(value) ? value : "보통";
}
