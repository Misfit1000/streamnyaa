import DesktopBookmarkButton from './DesktopBookmarkButton';
import { animeIdentity } from '../lib/animeIdentity';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchJikanPath } from '../api/jikan';
import { desktopDataError } from '../lib/desktopData';
import { jikanAdultTitle } from '../api/desktopExplore';
import { desktopWatchOrBrowsePath } from '../lib/desktopAnimeRoute';
import { primeDesktopWatchSnapshot } from '../lib/desktopWatchSnapshot';
import { readCachedExploreTitles } from '../lib/desktopExploreCache';
import { readCachedWatchTitles } from '../lib/desktopWatchSnapshot';
import { useStore } from '../store/useStore';

export default function DesktopScheduleFallback({ favoritesOnly, selectedWeekday, search = '', matchesTracked, isAdmin = false }: { isAdmin?: boolean; favoritesOnly: boolean; selectedWeekday?: string; search?: string; matchesTracked?: (anime:any) => boolean }) {
  const [page, setPage] = useState(1);
  const source = useRef('/schedules');
  const [chosenWeekday, setWeekday] = useState('All');
  const weekday = selectedWeekday || chosenWeekday;
  useEffect(() => { setPage(1); source.current = '/schedules'; }, [weekday]);
  const store = useStore();
  const { nsfwMode } = store;
  const isInMyList = (id: string | number) => store.isInMyList(id) || !!store.isLiked?.(id);
  const query = useQuery({
    queryKey: ['desktop-broadcast-reference', weekday, page, 2],
    queryFn: async ({ signal }) => {
      let lastError: unknown;
      for (const endpoint of (page === 1 ? [...(weekday === 'All' ? [] : [`/schedules?filter=${weekday.slice(0, -1).toLowerCase()}`]), '/schedules', '/seasons/now'] : [source.current])) {
        try {
          const response = await fetchJikanPath(page === 1 ? endpoint : `${endpoint}${endpoint.includes('?') ? '&' : '?'}page=${page}`, 900, { signal });
          if (!response.ok) throw new Error('Broadcast reference is temporarily unavailable.');
          const result = await response.json();
          if (!Array.isArray(result.data) || typeof result.pagination?.has_next_page !== 'boolean') throw new Error('Incomplete broadcast reference.');
          source.current = endpoint;
          return { ...result, endpoint, seasonal: endpoint === '/seasons/now' } as { data: any[]; endpoint: string; seasonal: boolean; cached?: boolean; pagination: { has_next_page: boolean } };
        } catch (error) {
          lastError = error;
          if (signal.aborted || desktopDataError('jikan', error).code === 'cancelled') throw error;
          if (['access-denied', 'rate-limited'].includes(desktopDataError('jikan', error).code)) break;
        }
      }
      const stored = [...useStore.getState().myList, ...(useStore.getState().likedAnimes || []), ...readCachedWatchTitles(), ...readCachedExploreTitles()]
        .filter(item => item?.broadcast?.day && item?.broadcast?.time);
      if (page === 1 && stored.length) return { data: stored, endpoint: 'local', seasonal: false, cached: true, pagination: { has_next_page: false } };
      throw lastError;
    },
    retry: false, staleTime: 300_000,
    refetchInterval: query => query.state.error ? 30_000 : 300_000,
  });
  const items = query.data?.data.filter((item, index, all) => all.findIndex(other => (other.anilist_id ? `a:${other.anilist_id}` : `m:${other.mal_id}`) === (item.anilist_id ? `a:${item.anilist_id}` : `m:${item.mal_id}`)) === index).filter(item => (nsfwMode || !jikanAdultTitle(item)) && (!favoritesOnly || isInMyList(animeIdentity(item))) && (!matchesTracked || matchesTracked(item)) && String(item.title_english || item.title || '').toLowerCase().includes(search.trim().toLowerCase()) && (weekday === 'All' || item.broadcast?.day === weekday)) || [];
  items.sort((a, b) => String(a.broadcast?.timezone || '').localeCompare(String(b.broadcast?.timezone || '')) || String(a.broadcast?.time || '99:99').localeCompare(String(b.broadcast?.time || '99:99')));
  return <section aria-label="Broadcast reference" className="broadcast-reference">
    <h2 className="text-lg font-semibold">Regular broadcast slots{isAdmin ? " · MyAnimeList" : ""}{weekday !== 'All' ? ` · ${weekday}` : ''}</h2>
    <p className="mt-2 text-sm text-white/60">Confirmed episode times are unavailable. Use the day tabs to browse regular broadcast slots below. These are provider-local recurring slots, not confirmed episode releases or delay updates; episode reminders require verified times.</p>
    {!selectedWeekday && <label className="mt-3 flex items-center gap-2 text-sm">Broadcast weekday
      <select aria-label="Broadcast weekday" value={weekday} onChange={event => setWeekday(event.target.value)} className="rounded bg-[#18181c] p-2">
        {['All', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'].map(day => <option key={day}>{day}</option>)}
      </select>
    </label>}
    {query.data?.cached && <p className="mt-2 text-sm text-amber-200">Showing saved broadcast references from this device. These slots have not been refreshed and may have changed.</p>}
    {query.data?.seasonal && <p className="mt-2 text-sm text-amber-200">Using current-season broadcast slots. Exact episode times are unavailable.</p>}
    {query.isLoading && <p role="status" className="mt-3">Loading broadcast reference…</p>}
    {query.isError && <p role="alert" className="mt-3 text-amber-200">{isAdmin ? query.error.message : "Broadcast times could not update. Please try again shortly."} <button onClick={() => void query.refetch()} className="underline">Retry</button></p>}
    <ul className="broadcast-agenda-list mt-5">{items.map(item => <li key={`${item.anilist_id ? 'a' : 'm'}:${item.anilist_id || item.mal_id}`} className="broadcast-ticket">
      <div className="broadcast-time"><strong>{item.broadcast?.time || 'TBA'}</strong><span>{item.broadcast?.timezone || 'Timezone unknown'}</span></div>
      <Link className="broadcast-title" onClick={() => primeDesktopWatchSnapshot(desktopWatchOrBrowsePath(item), item)} to={desktopWatchOrBrowsePath(item)}>
        <img src={item.images?.webp?.image_url || item.images?.jpg?.image_url} alt="" loading="lazy" /><span><small>RECURRING SLOT · {item.type || 'ANIME'}</small><strong>{item.title_english || item.title}</strong><span>{item.broadcast?.day || 'Day unknown'} · Episode time unconfirmed</span></span><span aria-hidden="true" style={{flex: '0 0 auto'}}>↗</span>
      </Link><DesktopBookmarkButton anime={item} />
    </li>)}</ul>
    {query.data && !items.length && <p className="mt-3 text-sm text-white/60">No matching titles on this reference page.</p>}
    <div className="mt-4 flex items-center gap-3"><button disabled={page === 1 || query.isFetching} onClick={() => setPage(value => value - 1)} className="sn-secondary-action px-3 py-2 disabled:opacity-40">Previous</button><span>Page {page}</span><button disabled={!query.data?.pagination.has_next_page || query.isFetching} onClick={() => { source.current = query.data?.endpoint || '/schedules'; setPage(value => value + 1); }} className="sn-secondary-action px-3 py-2 disabled:opacity-40">Next</button></div>
  </section>;
}
