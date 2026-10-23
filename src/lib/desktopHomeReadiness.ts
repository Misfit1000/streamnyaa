import { useEffect, useMemo, useRef, useState } from 'react';
import { searchNyaa, type NyaaItem } from '../api/nyaa';
import { buildSourceIdentity, parseSourceEpisode, SOURCE_CLASSIFIER_VERSION, sourceIdentitySignature, validateDesktopSourceCandidates, type SourceIdentity } from './desktopSourceIdentity';
import { sourceAudioCompatible } from './desktopSourceSelection';
import { desktopAvailabilityKey, desktopCanonicalAnimeId, readDesktopAvailabilityRecords, recordDesktopAvailability, type DesktopAvailabilityRecord } from './desktopAvailability';
import { useDesktopCatalogAvailability } from './desktopCatalogAvailability';
import { sourceSearchPlan, type SourceSearchJob } from './desktopSourceDiscovery';
import { getDownloadQueue, getOfflineFiles, listenDownloadsChanged } from './desktopDownloads';
import { isUpcomingAnime } from './desktopAnimeRoute';
import type { DesktopAudioPreference, LocalPlaybackSource } from './desktop';

export function homeHistoryAnime(source: LocalPlaybackSource) {
  const id = String(source.animeId || '');
  return { mal_id: /^(?:mal:)?[1-9]\d*$/.test(id) ? Number(id.replace(/^mal:/, '')) : undefined,
    anilist_id: /^anilist:[1-9]\d*$/.test(id) ? Number(id.slice(8)) : undefined, title: source.animeTitle || source.title };
}

export function sourceAvailabilityEvidence(anime: any, source: NyaaItem, episode: number, checkedAt: number): DesktopAvailabilityRecord {
  const identity = buildSourceIdentity(anime);
  return { key: desktopAvailabilityKey(identity.animeId, episode), animeId: identity.animeId, episode, scope: 'episode', status: 'available',
    checkedAt, expiresAt: checkedAt + 20 * 60_000, complete: true, evidence: 'exact-source', sourceHash: source.infoHash,
    sourceTitle: source.title, playableEpisode: episode, classifierVersion: SOURCE_CLASSIFIER_VERSION,
    identitySignature: source.nativeIdentitySignature || sourceIdentitySignature(identity), sourceTier: 'exact',
    anilistId: Number(anime?.anilist_id) || undefined, malId: Number(anime?.mal_id) || undefined };
}
export function readySource(source: NyaaItem) {
  return source.nativeEvidence === 'exact' && source.rawSeeders > 0 && /^(?:[a-f0-9]{40}|[A-Z2-7]{32})$/i.test(source.infoHash)
    && !/\.(?:zip|rar|7z|iso)\b/i.test(source.title);
}
function sameAnime(anime: any, record: DesktopAvailabilityRecord) {
  const anilist = Number(anime?.anilist_id), mal = Number(anime?.mal_id);
  const primaryAnilist = record.animeId.startsWith('anilist:') ? Number(record.animeId.slice(8)) : 0;
  const primaryMal = record.animeId.startsWith('mal:') ? Number(record.animeId.slice(4)) : 0;
  if (anilist && (primaryAnilist && anilist !== primaryAnilist || record.anilistId && anilist !== record.anilistId)
    || mal && (primaryMal && mal !== primaryMal || record.malId && mal !== record.malId)) return false;
  return record.animeId === desktopCanonicalAnimeId(anime)
    || Boolean(anilist && record.anilistId === anilist) || Boolean(mal && record.malId === mal);
}
function currentSourceRecord(record: DesktopAvailabilityRecord, now: number) {
  return record.status === 'available' && record.scope === 'episode' && record.expiresAt > now && record.checkedAt <= now + 60_000
    && /^(?:[a-f0-9]{40}|[A-Z2-7]{32})$/i.test(record.sourceHash || '') && Boolean(record.sourceTitle)
    && Number.isInteger(record.playableEpisode) && record.playableEpisode! > 0;
}
export function homeReadyEpisodes(anime: any, records: DesktopAvailabilityRecord[], audio: 'sub' | 'dub' | 'any', now = Date.now(), identity: SourceIdentity = buildSourceIdentity(anime)) {
  if (isUpcomingAnime(anime)) return [];
  const signature = sourceIdentitySignature(identity);
  return [...new Set(records.filter(record => currentSourceRecord(record, now) && sameAnime(anime, record)
    && record.classifierVersion === SOURCE_CLASSIFIER_VERSION && record.identitySignature === signature
    && record.sourceTier === 'exact' && /^(?:[a-f0-9]{40}|[A-Z2-7]{32})$/i.test(record.sourceHash || '')
    && sourceAudioCompatible(record.sourceTitle || '', audio) && Number.isInteger(record.playableEpisode) && record.playableEpisode! > 0
  ).map(record => record.playableEpisode!))].sort((a, b) => a - b);
}
/** Reuse recent Watch evidence after locally validating it against Home's metadata.
 * Alias ordering, provider hydration and Watch's relation metadata can differ. Never
 * relax the installment check or turn a cache read into a new retrieval timestamp. */
export async function revalidateHomeSourceEvidence(anime: any, records: DesktopAvailabilityRecord[], signal?: AbortSignal) {
  if (isUpcomingAnime(anime) || signal?.aborted) return;
  const identity = buildSourceIdentity(anime), signature = sourceIdentitySignature(identity), now = Date.now();
  const candidates = records.filter(record => currentSourceRecord(record, now) && sameAnime(anime, record)
    && (record.identitySignature !== signature || record.classifierVersion !== SOURCE_CLASSIFIER_VERSION));
  if (!candidates.length) return;
  const validated = await validateDesktopSourceCandidates(candidates.map(record => ({ title: record.sourceTitle! })), identity, null);
  if (signal?.aborted) return;
  candidates.forEach((record, index) => {
    const episode = identity.format === 'MOVIE' ? 1 : parseSourceEpisode(record.sourceTitle!);
    if (validated[index].nativeEvidence !== 'exact' || episode !== record.playableEpisode) return;
    recordDesktopAvailability({ ...record, key: desktopAvailabilityKey(identity.animeId, episode), animeId: identity.animeId,
      identitySignature: signature, classifierVersion: SOURCE_CLASSIFIER_VERSION, sourceTier: 'exact',
      anilistId: Number(anime?.anilist_id) || record.anilistId, malId: Number(anime?.mal_id) || record.malId });
  });
}
export function chooseReadyEpisode(episodes: number[], preferred: number) { return episodes.includes(preferred) ? preferred : episodes[0]; }
export function requiredHomeEpisode(anime: any): number | undefined {
  const value = Number(anime?.homeRequiredEpisode);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}
/** A title can occur in several rails with different amounts of metadata.
 * Use one canonical entry within Home so a sparse episode/history card cannot
 * invalidate the proof found for the richer seasonal card of that same title. */
export function mergeHomeReadinessCandidates(candidates: any[]) {
  const metadata = new Map<string, any>();
  for (const anime of candidates) {
    const id = desktopCanonicalAnimeId(anime);
    if (!id || isUpcomingAnime(anime)) continue;
    const previous = metadata.get(id), { homeRequiredEpisode: _required, ...fields } = anime;
    const defined = Object.fromEntries(Object.entries(fields).filter(([, value]) => value != null && value !== ''));
    metadata.set(id, { ...previous, ...defined,
      title_synonyms: [...new Set([...buildSourceIdentity(previous).aliases, ...buildSourceIdentity(anime).aliases])],
      relations: [...(previous?.relations || []), ...(anime?.relations || [])] });
  }
  const unique = [...new Map(candidates.filter(anime => metadata.has(desktopCanonicalAnimeId(anime)) && !isUpcomingAnime(anime))
    .map(anime => [`${desktopCanonicalAnimeId(anime)}:${requiredHomeEpisode(anime) || 'any'}`,
      { ...metadata.get(desktopCanonicalAnimeId(anime)), homeRequiredEpisode: requiredHomeEpisode(anime) }])).values()];
  return { metadata, unique };
}

type Cursor = { jobs: SourceSearchJob[]; retryAt: number; doneAt: number };
const cursors = new Map<string, Cursor>();
export const HOME_SOURCE_REQUEST_LIMIT = 16;
export const HOME_SOURCE_PASS_MS = 30_000;
// One worker for all visible rails; cursors survive route remounts without owning transfers.
let worker: AbortController | undefined;
let rotation = 0;

export function useDesktopHomeReadiness(candidates: any[], preference: DesktopAudioPreference) {
  const catalog = useDesktopCatalogAvailability();
  const [offline, setOffline] = useState<Map<string, number[]>>(new Map());
  const [checking, setChecking] = useState(false);
  const audio = preference === 'dual-preferred' ? 'any' : preference === 'dub-only' ? 'dub' : 'sub';
  const { metadata, unique } = useMemo(() => mergeHomeReadinessCandidates(candidates), [candidates]);
  const signature = unique.map(anime => `${sourceIdentitySignature(buildSourceIdentity(anime))}:${requiredHomeEpisode(anime) || 'any'}`).join('|');
  const currentCandidates = useRef(unique);
  currentCandidates.current = unique;
  const wakeWorker = useRef<() => void>(() => {});
  useEffect(() => {
    let disposed = false, revision = 0; let stop: (() => void) | undefined;
    const refresh = async () => {
      const run = ++revision, next = new Map<string, number[]>();
      try {
        const queue = await getDownloadQueue();
        for (const item of queue.items.filter(item => item.state === 'completed')) {
          const files = new Set(await getOfflineFiles(item.id).catch(() => []));
          for (const [file, link] of Object.entries(item.episodeLinks || {})) {
            if (!files.has(file)) continue;
            const id = /^(anilist|mal):\d+$/.test(link.animeId) ? link.animeId : `mal:${link.animeId}`;
            next.set(id, [...(next.get(id) || []), link.episode]);
          }
        }
        if (!disposed && revision === run) setOffline(next);
      } catch { if (!disposed && revision === run) setOffline(new Map()); }
    };
    void refresh();
    void listenDownloadsChanged(() => void refresh()).then(value => { if (disposed) value(); else stop = value; });
    window.addEventListener('focus', refresh);
    return () => { disposed = true; stop?.(); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    let disposed = false, running = false, nextPassAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined, active: AbortController | undefined;
    const schedule = (delay: number) => { clearTimeout(timer); if (!disposed) timer = setTimeout(() => void run(), delay); };
    const run = async () => {
      if (disposed || running) return;
      if (Date.now() < nextPassAt) { schedule(nextPassAt - Date.now()); return; }
      running = true;
      const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
      const playbackBusy = async () => invoke ? invoke<boolean>('get_desktop_playback_busy').catch(() => true) : false;
      if (document.hidden || await playbackBusy()) { running = false; schedule(60_000); return; }
      if (disposed) { running = false; return; }
      worker?.abort(); const controller = new AbortController(); worker = active = controller;
      setChecking(true); const started = Date.now(); let requests = 0;
      const revalidated = new Set<string>();
      try {
        while (Date.now() - started < HOME_SOURCE_PASS_MS && !controller.signal.aborted) {
          // New shelf data joins the same pass. A layout/observer update must not
          // abort a healthy request and penalize it with a provider retry delay.
          for (const anime of currentCandidates.current) {
            const identityKey = sourceIdentitySignature(buildSourceIdentity(anime));
            if (revalidated.has(identityKey)) continue;
            revalidated.add(identityKey);
            await revalidateHomeSourceEvidence(anime, readDesktopAvailabilityRecords(), controller.signal).catch(() => undefined);
            if (controller.signal.aborted) break;
          }
          if (controller.signal.aborted || Date.now() - started >= HOME_SOURCE_PASS_MS || requests >= HOME_SOURCE_REQUEST_LIMIT || await playbackBusy()) break;
          const candidates = currentCandidates.current;
          let selected: { anime: any; identity: ReturnType<typeof buildSourceIdentity>; required?: number; cursor: Cursor } | undefined;
          for (let visited = 0; visited < candidates.length; visited++) {
            const anime = candidates[rotation++ % candidates.length], required = requiredHomeEpisode(anime);
            const episodes = homeReadyEpisodes(anime, readDesktopAvailabilityRecords(), audio);
            if (required ? episodes.includes(required) : episodes.length) continue;
            const identity = buildSourceIdentity(anime), key = `${sourceIdentitySignature(identity)}:${required || 'any'}`;
            let cursor = cursors.get(key);
            if (!cursor || cursor.doneAt && Date.now() - cursor.doneAt >= 15 * 60_000) {
              cursor = { jobs: sourceSearchPlan(identity, required), retryAt: 0, doneAt: 0 };
              cursors.set(key, cursor);
              if (cursors.size > 512) cursors.delete(cursors.keys().next().value!);
            }
            if (cursor.retryAt > Date.now() || !cursor.jobs.length) continue;
            selected = { anime, identity, required, cursor }; break;
          }
          if (!selected) break;
          const { anime, identity, required, cursor } = selected;
          const job = cursor.jobs.shift()!; requests++;
          try {
            const raw = await searchNyaa(job.query, job.category, '0', String(job.page), { signal: controller.signal, priority: 'background',
              deadlineMs: Math.max(1, Math.min(8000, HOME_SOURCE_PASS_MS - (Date.now() - started))), deep: false, pages: 1, wide: false, intent: job.scope==='episode'?{ scope:'episode',episode:required||job.episode }: {scope:'title'}, maxAgeMs: 300_000 });
            if (raw.stale) { cursor.jobs.unshift(job); cursor.retryAt = raw.retryAt || Date.now() + 60_000; continue; }
            const validated = await validateDesktopSourceCandidates(raw, identity, required || null);
            if (controller.signal.aborted) { cursor.jobs.unshift(job); break; }
            const safe = validated.filter(source => readySource(source) && sourceAudioCompatible(source.title, audio))
              .map(source => ({ source, episode: identity.format === 'MOVIE' ? 1 : parseSourceEpisode(source.title) })).filter(value => value.episode && (!required || value.episode === required));
            safe.forEach(({ source, episode }) => recordDesktopAvailability(sourceAvailabilityEvidence(anime, source, episode!, raw.fetchedAt || Date.now())));
            if (raw.complete === false) { cursor.jobs.unshift(job); cursor.retryAt = raw.retryAt || Date.now() + 60_000; }
            else if (!safe.length) {
              if (!raw.length) cursor.jobs = cursor.jobs.filter(value => value.query !== job.query || value.category !== job.category || value.page <= job.page);
              if (!cursor.jobs.length) cursor.doneAt = Date.now();
            }
          } catch (error) {
            cursor.jobs.unshift(job);
            if (controller.signal.aborted) break;
            const retryAt = (error as { retryAt?: number })?.retryAt;
            cursor.retryAt = Math.max(Date.now() + 60_000, retryAt || 0);
          }
        }
      } finally {
        if (worker === controller) worker = undefined;
        if (active === controller) active = undefined;
        running = false;
        if (!disposed) { setChecking(false); nextPassAt = requests ? Date.now() + 60_000 : nextPassAt; schedule(60_000); }
      }
    };
    const wake = () => { if (!running) schedule(Math.max(0, nextPassAt - Date.now())); };
    wakeWorker.current = wake;
    void run();
    const foreground = () => { active?.abort(); };
    window.addEventListener('streamnyaa:foreground-work', foreground);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => { disposed = true; clearTimeout(timer); active?.abort(); if (wakeWorker.current === wake) wakeWorker.current = () => {}; window.removeEventListener('streamnyaa:foreground-work', foreground); document.removeEventListener('visibilitychange', wake); window.removeEventListener('focus', wake); };
  }, [audio]);
  useEffect(() => { wakeWorker.current(); }, [signature]);
  const episodesFor = (anime: any) => isUpcomingAnime(anime) ? [] : [...new Set([...homeReadyEpisodes(metadata.get(desktopCanonicalAnimeId(anime)) || anime, catalog.records, audio),
    ...(offline.get(desktopCanonicalAnimeId(anime)) || []), ...(anime.mal_id ? offline.get(`mal:${anime.mal_id}`) || [] : [])])].sort((a, b) => a - b);
  const pendingTitles = new Set(unique.filter(anime => {
    const episodes = episodesFor(anime), required = requiredHomeEpisode(anime);
    return required ? !episodes.includes(required) : !episodes.length;
  }).map(desktopCanonicalAnimeId)).size;
  return { ...catalog, checking, pendingTitles, episodesFor, visible: (anime: any) => catalog.showUnavailable || episodesFor(anime).length > 0 };
}
