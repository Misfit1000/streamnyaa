import { useEffect, useMemo, useState } from 'react';
import { desktopCanonicalAnimeId, readDesktopAvailabilityRecords, subscribeDesktopAvailability, type DesktopAvailabilityRecord } from './desktopAvailability';
import { getDownloadQueue, listenDownloadsChanged, type DesktopDownloadQueue } from './desktopDownloads';
import { isUpcomingAnime } from './desktopAnimeRoute';

const preferenceKey = 'streamnyaa.desktop.showUnavailableTitles.v1';
const preferenceEvent = 'streamnyaa:catalog-availability-preference';
function readPreference() { try { return localStorage.getItem(preferenceKey) === 'true'; } catch { return false; } }
export function localPlayableAnimeIds(queue?: DesktopDownloadQueue) {
  const ids = new Set<string>();
  queue?.items.filter(item => item.state === 'completed').forEach(item => Object.values(item.episodeLinks || {}).forEach(link => {
    const id = String(link.animeId);
    if (/^(anilist|mal):\d+$/.test(id)) ids.add(id);
    else if (/^\d+$/.test(id)) ids.add(`mal:${id}`); // Legacy offline links used MAL IDs.
  }));
  return ids;
}

export function catalogTitleVisible(anime: any, records: DesktopAvailabilityRecord[], showUnavailable: boolean, localIds = new Set<string>(), now = Date.now()) {
  if (showUnavailable || isUpcomingAnime(anime)) return true;
  const id = desktopCanonicalAnimeId(anime);
  const malId = Number(anime?.mal_id || anime?.malId);
  if (!id || localIds.has(id) || malId && localIds.has(`mal:${malId}`)) return true;
  // A missing episode, stale result, or incomplete search is never title-level evidence.
  return !records.some(record => record.animeId === id && record.scope === 'title' && record.status === 'unavailable'
    && record.complete && record.checkedAt <= now + 60_000 && record.expiresAt > now);
}

export function useDesktopCatalogAvailability() {
  const [records, setRecords] = useState(readDesktopAvailabilityRecords);
  const [showUnavailable, setShow] = useState(readPreference);
  const [localIds, setLocalIds] = useState(new Set<string>());
  const [clock, setClock] = useState(Date.now());
  useEffect(() => subscribeDesktopAvailability(() => setRecords(readDesktopAvailabilityRecords())), []);
  useEffect(() => {
    const refresh = () => setShow(readPreference());
    window.addEventListener(preferenceEvent, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(preferenceEvent, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    const refresh = () => void getDownloadQueue().then(queue => { if (!cancelled) setLocalIds(localPlayableAnimeIds(queue)); }).catch(() => undefined);
    refresh();
    void listenDownloadsChanged(refresh).then(unlisten => { if (cancelled) unlisten(); else stop = unlisten; });
    return () => { cancelled = true; stop?.(); };
  }, []);
  useEffect(() => {
    const next = Math.min(...records.filter(record => record.expiresAt > clock).map(record => record.expiresAt));
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.max(1, Math.min(next - Date.now(), 60_000)));
    return () => clearTimeout(timer);
  }, [records, clock]);
  return useMemo(() => ({
    records,
    showUnavailable,
    setShowUnavailable(value: boolean) {
      setShow(value);
      try { localStorage.setItem(preferenceKey, String(value)); window.dispatchEvent(new Event(preferenceEvent)); } catch { /* In-memory preference still works. */ }
    },
    visible: (anime: any) => catalogTitleVisible(anime, records, showUnavailable, localIds, clock),
  }), [records, showUnavailable, localIds, clock]);
}
