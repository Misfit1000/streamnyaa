import { fetchCompleteSchedule } from '../api/jikan';
import { desktopScheduleCacheKey, readDesktopSchedule, writeDesktopSchedule } from './desktopScheduleCache';
import { useStore } from '../store/useStore';

export function desktopWeekRange(now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  return { start: Math.floor(start.getTime() / 1000) - 1, end: Math.floor(end.getTime() / 1000) };
}
export function desktopWeekQuery(priority: 'foreground' | 'background' = 'foreground') {
  const { start, end } = desktopWeekRange();
  const nsfw = useStore.getState().nsfwMode;
  const key = desktopScheduleCacheKey(start, end, nsfw);
  const saved = readDesktopSchedule(key);
  return {
    queryKey: ['desktop-schedule-week', start, end, nsfw] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const response = await fetchCompleteSchedule(start, end, 10, { signal, priority });
      if (response.complete && response.streamnyaa.status !== 'stale') writeDesktopSchedule(key, response);
      if (!response.complete && saved?.data?.data?.length) {
        const items = new Map(saved.data.data.map(item => [item.anilist_id + ':' + item.airingEpisode + ':' + item.airingAt, item]));
        response.data.forEach(item => items.set(item.anilist_id + ':' + item.airingEpisode + ':' + item.airingAt, item));
        return { ...response, data: [...items.values()] };
      }
      return response;
    },
    staleTime: 180_000, retry: false as const,
    initialData: saved?.data, initialDataUpdatedAt: saved?.savedAt,
  };
}
