import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
vi.mock('../../src/api/jikan', () => ({ fetchJikanPath: vi.fn() }));
vi.mock('../../src/store/useStore', () => ({ useStore: Object.assign(() => ({ nsfwMode: false, myList: [], isInMyList: (id: string | number) => String(id) === '2' }), { getState: () => ({ myList: [] }) }) }));
import { fetchJikanPath } from '../../src/api/jikan';
import DesktopScheduleFallback from '../../src/components/DesktopScheduleFallback';
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function show(favoritesOnly = false, selectedWeekday?: string) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><DesktopScheduleFallback favoritesOnly={favoritesOnly} selectedWeekday={selectedWeekday} /></MemoryRouter></QueryClientProvider>);
}
describe('Calendar broadcast fallback', () => {
  it('uses the Calendar day selection and deduplicates broadcast records', async () => {
    vi.mocked(fetchJikanPath).mockResolvedValue(new Response(JSON.stringify({ data: [
      { mal_id: 2, title: 'Saturday show', broadcast: { day: 'Saturdays' } },
      { mal_id: 2, title: 'Saturday show', broadcast: { day: 'Saturdays' } },
      { mal_id: 3, title: 'Sunday show', broadcast: { day: 'Sundays' } },
    ], pagination: { has_next_page: false } })));
    show(false, 'Saturdays');
    expect(await screen.findByText('Saturday show')).toBeTruthy();
    expect(screen.queryByText('Sunday show')).toBeNull();
    expect(fetchJikanPath).toHaveBeenCalledWith('/schedules?filter=saturday', 900, expect.any(Object));
  });
  it('uses seasonal broadcast slots when the schedule endpoint fails', async () => {
    vi.mocked(fetchJikanPath).mockRejectedValueOnce(new Error('Schedule timeout'));
    vi.mocked(fetchJikanPath).mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ mal_id: 2, title: 'Seasonal series', broadcast: { day: 'Mondays', string: 'Mondays at 20:00' } }], pagination: { has_next_page: false } })));
    show();
    expect(await screen.findByText('Seasonal series')).toBeTruthy();
    expect(screen.getByText(/Using current-season/)).toBeTruthy();
    expect(fetchJikanPath).toHaveBeenLastCalledWith('/seasons/now', 900, expect.any(Object));
  });
  it('labels recurring slots and preserves the saved-title and content filters', async () => {
    vi.mocked(fetchJikanPath).mockResolvedValue(new Response(JSON.stringify({ data: [
      { mal_id: 1, title: 'Other series' },
      { mal_id: 2, title: 'Saved series', broadcast: { string: 'Thursdays at 23:00', timezone: 'Asia/Tokyo' } },
      { mal_id: 3, title: 'Excluded', rating: 'Rx - Hentai' },
    ], pagination: { has_next_page: false } })));
    show(true);
    expect(await screen.findByText('Saved series')).toBeTruthy();
    expect(screen.queryByText('Other series')).toBeNull();
    expect(screen.queryByText('Excluded')).toBeNull();
    expect(screen.getByText(/not confirmed episode releases/)).toBeTruthy();
    expect(screen.getByText(/Asia\/Tokyo/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /remind/i })).toBeNull();
    expect(fetchJikanPath).toHaveBeenCalledWith('/schedules', 900, expect.any(Object));
  });
  it('reports provider failure rather than a false empty day', async () => {
    vi.mocked(fetchJikanPath).mockRejectedValue(new Error('Broadcast provider timed out.'));
    show();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Broadcast provider timed out. Retry');
    expect(screen.queryByText('No matching titles on this reference page.')).toBeNull();
  });
});
