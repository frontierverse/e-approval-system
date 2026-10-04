export type CafeCategory = 'food' | 'consumable' | 'supply' | 'equipment' | 'other';
export type CafeCategoryFilter = 'all' | CafeCategory;
export type CafeDeadline = 'all' | 'expired' | 'dueSoon' | 'over100';
export type CafeSort = 'latest' | 'expirationAsc' | 'expirationDesc';
export type CafeHeld = 'all' | 'only';
export type CafeAction = 'all' | 'create' | 'update' | 'hold' | 'delete';
export type CafeActor = { id: string; name: string };
export type CafeUsage = { basisLabel: string; label: string; status: 'expired' | 'neutral' | 'safe' | 'soon' };
export type MobileMealMenuResponse = {
  today: string; date: string; menuItems: string[];
  summary: { schoolCount: number; totalCount: number; preservationCount: number; deliveryDriverCount: number };
  schools: { schoolId: string; schoolName: string; schoolType: 'elementary' | 'kindergarten'; totalCount: number; preservationCount: number; deliveryDriverCount: number }[];
};
export type MobileCafeItemSummary = {
  id: string; name: string; category: CafeCategory; purchasedAt: string;
  priceWon: number | null; expirationDate: string | null; isHeld: boolean; usage: CafeUsage;
};
export type MobileCafeItemDetailResponse = {
  today: string; item: MobileCafeItemSummary & {
    purchaseReason: string | null; expirationHoldReason: string | null; createdAt: string; updatedAt: string;
  };
};
export type CafeItemFilters = { category: CafeCategoryFilter; deadline: CafeDeadline; sort: CafeSort; query: string; held: CafeHeld };
export type MobileCafeItemPage = {
  today: string; filters: CafeItemFilters;
  summary: { expiredFoodCount: number; dueSoonFoodCount: number; heldItemCount: number };
  items: MobileCafeItemSummary[]; page: number; pageSize: 20; total: number; totalPages: number;
};
export type CafeHistoryFilters = { action: CafeAction; actorId: string; query: string; itemId: string | null };
export type MobileCafeHistoryResponse = {
  filters: CafeHistoryFilters; actors: CafeActor[];
  logs: { id: string; actionType: Exclude<CafeAction, 'all'>; actor: CafeActor; createdAt: string; itemId: string; itemName: string; message: string }[];
  page: number; pageSize: 20; total: number; totalPages: number;
};
export type MobileCafeNote = { id: string; content: string; createdAt: string; updatedAt: string; createdBy: CafeActor | null };
export type MobileCafeNotePage = { notes: MobileCafeNote[]; page: number; pageSize: 20; total: number; totalPages: number };
export type CafeItemInput = { name: string; category: CafeCategory; purchasedAt: string; priceWon: number | null; purchaseReason: string; expirationDate: string | null };
export type CafeItemValues = Omit<CafeItemInput, 'priceWon' | 'expirationDate'> & { priceWon: string; expirationDate: string };
export type CafeOperation = 'item.create' | 'item.update' | 'item.delete' | 'item.hold' | 'note.create' | 'note.delete';
export type CafeMutationResult = {
  ok: true; message: string; replayed: boolean; requestId: string; operation: CafeOperation;
  targetType: 'CafeItem' | 'CafeComplianceNote'; targetId: string; outcome: 'present' | 'deleted';
  committedAt: string; committedUpdatedAt: string | null;
  result: MobileCafeItemDetailResponse | MobileCafeNote | null;
};
