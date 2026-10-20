export type ReleaseTrack = 'original' | 'sub' | 'dub';
export type CalendarRecord = {
  canonicalId: string; anilist_id?: number; mal_id?: number; title: string; image?: string;
  airingEpisode: number; airingAt: number; previousAiringAt?: number; releaseTrack: ReleaseTrack;
  scheduleStatus: string; scheduleReason?: string; scheduleFetchedAt: number;
  scheduleProvider: 'anilist' | 'animeschedule'; scheduleId: string; sourceRoute?: string; isAdult?: boolean;
  [key: string]: unknown;
};
export type PublicCalendar = { version: 1; data: CalendarRecord[]; complete: boolean; cursor?: string; stale: boolean;
  fetchedAt: number; providers: Record<string, { fetchedAt: number; stale: boolean; error?: string }>;
  persistenceError?: string; retryAt?: number };
const positive = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined;
export function isCalendarRecord(value: any): value is CalendarRecord {
  return value && typeof value==='object' && typeof value.title==='string' && value.title.length<=1000
    && /^(?:anilist:[1-9]\d*|mal:[1-9]\d*|animeschedule:[a-z0-9-]{1,240})$/.test(value.canonicalId)
    && Number.isSafeInteger(value.airingEpisode) && value.airingEpisode>0 && value.airingEpisode<=100000
    && Number.isFinite(value.airingAt) && value.airingAt>=0 && ['original','sub','dub'].includes(value.releaseTrack)
    && ['anilist','animeschedule'].includes(value.scheduleProvider) && typeof value.scheduleId==='string'
    && Number.isFinite(value.scheduleFetchedAt) && value.scheduleFetchedAt>0 && value.scheduleFetchedAt<=Date.now()+60_000;
}
export function isPublicCalendar(value: any): value is PublicCalendar {
  return value?.version===1 && Array.isArray(value.data) && value.data.length<=1500 && value.data.every(isCalendarRecord)
    && typeof value.complete==='boolean' && typeof value.stale==='boolean' && Number.isFinite(value.fetchedAt)
    && value.providers && Object.values(value.providers).every((state:any)=>Number.isFinite(state.fetchedAt)&&typeof state.stale==='boolean');
}
const time = (value: unknown) => {
  if (!value || /^0001-/.test(String(value))) return 0;
  const ms = typeof value === 'number' ? value > 1e12 ? value : value * 1000 : Date.parse(String(value));
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
};
export function scheduleProviderIds(detail: any) {
  const found: { anilist_id?: number; mal_id?: number } = {};
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      try {
        const url = new URL(value.startsWith('//') ? `https:${value}` : value.includes('://') ? value : `https://${value}`);
        if (!['https:','http:'].includes(url.protocol) || url.username || url.password) return;
        const match = url.pathname.match(/^\/anime\/([1-9]\d*)(?:\/|$)/), id = positive(match?.[1]);
        if (id && ['anilist.co','www.anilist.co'].includes(url.hostname)) found.anilist_id = id;
        if (id && ['myanimelist.net','www.myanimelist.net'].includes(url.hostname)) found.mal_id = id;
      } catch { /* Unqualified/invalid links are not identity evidence. */ }
    } else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(detail?.websites); return found;
}
export function normalizeScheduleTrack(row: any, detail: any, fetchedAt: number): CalendarRecord | undefined {
  const episode = positive(row?.episodeNumber), route = String(row?.route || ''), track = ({ raw:'original', sub:'sub', dub:'dub' } as const)[row?.airType as string];
  if (!episode || episode > 100000 || !track || !/^[a-z0-9-]{1,240}$/.test(route)) return;
  const text = `${row.airingStatus || ''} ${row.delayedText || ''}`.toLowerCase();
  const status = /cancel/.test(text) ? 'cancelled' : /suspend/.test(text) ? 'suspended' : /postpon/.test(text) ? 'postponed'
    : /hiatus|\bbreak\b/.test(text) ? 'on break' : /delay/.test(text) ? 'delayed' : /reschedul/.test(text) ? 'rescheduled' : undefined;
  if (!status && !['aired','unaired'].includes(row.airingStatus)) return;
  const ids = scheduleProviderIds(detail), canonicalId = ids.anilist_id ? `anilist:${ids.anilist_id}` : ids.mal_id ? `mal:${ids.mal_id}` : `animeschedule:${route}`;
  const revised = status ? time(row.delayedUntil) || (status === 'rescheduled' ? time(row.episodeDate) : 0) : time(row.episodeDate);
  const previous = time(row.delayedFrom) || (status ? time(row.episodeDate) : 0);
  const imageRoute = String(row.imageVersionRoute || '');
  const image = /^anime\/[a-z0-9/_.-]{1,490}$/i.test(imageRoute) && !imageRoute.includes('..') ? `https://img.animeschedule.net/production/assets/public/img/${imageRoute}` : undefined;
  return { ...ids, canonicalId, title: String(row.english || row.romaji || row.title || 'Anime'), image,
    airingEpisode: episode, airingAt: revised / 1000, previousAiringAt: previous, releaseTrack: track,
    scheduleStatus: status || 'scheduled', scheduleReason: String(row.delayedText || ''), scheduleFetchedAt: fetchedAt,
    scheduleProvider:'animeschedule', scheduleId:`${canonicalId}:episode-${episode}:${track}`, sourceRoute: route };
}
/** Missing pages and fresh AniList originals cannot resolve explicit track delays. */
export function reconcileCalendarRecords(previous: CalendarRecord[], incoming: CalendarRecord[], now = Date.now()) {
  const rows:CalendarRecord[] = [];
  for (const row of [...previous.filter(row => row?.scheduleId && row.scheduleFetchedAt >= now - 60 * 86400_000),...incoming]) {
    const oldIndex = rows.findIndex(old => !(old.anilist_id&&row.anilist_id&&old.anilist_id!==row.anilist_id)&&!(old.mal_id&&row.mal_id&&old.mal_id!==row.mal_id)&&old.airingEpisode === row.airingEpisode && old.releaseTrack === row.releaseTrack
      && (old.canonicalId === row.canonicalId || old.sourceRoute && old.sourceRoute === row.sourceRoute
        || old.mal_id && row.mal_id === old.mal_id && !(row.anilist_id && old.anilist_id && row.anilist_id !== old.anilist_id)));
    const old = rows[oldIndex];
    if (old && (old.scheduleFetchedAt > row.scheduleFetchedAt || old.scheduleProvider === 'animeschedule' && row.scheduleProvider === 'anilist')) continue;
    const next = { ...old, ...row, image: row.image || old?.image };
    next.anilist_id=row.anilist_id||old?.anilist_id;next.mal_id=row.mal_id||old?.mal_id;
    next.canonicalId=next.anilist_id?`anilist:${next.anilist_id}`:next.mal_id?`mal:${next.mal_id}`:row.canonicalId;
    next.scheduleId=`${next.canonicalId}:episode-${next.airingEpisode}:${next.releaseTrack}`;
    if (old && next.scheduleStatus === 'scheduled' && next.airingAt > 0
      && (old.airingAt && Math.abs(old.airingAt - next.airingAt) >= 60 || old.scheduleStatus !== 'scheduled')) {
      next.scheduleStatus = 'rescheduled'; next.previousAiringAt = old.airingAt * 1000 || old.previousAiringAt;
    }
    if (oldIndex >= 0) rows[oldIndex] = next; else rows.push(next);
  }
  return rows.sort((a,b) => b.scheduleFetchedAt-a.scheduleFetchedAt).slice(0,1500);
}
