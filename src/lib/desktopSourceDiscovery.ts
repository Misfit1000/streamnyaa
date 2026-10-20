import { normalizeSourceTitle, orderedSourceAliases, type SourceIdentity } from './desktopSourceIdentity';

export type SourceSearchJob = { query: string; category: string; page: number; scope: 'episode' | 'title'; episode?: number };
export type SourceDiscovery<T> = { items: T[]; complete: boolean; pending?: SourceSearchJob[]; fetchedAt?: number; stale?: boolean;
  partialReason?: 'discovery-budget' | 'provider-failure'; retryAt?: number };

/** Page/category coverage is explicit, so a fast first result is never described as exhaustive. */
export function sourceSearchPlan(identity: SourceIdentity, episode?: number, audioSuffix = ''): SourceSearchJob[] {
  const allAliases = orderedSourceAliases(identity.aliases);
  const aliases = allAliases;
  const episodeScoped = Boolean(episode && identity.format !== 'MOVIE');
  const queryValues = episodeScoped
    ? aliases.flatMap(alias => {
      const root = alias.replace(/\b(?:season|part|cour)\s*\d+\b|\b\d+(?:st|nd|rd|th)\s+season\b/ig, ' ').replace(/\s+/g, ' ').trim();
      return identity.seasonNumber
        ? [`${root} S${String(identity.seasonNumber).padStart(2, '0')}E${String(episode).padStart(2, '0')}${audioSuffix}`, `${alias} ${String(episode).padStart(2, '0')}${audioSuffix}`]
        : [`${alias} ${String(episode).padStart(2, '0')}${audioSuffix}`];
    })
    : aliases.map(alias => `${alias}${audioSuffix}`);
  const seen = new Set<string>();
  const queries = queryValues.filter(query => { const key = normalizeSourceTitle(query); if (seen.has(key)) return false; seen.add(key); return true; });
  const jobs: SourceSearchJob[] = [];
  // All spelling variants on the preferred category first, then broaden categories, then pages.
  for (const page of [1, 2, 3]) for (const category of ['1_2', '1_3', '1_4']) for (const query of queries) {
    jobs.push({ query, category, page, scope: episodeScoped ? 'episode' : 'title', ...(episodeScoped ? { episode } : {}) });
  }
  return jobs;
}

export async function runSourceSearchPass<T>(options: {
  jobs: SourceSearchJob[]; initial?: T[]; signal?: AbortSignal; merge: (items: T[]) => T[];
  initialState?: { stale?: boolean; fetchedAt?: number; retryAt?: number };
  fetch: (job: SourceSearchJob, deadlineMs: number) => Promise<{ items: T[]; complete?: boolean; stale?: boolean; fetchedAt?: number; emptyPage?: boolean; retryAt?: number }>;
  publish?: (result: SourceDiscovery<T>) => void; budgetMs?: number; requestLimit?: number;
}): Promise<SourceDiscovery<T>> {
  const started = Date.now(), budget = options.budgetMs ?? 30_000, limit = options.requestLimit ?? 12;
  let items = options.merge(options.initial || []), stale = options.initialState?.stale === true, fetchedAt = options.initialState?.fetchedAt;
  let interrupted = false, retryAt = options.initialState?.retryAt;
  const pending = [...options.jobs]; let launched = 0;
  const result = (): SourceDiscovery<T> => ({ items, complete: pending.length === 0 && !stale, pending: [...pending], stale, fetchedAt, retryAt,
    partialReason: pending.length || stale ? interrupted || stale ? 'provider-failure' : 'discovery-budget' : undefined });
  while (pending.length && launched < limit && Date.now() - started < budget) {
    if (options.signal?.aborted) throw new DOMException('Source search cancelled.', 'AbortError');
    const batch: SourceSearchJob[] = [];
    for (let index = 0; index < pending.length && batch.length < Math.min(2, limit - launched);) {
      const job = pending[index];
      const earlier = [...batch, ...pending].some(other => other.query === job.query && other.category === job.category && other.page < job.page);
      if (earlier) { index++; continue; }
      batch.push(...pending.splice(index, 1));
    }
    if (!batch.length) break;
    launched += batch.length;
    let admissionWait = false;
    const results = await Promise.all(batch.map(async job => {
      try { return { job, result: await options.fetch(job, Math.max(1, Math.min(8_000, budget - (Date.now() - started)))) }; }
      catch (error) { return { job, error }; }
    }));
    if (options.signal?.aborted) throw new DOMException('Source search cancelled.', 'AbortError');
    for (const lane of results) {
      if ('result' in lane && lane.result) {
        items = options.merge([...items, ...lane.result.items]);
        stale ||= lane.result.stale === true;
        fetchedAt = fetchedAt == null ? lane.result.fetchedAt : Math.min(fetchedAt, lane.result.fetchedAt ?? fetchedAt);
        if (lane.result.complete === false || lane.result.stale) {
          pending.push(lane.job); admissionWait = true; interrupted = true;
          retryAt = Math.max(retryAt || 0, lane.result.retryAt || 0) || undefined;
        }
        else if (lane.result.emptyPage === true) {
          // An empty page ends this exact query/category pagination lane.
          for (let i = pending.length - 1; i >= 0; i--) if (pending[i].query === lane.job.query && pending[i].category === lane.job.category && pending[i].page > lane.job.page) pending.splice(i, 1);
        }
      } else {
        pending.push(lane.job);
        interrupted = true;
        const error = lane.error as { retryAt?: number; retryAfterMs?: number };
        retryAt = Math.max(retryAt || 0, error?.retryAt || (error?.retryAfterMs ? Date.now() + error.retryAfterMs : 0)) || undefined;
        // Failed lanes stay pending for recovery; do not hammer a failed endpoint
        // again during this pass or mistake the interruption for a valid empty page.
        admissionWait = true;
      }
    }
    options.publish?.(result());
    if (admissionWait) break;
  }
  return result();
}

/** A later empty/failed lane cannot overwrite successful earlier lanes. */
export class SourceAccumulator<T> {
  private values: T[] = [];
  private interrupted = false;
  constructor(private readonly merge: (items: T[]) => T[]) {}
  add(items: T[]) { this.values = this.merge([...this.values, ...items]); return this.values; }
  interrupt() { this.interrupted = true; }
  result(): SourceDiscovery<T> { return { items: [...this.values], complete: !this.interrupted }; }
}
