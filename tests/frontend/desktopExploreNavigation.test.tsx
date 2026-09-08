import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/api/desktopExplore', () => ({ fetchExplorePage: vi.fn() }));
import { fetchExplorePage } from '../../src/api/desktopExplore';
import DesktopExplore from '../../src/pages/DesktopExplore';
import { updateLibraryOrganization } from '../../src/lib/desktopLibraryOrganization';
const clients: QueryClient[] = [];
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; });
function mount(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><DesktopExplore /></MemoryRouter></QueryClientProvider>);
}
function page(request: any, number: number) {
  return { page: number, service: request.service, fetchedAt: Date.now(), hasNextPage: true,
    data: Array.from({ length: 25 }, (_, i) => ({ mal_id: (number - 1) * 25 + i + 1,
      title: `${request.service} title ${(number - 1) * 25 + i + 1}`, score: 9, rankingScore: request.service === 'mal' ? 9 : 90,
      status: 'Finished Airing', episodes: 12, type: 'TV', genres: [{ name: 'Fantasy' }] })) };
}
describe('Explore ranked page navigation', () => {
  it('loads four underlying pages, then moves to 101–200 without mixing services', async () => {
    vi.mocked(fetchExplorePage).mockImplementation(async (request, number) => page(request, number));
    mount('/search?mode=ranking&ranking=mal');
    // Four serial mocked pages plus 100 jsdom cards; this is a behavior test,
    // not the real-network latency benchmark. Allow CPU contention in full CI.
    await screen.findByText('#100', {}, { timeout: 4000 });
    expect(fetchExplorePage).toHaveBeenCalledTimes(4);
    fireEvent.click(screen.getByRole('button', { name: 'Next 100' }));
    await screen.findByText('#200', {}, { timeout: 4000 });
    expect(screen.queryByText('#1')).toBeNull();
    expect(screen.getByText('#101')).toBeTruthy();
    expect(vi.mocked(fetchExplorePage).mock.calls.slice(4).map(call => call[1])).toEqual([5, 6, 7, 8]);
    fireEvent.click(screen.getByRole('button', { name: 'AniList', exact: true }));
    await screen.findByRole('heading', { name: 'anilist title 1', exact: true });
    expect(screen.queryByRole('heading', { name: 'mal title 101', exact: true })).toBeNull();
  });
  it('retains earlier cards when a later page fails and does not invent the next hundred', async () => {
    vi.mocked(fetchExplorePage).mockImplementation(async (request, number) => {
      if (number === 2) throw new Error('Offline');
      return page(request, number);
    });
    mount('/search?mode=ranking&ranking=mal&status=Completed');
    await screen.findByText('#25');
    await waitFor(() => expect(fetchExplorePage).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { name: 'mal title 1', exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next 100' }).hasAttribute('disabled')).toBe(true);
  });
  it('hides completed titles without renumbering the ranking', async () => {
    updateLibraryOrganization(['mal:1'], { status: 'Completed' });
    vi.mocked(fetchExplorePage).mockImplementation(async (request, number) => ({ ...page(request, number), hasNextPage: false }));
    mount('/search?mode=ranking&ranking=mal&hideCompleted=1');
    await screen.findByText('#2');
    expect(screen.queryByText('#1')).toBeNull();
    expect(screen.getByRole('heading', { name: 'mal title 2', exact: true })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Hide marked completed'));
    await screen.findByText('#1');
  });
});
