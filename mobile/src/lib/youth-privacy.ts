/** Account-private state is memory only; there is no SecureStore PII cache. */
let generation = 0;
const accountGenerations = new Map<string, number>();
const resources = new Set<{ token: string; clear: () => void | Promise<void> }>();
export function youthPrivacyGeneration(token: string) { return `${generation}:${accountGenerations.get(token) ?? 0}`; }
export function registerYouthResource(token: string, clear: () => void | Promise<void>) {
  const resource = { token, clear }; resources.add(resource);
  return () => { resources.delete(resource); };
}
export function clearYouthResources(options: { expectedToken?: string } = {}): Promise<void> {
  // Invalidates captured callbacks before any filesystem cleanup awaits.
  if (options.expectedToken) accountGenerations.set(options.expectedToken, (accountGenerations.get(options.expectedToken) ?? 0) + 1);
  else { generation++; accountGenerations.clear(); }
  const pending: Promise<unknown>[]=[];
  for (const resource of [...resources]) {
    if (options.expectedToken && resource.token !== options.expectedToken) continue;
    resources.delete(resource);
    try { pending.push(Promise.resolve(resource.clear())); } catch { /* keep clearing owned resources */ }
  }
  return Promise.allSettled(pending).then(() => undefined);
}
