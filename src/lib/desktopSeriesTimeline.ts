export type TimelineResult = { items: any[]; complete: boolean; pending: any[]; expanded: string[]; retryAfterMs?: number };
const identities = (item: any): string[] => [item?.anilist_id ? 'anilist:' + item.anilist_id : '', item?.mal_id ? 'mal:' + item.mal_id : ''].filter(Boolean);
const identity = (item: any) => identities(item)[0] || '';

export async function loadSeriesTimeline(options: {
  root: any; previous?: TimelineResult; children: (item: any) => any[]; allowed: (item: any) => boolean;
  fetchBatch: (entries: any[], signal: AbortSignal) => Promise<any[]>; signal: AbortSignal; onPartial: (result: TimelineResult) => void;
}): Promise<TimelineResult> {
  const { root, signal, children, allowed, fetchBatch, onPartial } = options;
  const items = new Map((options.previous?.items || []).map(item => [identity(item), item]));
  const expanded = new Set(options.previous?.complete === false ? options.previous.expanded : identities(root));
  const queue = options.previous?.complete === false ? [...options.previous.pending] : [];
  let retryAfterMs: number | undefined;
  const enqueue = (entry: any) => {
    const keys = identities(entry);
    if (keys.length && !keys.some(key => expanded.has(key)) && !queue.some(item => identities(item).some(key => keys.includes(key))) && allowed(entry)) queue.push(entry);
  };
  children(root).forEach(enqueue);
  const result = (): TimelineResult => ({ items: [...items.values()], complete: queue.length === 0,
    pending: [...queue], expanded: [...expanded], retryAfterMs });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(cancel, 10_000);
  try {
  // Bound a refresh, not the series size. Automatic recovery resumes the remaining queue.
  for (let batchNumber = 0; queue.length && batchNumber < 8; batchNumber++) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (controller.signal.aborted) break;
    const batch = queue.splice(0, 8);
    try {
      const loaded = await fetchBatch(batch, controller.signal);
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const byId = new Map(loaded.flatMap(item => identities(item).map(key => [key, item] as const)));
      const foundItems: any[] = [];
      const missing: any[] = [];
      for (const entry of batch) {
        const key = identity(entry);
        const found = identities(entry).map(key => byId.get(key)).find(Boolean);
        if (!found) { missing.push(entry); continue; }
        identities(entry).concat(identities(found)).forEach(key => expanded.add(key));
        const value = { ...found, relation: entry.relation };
        for (const [id, item] of items) if (identities(item).some(id => identities(value).includes(id))) items.delete(id);
        items.set(identity(value), value);
        foundItems.push(value);
      }
      foundItems.forEach(value => children(value).forEach(enqueue));
      missing.forEach(enqueue);
      for (let i = queue.length - 1; i >= 0; i--) if (identities(queue[i]).some(key => expanded.has(key))) queue.splice(i, 1);
      onPartial(result());
      if (missing.length) break;
    } catch (error) {
      if (signal.aborted) throw error;
      retryAfterMs = (error as { retryAfterMs?: number })?.retryAfterMs;
      queue.unshift(...batch);
      break;
    }
  }
  return result();
  } finally { clearTimeout(deadline); signal.removeEventListener('abort', cancel); }
}
