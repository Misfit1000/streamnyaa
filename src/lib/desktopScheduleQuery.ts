import type { QueryClient } from '@tanstack/react-query';
import { fetchCompleteSchedule, type CompleteScheduleResult } from '../api/jikan';
import { desktopScheduleCacheKey, readDesktopSchedule, writeDesktopSchedule } from './desktopScheduleCache';
import { useStore } from '../store/useStore';
import { desktopOriginStaleTime } from './desktopOriginFreshness';
import { scheduleRevisionKey } from './scheduleRevisions';

export function desktopWeekRange(now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  return { start: Math.floor(start.getTime() / 1000) - 1, end: Math.floor(end.getTime() / 1000) };
}
function savedSchedule(entry: ReturnType<typeof readDesktopSchedule>): CompleteScheduleResult | undefined {
  if (!entry) return undefined;
  const value = entry.data as Partial<CompleteScheduleResult>;
  return { ...value, data: value.data || [], complete: value.complete === true,
    pagination: { has_next_page: value.pagination?.has_next_page !== false, last_visible_page: Number(value.pagination?.last_visible_page) || 0 },
    streamnyaa: { ...value.streamnyaa, status: value.streamnyaa?.status || 'stale', fetchedAt: value.streamnyaa?.fetchedAt || entry.savedAt } };
}

export function mergeDesktopWeekSchedule(response: CompleteScheduleResult, previous?: CompleteScheduleResult): CompleteScheduleResult {
  if (!previous?.data.length) return response;
  if (response.complete) {
    const incoming = new Set(response.data.map(scheduleRevisionKey));
    const retained = previous.data.filter(item => /delay|postpon|cancel|hiatus|break/i.test(String(item.scheduleStatus || '')) && !incoming.has(scheduleRevisionKey(item)));
    return retained.length ? { ...response, data: [...response.data, ...retained], streamnyaa: { ...response.streamnyaa, status: 'stale', fetchedAt: Math.min(response.streamnyaa.fetchedAt, previous.streamnyaa.fetchedAt) } } : response;
  }
  // A revised airing time replaces the same episode's older record. Keeping
  // both times would make one episode appear twice and revive old reminders.
  const identity = scheduleRevisionKey;
  const items = new Map(previous.data.map(item => [identity(item), item]));
  response.data.forEach(item => items.set(identity(item), item));
  return { ...response, data: [...items.values()], streamnyaa: { ...response.streamnyaa, status: 'stale',
    fetchedAt: Math.min(response.streamnyaa.fetchedAt, Number(previous.streamnyaa?.fetchedAt) || 0) } };
}

export function desktopWeekQuery(priority: 'foreground' | 'background' = 'foreground') {
  const { start, end } = desktopWeekRange();
  const nsfw = useStore.getState().nsfwMode;
  const key = desktopScheduleCacheKey(start, end, nsfw);
  const saved = savedSchedule(readDesktopSchedule(key));
  const queryKey = ['desktop-schedule-week', start, end, nsfw] as const;
  return {
    queryKey,
    queryFn: async ({ signal, client }: { signal: AbortSignal; client: QueryClient }) => {
      const previous = client.getQueryData<CompleteScheduleResult>(queryKey) || savedSchedule(readDesktopSchedule(key));
      const publish = (response: CompleteScheduleResult) => {
        const merged = mergeDesktopWeekSchedule(response, previous);
        writeDesktopSchedule(key, merged, merged.streamnyaa.fetchedAt);
        client.setQueryData(queryKey, merged, { updatedAt: merged.streamnyaa.fetchedAt });
      };
      const response = await fetchCompleteSchedule(start, end, priority === 'background' ? 1 : 10, { signal, priority },
        priority === 'foreground' ? value => publish({ ...value, ...(value.complete ? {} : { partialReason: 'foreground-loading' as const }) }) : undefined);
      const merged = mergeDesktopWeekSchedule({ ...response,
        ...(priority === 'background' && !response.complete ? { partialReason: 'background-budget' as const } : {}) }, previous);
      writeDesktopSchedule(key, merged, merged.streamnyaa.fetchedAt);
      return merged;
    },
    staleTime: (query: { state: { data?: CompleteScheduleResult; dataUpdatedAt?: number } }) => query.state.data?.complete === false || query.state.data?.streamnyaa?.status === 'stale' ? 0
      : desktopOriginStaleTime(15 * 60_000, query.state),
    retry: false as const, refetchInterval: false as const,
    initialData: saved, initialDataUpdatedAt: saved?.streamnyaa.fetchedAt,
  };
}
