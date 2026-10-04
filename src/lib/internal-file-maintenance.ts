export type InternalMaintenanceLane = "resource" | "youthExpiry" | "youthQueue" | "approvedPurge";
export type InternalMaintenanceCounts = { checked: number; completed?: number; expired?: number; pending?: number };
export type InternalMaintenancePort = (context: Record<string, never>, options: { limit: number; budgetMs: number; signal: AbortSignal }) => Promise<InternalMaintenanceCounts>;
export type InternalMaintenancePorts = Record<InternalMaintenanceLane, InternalMaintenancePort>;
type LaneSummary = { checked: number; completed: number; expired: number; pending: number; batches: number; failed: boolean; timedOut: boolean };
const slots = [
  { name: "resource", limit: 10, budgetMs: 4000 },
  { name: "youthExpiry", limit: 3, budgetMs: 1000 },
  { name: "youthQueue", limit: 5, budgetMs: 3000 },
  { name: "approvedPurge", limit: 2, budgetMs: 2000 },
] as const;
// No domain is imported until this trusted function is called after Cron authentication.
const ports: InternalMaintenancePorts = {
  async resource(context, options) { return (await import("@/lib/resource-file-cleanup")).reconcileResourceLibraryMaintenance(context, options); },
  async youthExpiry(context, options) { return (await import("@/lib/youth-decision-file-cleanup")).reconcileYouthDecisionUploadExpiry(context, options); },
  async youthQueue(context, options) { return (await import("@/lib/youth-decision-file-cleanup")).reconcileYouthDecisionFileQueue(context, options); },
  async approvedPurge(context, options) { return (await import("@/lib/youth-purge")).reconcileYouthPurgeMaintenance(context, options); },
};
function count(value: unknown) { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error("INVALID_MAINTENANCE_RESULT"); return value as number; }
function counts(value: InternalMaintenanceCounts) {
  return { checked: count(value.checked), completed: count(value.completed ?? 0), expired: count(value.expired ?? 0), pending: count(value.pending ?? 0) };
}
/** Four reserved lanes, at most four rounds. Cancellation never proves storage quiescence. */
export async function runInternalFileMaintenance(options: { ports?: InternalMaintenancePorts; now?: () => number; signal?: AbortSignal } = {}) {
  const clock = options.now ?? Date.now, deadline = clock() + 45000, active = options.ports ?? ports;
  const lanes = Object.fromEntries(slots.map(slot => [slot.name, { checked: 0, completed: 0, expired: 0, pending: 0, batches: 0, failed: false, timedOut: false }])) as Record<InternalMaintenanceLane, LaneSummary>;
  const stopped = new Set<InternalMaintenanceLane>();
  let failed = false;
  for (let round = 0; round < 4; round++) {
    for (const slot of slots) {
      if (stopped.has(slot.name)) continue;
      const summary = lanes[slot.name], remaining = deadline - clock();
      if (remaining <= 0 || options.signal?.aborted) { failed = true; stopped.add(slot.name); summary.failed = true; continue; }
      const budgetMs = Math.min(slot.budgetMs, remaining), slotDeadline = clock() + budgetMs, controller = new AbortController();
      const abort = () => controller.abort();
      options.signal?.addEventListener("abort", abort, { once: true });
      let timer: ReturnType<typeof setTimeout> | undefined, timedOut = false;
      const timeout = new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("MAINTENANCE_CANCELLED")), { once: true });
        timer = setTimeout(() => { timedOut = true; controller.abort(); }, budgetMs);
      });
      summary.batches++;
      try {
        const result = await Promise.race([Promise.resolve().then(() => active[slot.name]({}, { limit: slot.limit, budgetMs, signal: controller.signal })), timeout]);
        if (clock() > slotDeadline || controller.signal.aborted) { timedOut = true; throw new Error("MAINTENANCE_DEADLINE"); }
        const completed = counts(result);
        for (const key of ["checked", "completed", "expired", "pending"] as const) summary[key] += completed[key];
        // Physical completion0 is normal while writers remain unknown. Candidate/expiry/pending progress continues.
        if (completed.checked === 0 && completed.expired === 0 && completed.pending === 0) stopped.add(slot.name);
      } catch {
        failed = true; summary.failed = true; summary.timedOut = timedOut;
        // An unresolved task may still hold a claim. Never overlap it with another call in this run.
        stopped.add(slot.name);
        controller.abort();
      } finally {
        clearTimeout(timer); options.signal?.removeEventListener("abort", abort);
      }
    }
  }
  // Preserve the existing resource fields; Youth work has its own additive safe counters.
  return { ok: !failed, checked: lanes.resource.checked, completed: lanes.resource.completed, lanes };
}
