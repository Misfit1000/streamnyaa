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
  persistenceError?: string; retryAt?: number; pendingIdentities?: number; initialSnapshot?: boolean;
  continuation?: { schedulePage: number; identityOffset: number; scheduleComplete: boolean; identitiesComplete: boolean } };
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
/** Conflicting mappings are coverage gaps, never evidence for merging titles. */
export function calendarIdentityCoverage(rows: CalendarRecord[]) {
  const aids=new Map<number,Set<number>>(),mids=new Map<number,Set<number>>(),routes=new Map<string,Set<string>>();
  for(const row of rows){
    if(row.anilist_id&&row.mal_id){
      const a=aids.get(row.anilist_id)||new Set<number>();a.add(row.mal_id);aids.set(row.anilist_id,a);
      const m=mids.get(row.mal_id)||new Set<number>();m.add(row.anilist_id);mids.set(row.mal_id,m);
    }
    if(row.sourceRoute&&(row.anilist_id||row.mal_id)){const ids=routes.get(row.sourceRoute)||new Set<string>();ids.add(row.canonicalId);routes.set(row.sourceRoute,ids);}
  }
  const pending=new Set<string>(),unresolved=new Set<CalendarRecord>();
  for(const row of rows){
    const conflictingAid=row.anilist_id&&(aids.get(row.anilist_id)?.size||0)>1;
    const conflictingMal=row.mal_id&&(mids.get(row.mal_id)?.size||0)>1;
    if(!row.anilist_id&&!row.mal_id||conflictingAid||conflictingMal||row.sourceRoute&&(routes.get(row.sourceRoute)?.size||0)>1){
      unresolved.add(row);pending.add(row.sourceRoute|| (conflictingMal?`mal:${row.mal_id}`:row.canonicalId));
    }
  }
  return {pendingCount:pending.size,unresolved};
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
/** Canonicalize the entire set first: hydration order cannot leave a legacy alias behind. */
export function reconcileCalendarRecords(previous: CalendarRecord[], incoming: CalendarRecord[], now = Date.now()) {
  const source = [...previous.filter(row => row?.scheduleId && row.scheduleFetchedAt >= now - 60 * 86400_000), ...incoming];
  const routes = new Map<string, { aids: Set<number>; mids: Set<number> }>();
  const malLinks = new Map<number, Set<number>>();
  const aidLinks = new Map<number, Set<number>>();
  for (const row of source) {
    if (row.sourceRoute) {
      const ids = routes.get(row.sourceRoute) || { aids: new Set<number>(), mids: new Set<number>() };
      if (row.anilist_id) ids.aids.add(row.anilist_id); if (row.mal_id) ids.mids.add(row.mal_id);
      routes.set(row.sourceRoute, ids);
    }
    if (row.anilist_id && row.mal_id) {
      const ids = malLinks.get(row.mal_id) || new Set<number>(); ids.add(row.anilist_id); malLinks.set(row.mal_id, ids);
      const mids = aidLinks.get(row.anilist_id) || new Set<number>(); mids.add(row.mal_id); aidLinks.set(row.anilist_id, mids);
    }
  }
  const rows = new Map<string, CalendarRecord>();
  for (const original of source) {
    const row = { ...original }, route = row.sourceRoute && routes.get(row.sourceRoute);
    if (route && route.aids.size <= 1 && route.mids.size <= 1) {
      row.anilist_id ||= [...route.aids][0]; row.mal_id ||= [...route.mids][0];
    }
    const equivalent = row.mal_id && malLinks.get(row.mal_id);
    if (!row.anilist_id && equivalent && equivalent.size === 1) row.anilist_id = [...equivalent][0];
    const malEquivalent = row.anilist_id && aidLinks.get(row.anilist_id);
    if (!row.mal_id && malEquivalent && malEquivalent.size === 1) row.mal_id = [...malEquivalent][0];
    row.canonicalId = row.anilist_id ? 'anilist:' + row.anilist_id : row.mal_id ? 'mal:' + row.mal_id : row.canonicalId;
    row.scheduleId = row.canonicalId + ':episode-' + row.airingEpisode + ':' + row.releaseTrack;
    // Conflicting explicit provider IDs remain separate even if one namespace agrees.
    const key = row.scheduleId + (malEquivalent && malEquivalent.size > 1 ? ':mal-' + (row.mal_id || 'unknown') : '');
    const old = rows.get(key);
    if (!old) { rows.set(key, row); continue; }
    const providerWins = old.scheduleProvider === 'animeschedule' && row.scheduleProvider === 'anilist';
    if (providerWins || old.scheduleProvider === row.scheduleProvider && old.scheduleFetchedAt > row.scheduleFetchedAt) {
      rows.set(key, { ...row, ...old, images: old.images || row.images, image: old.image || row.image }); continue;
    }
    const next: CalendarRecord = { ...old, ...row, image: row.image || old.image };
    if (row.scheduleProvider === 'animeschedule' && old.scheduleProvider === 'anilist') {
      next.title = old.title || row.title; next.images = old.images || row.images;
      next.score = old.score ?? row.score; next.type = old.type || row.type;
    }
    if (next.scheduleStatus === 'scheduled' && next.airingAt > 0
      && (old.airingAt && Math.abs(old.airingAt - next.airingAt) >= 60 || old.scheduleStatus !== 'scheduled')) {
      next.scheduleStatus = 'rescheduled'; next.previousAiringAt = old.airingAt * 1000 || old.previousAiringAt;
    }
    rows.set(key, next);
  }
  return [...rows.values()].sort((a,b) => b.scheduleFetchedAt-a.scheduleFetchedAt).slice(0,1500);
}
