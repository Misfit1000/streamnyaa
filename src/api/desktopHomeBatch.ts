import { fetchAniList, mapAnilistToJikan } from './jikan';
import { recentFeedBound, recentHomeQuery, validRecentSchedules } from './desktopRecentSchedule';
import { getCurrentAnimeSeason } from '../lib/currentSeason';
import type { DesktopRequestOptions } from '../lib/desktopRequests';
import { useStore } from '../store/useStore';

type ShelfRequest = { key: string; options: DesktopRequestOptions; resolve: (value: any) => void; reject: (error: unknown) => void };
const fields = `id idMal title { romaji english native } synonyms description episodes status format season seasonYear source coverImage { extraLarge large color } bannerImage genres averageScore popularity nextAiringEpisode { episode airingAt } isAdult`;
let waiting: ShelfRequest[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
// Larger alias sets exceeded the native eight-second HTTP deadline in live
// primary probes. Keep the work per request bounded; the native queue paces it.
export const MAX_HOME_BATCH_SHELVES = 2;

/** Only mounted, visible shelves enter this batch; each returned shelf is checked independently. */
export function homeShelfSelection(key: string, adult: boolean, before = recentFeedBound()) {
  if (key === 'home:recent') return recentHomeQuery(18, before).replace(/query\s*\{/, '').replace(/\}\s*$/, '').trim();
  const season = getCurrentAnimeSeason();
  const filters: Record<string, string> = {
    'home:seasonal': `season: ${season.season.toUpperCase()}, seasonYear: ${season.year}, sort: POPULARITY_DESC`,
    'home:trending': 'status: RELEASING, sort: TRENDING_DESC',
    'home:top-airing': 'status: RELEASING, sort: SCORE_DESC',
    'home:popular': 'sort: POPULARITY_DESC',
    'home:upcoming': 'status: NOT_YET_RELEASED, sort: TRENDING_DESC',
  };
  const year = /^home:year:(\d{4})$/.exec(key)?.[1];
  const selection = year ? `seasonYear: ${year}, sort: SCORE_DESC` : filters[key];
  if (!selection) throw new Error('Unknown Home shelf.');
  return `Page(page: 1, perPage: 18) { media(type: ANIME, ${selection}${adult ? '' : ', isAdult: false'}) { ${fields} } }`;
}

function flush() {
  flushTimer = undefined;
  const batch = waiting;
  waiting = [];
  const keys = [...new Set(batch.map(item => item.key))];
  for (let index = 0; index < keys.length; index += MAX_HOME_BATCH_SHELVES) {
    const group = new Set(keys.slice(index, index + MAX_HOME_BATCH_SHELVES));
    void fetchBatch(batch.filter(item => group.has(item.key)));
  }
}

async function fetchBatch(batch: ShelfRequest[]) {
  const active = batch.filter(item => !item.options.signal?.aborted);
  batch.filter(item => item.options.signal?.aborted).forEach(item => item.reject(new DOMException('Cancelled', 'AbortError')));
  if (!active.length) return;
  const controller = new AbortController();
  const abortHandlers = active.map(item => {
    const abort = () => {
      // A cancelled shelf must settle immediately even while another shelf is
      // still waiting for the same native request to finish.
      item.reject(new DOMException('Cancelled', 'AbortError'));
      if (active.every(candidate => candidate.options.signal?.aborted)) controller.abort();
    };
    item.options.signal?.addEventListener('abort', abort, { once: true });
    return abort;
  });
  const before = recentFeedBound();
  const adult = useStore.getState().nsfwMode;
  try {
    const uniqueKeys = [...new Set(active.map(item => item.key))];
    const query = `query { ${uniqueKeys.map((key, index) => `s${index}: ${homeShelfSelection(key, adult, before)}`).join('\n')} }`;
    const response = await fetchAniList({ query }, uniqueKeys.includes('home:recent') ? 60 : 600, {
      signal: controller.signal,
      priority: active.some(item => item.options.priority === 'foreground') ? 'foreground' : 'background',
    });
    if (!response.ok) throw new Error(`Home catalog request failed (${response.status}).`);
    const payload = await response.json();
    const fetchedAt = Number(response.headers.get('X-StreamNyaa-Fetched-At')) || Date.now();
    const stale = response.headers.get('X-StreamNyaa-Desktop-Cache') === 'stale' || response.headers.get('X-StreamNyaa-Local-Cache') === 'local-stale';
    const retryAt = Number(response.headers.get('X-StreamNyaa-Retry-At')) || undefined;
    active.forEach(item => {
      if (item.options.signal?.aborted) { item.reject(new DOMException('Cancelled', 'AbortError')); return; }
      const page = payload?.data?.[`s${uniqueKeys.indexOf(item.key)}`];
      const rows = item.key === 'home:recent' ? page?.airingSchedules : page?.media;
      if (!Array.isArray(rows)) { item.reject(new Error('The requested Home shelf was not returned.')); return; }
      const data = item.key === 'home:recent'
        ? validRecentSchedules(rows, before).filter((record: any) => adult || !record.media.isAdult).map((record: any) => ({
          ...mapAnilistToJikan(record.media), latestEpisode: record.episode, airingAt: record.airingAt, recentFeedKind: 'aired',
        }))
        : rows.map(mapAnilistToJikan);
      item.resolve({ data, fetchedAt, stale, retryAt, streamnyaa: { fetchedAt, retryAt, status: stale ? 'stale' : 'fresh' }, ...(item.key === 'home:recent' ? { recentFeedKind: 'aired', before } : {}) });
    });
  } catch (error) { active.forEach(item => item.reject(error)); }
  finally { active.forEach((item, index) => item.options.signal?.removeEventListener('abort', abortHandlers[index])); }
}

export function fetchHomeShelf(key: string, options: DesktopRequestOptions = {}): Promise<any> {
  if (options.signal?.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
  return new Promise((resolve, reject) => {
    waiting.push({ key, options, resolve, reject });
    flushTimer ??= setTimeout(flush, 0);
  });
}
