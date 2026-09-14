import { fetchExplorePage, type ExploreRequest } from './desktopExplore';
import { desktopDataError } from '../lib/desktopData';
import { useStore } from '../store/useStore';

export async function withDesktopCatalogFallback(
  primary: () => Promise<any>, request: Partial<ExploreRequest> & { mode: string }, signal?: AbortSignal,
) {
  try { return await primary(); }
  catch (error) {
    if (signal?.aborted || desktopDataError('anilist', error).code === 'cancelled') throw error;
    const fallback = await fetchExplorePage({ query: '', genre: 'Any', format: 'Any', status: 'Any', sort: 'best',
      adult: useStore.getState().nsfwMode, ...request, service: 'mal', allowFallback: false }, 1, signal);
    return { ...fallback, provider: 'jikan', fallback: true };
  }
}
