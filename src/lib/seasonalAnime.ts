import { isDesktopApp } from './desktop';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAnimeSeason } from '../api/jikan';
import { withDesktopCatalogFallback } from '../api/desktopCatalogFallback';
import { animeIdentity } from './animeIdentity';
import { getCurrentAnimeSeason, type AnimeSeason } from './currentSeason';
import { readDesktopCatalog, writeDesktopCatalog } from './desktopCatalogCache';

export type CurrentAnimeSeasonInfo = {
  season: AnimeSeason;
  year: number;
  key: string;
  label: string;
};

type SeasonalAnimeQueryOptions = {
  limit?: number;
  queryKeyPrefix?: string;
  retry?: number;
  staleTime?: number;
};

function formatSeasonName(season: AnimeSeason) {
  return season.charAt(0) + season.slice(1).toLowerCase();
}

export function currentAnimeSeasonInfo(date = new Date()): CurrentAnimeSeasonInfo {
  const season = getCurrentAnimeSeason(date);

  return {
    ...season,
    key: `${season.season}-${season.year}`,
    label: `${formatSeasonName(season.season)} ${season.year}`,
  };
}

function msUntilNextLocalMidnight(date = new Date()) {
  const next = new Date(date);
  next.setHours(24, 0, 1, 0);
  return Math.max(60_000, next.getTime() - date.getTime());
}

function uniqueSeasonalAnime(items: any[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = animeIdentity(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function useCurrentAnimeSeasonInfo() {
  const [season, setSeason] = useState<CurrentAnimeSeasonInfo>(() => currentAnimeSeasonInfo());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let timeout: number | undefined;
    const refreshSeason = () => setSeason(currentAnimeSeasonInfo());
    const scheduleNextRefresh = () => {
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        refreshSeason();
        scheduleNextRefresh();
      }, msUntilNextLocalMidnight());
    };
    const refreshWhenVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        refreshSeason();
      }
    };

    scheduleNextRefresh();
    window.addEventListener('focus', refreshSeason);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', refreshWhenVisible);
    }

    return () => {
      if (timeout) window.clearTimeout(timeout);
      window.removeEventListener('focus', refreshSeason);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', refreshWhenVisible);
      }
    };
  }, []);

  return season;
}

export function useSeasonalAnimeQuery({
  limit = 18,
  queryKeyPrefix = 'desktop-seasonal',
  retry = 1,
  staleTime = 1000 * 60 * 10,
}: SeasonalAnimeQueryOptions = {}) {
  const currentSeason = useCurrentAnimeSeasonInfo();
  const cacheKey = `${queryKeyPrefix}:${currentSeason.key}:${limit}`;
  const savedCatalog = readDesktopCatalog(cacheKey);
  const query = useQuery({
    queryKey: [queryKeyPrefix, currentSeason.season, currentSeason.year, limit],
    queryFn: async ({ signal }) => {
      const primary = () => fetchAnimeSeason(currentSeason.season, currentSeason.year, 1, { signal, priority: 'background' });
      const response = await (isDesktopApp() ? withDesktopCatalogFallback(primary,
        { mode: 'seasonal', year: currentSeason.year, season: currentSeason.season }, signal) : primary());
      const normalized = {
        ...response,
        data: uniqueSeasonalAnime(response?.data || []).slice(0, limit),
      };
      writeDesktopCatalog(cacheKey, normalized);
      return normalized;
    },
    retry: isDesktopApp() ? false : retry,
    staleTime,
    refetchOnWindowFocus: false,
    refetchInterval: query => query.state.data?.fallback ? 300_000 : false,
    initialData: savedCatalog?.data,
    initialDataUpdatedAt: savedCatalog?.savedAt,
  });

  return {
    ...query,
    currentSeason,
  };
}
