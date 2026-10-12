import { useEffect, useMemo, useState } from 'react';
import { searchNyaa, type NyaaItem } from '../api/nyaa';
import { buildSourceIdentity, parseSourceEpisode, SOURCE_CLASSIFIER_VERSION, sourceIdentitySignature, validateDesktopSourceCandidates } from './desktopSourceIdentity';
import { sourceAudioCompatible } from './desktopSourceSelection';
import { desktopAvailabilityKey, desktopCanonicalAnimeId, readDesktopAvailabilityRecords, recordDesktopAvailability, type DesktopAvailabilityRecord } from './desktopAvailability';
import { useDesktopCatalogAvailability } from './desktopCatalogAvailability';
import { sourceSearchPlan, type SourceSearchJob } from './desktopSourceDiscovery';
import { getDownloadQueue, getOfflineFiles, listenDownloadsChanged } from './desktopDownloads';
import { isUpcomingAnime } from './desktopAnimeRoute';
import type { DesktopAudioPreference } from './desktop';

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
export function homeReadyEpisodes(anime: any, records: DesktopAvailabilityRecord[], audio: 'sub' | 'dub' | 'any', now = Date.now()) {
  if (isUpcomingAnime(anime)) return [];
  const id = desktopCanonicalAnimeId(anime), signature = sourceIdentitySignature(buildSourceIdentity(anime));
  return [...new Set(records.filter(record => record.status === 'available' && record.expiresAt > now && record.checkedAt <= now + 60_000
    && (record.animeId === id || Boolean(anime.anilist_id && record.anilistId === Number(anime.anilist_id)) || Boolean(anime.mal_id && record.malId === Number(anime.mal_id)))
    && record.classifierVersion === SOURCE_CLASSIFIER_VERSION && record.identitySignature === signature
    && record.sourceTier === 'exact' && /^(?:[a-f0-9]{40}|[A-Z2-7]{32})$/i.test(record.sourceHash || '')
    && sourceAudioCompatible(record.sourceTitle || '', audio) && Number.isInteger(record.playableEpisode) && record.playableEpisode! > 0
  ).map(record => record.playableEpisode!))].sort((a, b) => a - b);
}
export function chooseReadyEpisode(episodes: number[], preferred: number) { return episodes.includes(preferred) ? preferred : episodes[0]; }
export function requiredHomeEpisode(anime: any): number | undefined {
  const value = Number(anime?.homeRequiredEpisode);
  return Number.isInteger(value) && value > 0 ? value : undefined;
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
  const unique = useMemo(() => [...new Map(candidates.filter(anime => desktopCanonicalAnimeId(anime) && !isUpcomingAnime(anime))
    .map(anime => [`${desktopCanonicalAnimeId(anime)}:${requiredHomeEpisode(anime) || 'any'}`, anime])).values()], [candidates]);
  const signature = unique.map(anime => `${sourceIdentitySignature(buildSourceIdentity(anime))}:${requiredHomeEpisode(anime) || 'any'}`).join('|');
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
    let disposed = false, timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      if (disposed) return;
      const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
      const playbackBusy = async () => invoke ? invoke<boolean>('get_desktop_playback_busy').catch(() => true) : false;
      if (document.hidden || await playbackBusy()) { timer = setTimeout(run, 60_000); return; }
      worker?.abort(); const controller = new AbortController(); worker = controller;
      setChecking(true); const started = Date.now(); let requests = 0;
      const pending = unique.filter(anime => {
        const episodes = homeReadyEpisodes(anime, readDesktopAvailabilityRecords(), audio), required = requiredHomeEpisode(anime);
        return required ? !episodes.includes(required) : !episodes.length;
      });
      if (pending.length) pending.push(...pending.splice(0, rotation % pending.length));
      try {
        while (pending.length && requests < HOME_SOURCE_REQUEST_LIMIT && Date.now() - started < HOME_SOURCE_PASS_MS) {
          if (controller.signal.aborted || await playbackBusy()) break;
          const anime = pending.shift()!, identity = buildSourceIdentity(anime), required = requiredHomeEpisode(anime), key = `${sourceIdentitySignature(identity)}:${required || 'any'}`;
          let cursor = cursors.get(key);
          if (!cursor || cursor.doneAt && Date.now() - cursor.doneAt >= 15 * 60_000) {
            cursor = { jobs: sourceSearchPlan(identity, required), retryAt: 0, doneAt: 0 }; cursors.set(key, cursor);
          }
          if (cursor.retryAt > Date.now() || !cursor.jobs.length) continue;
          const job = cursor.jobs.shift()!; requests++;
          try {
            const raw = await searchNyaa(job.query, job.category, '0', String(job.page), { signal: controller.signal, priority: 'background',
              deadlineMs: Math.max(1, Math.min(8000, HOME_SOURCE_PASS_MS - (Date.now() - started))), deep: false, pages: 1, wide: false, intent: { scope: required ? 'episode' : 'title', ...(required ? { episode: required } : {}) }, maxAgeMs: 300_000 });
            if (raw.stale || raw.complete === false) { cursor.jobs.unshift(job); cursor.retryAt = raw.retryAt || Date.now() + 60_000; continue; }
            const validated = await validateDesktopSourceCandidates(raw, identity, required || null);
            if (controller.signal.aborted) { cursor.jobs.unshift(job); break; }
            const safe = validated.filter(source => readySource(source) && sourceAudioCompatible(source.title, audio))
              .map(source => ({ source, episode: identity.format === 'MOVIE' ? 1 : parseSourceEpisode(source.title) })).filter(value => value.episode && (!required || value.episode === required));
            safe.forEach(({ source, episode }) => recordDesktopAvailability(sourceAvailabilityEvidence(anime, source, episode!, raw.fetchedAt || Date.now())));
            if (!safe.length) {
              if (!raw.length) cursor.jobs = cursor.jobs.filter(value => value.query !== job.query || value.category !== job.category || value.page <= job.page);
              if (cursor.jobs.length) pending.push(anime); else cursor.doneAt = Date.now();
            }
          } catch { cursor.jobs.unshift(job); cursor.retryAt = Date.now() + 60_000; if (controller.signal.aborted) break; }
        }
      } finally { rotation += requests; if (worker === controller) worker = undefined; if (!disposed) { setChecking(false); timer = setTimeout(run, 60_000); } }
    };
    void run();
    const foreground = () => { worker?.abort(); };
    window.addEventListener('streamnyaa:foreground-work', foreground);
    return () => { disposed = true; clearTimeout(timer); worker?.abort(); window.removeEventListener('streamnyaa:foreground-work', foreground); };
  }, [signature, audio]);
  const episodesFor = (anime: any) => isUpcomingAnime(anime) ? [] : [...new Set([...homeReadyEpisodes(anime, catalog.records, audio),
    ...(offline.get(desktopCanonicalAnimeId(anime)) || []), ...(anime.mal_id ? offline.get(`mal:${anime.mal_id}`) || [] : [])])].sort((a, b) => a - b);
  return { ...catalog, checking, episodesFor, visible: (anime: any) => catalog.showUnavailable || episodesFor(anime).length > 0 };
}
