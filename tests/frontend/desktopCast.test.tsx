import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
vi.mock('../../src/api/jikan', () => ({ fetchAniList: vi.fn(), fetchJikanPath: vi.fn() }));
import { fetchAniList, fetchJikanPath } from '../../src/api/jikan';
import { fetchAnimeCast } from '../../src/api/animeCast';
import DesktopAnimeCast from '../../src/components/DesktopAnimeCast';
import { DesktopDataError } from '../../src/lib/desktopData';
const clients: QueryClient[] = [];
const response = (page = 1, more = false) => new Response(JSON.stringify({ data: { Media: { id: 1, idMal: 2, characters: {
  pageInfo: { hasNextPage: more }, edges: Array.from({ length: 12 }, (_, index) => ({ role: 'MAIN', node: { id: page * 100 + index, name: { full: `Character ${page * 100 + index}` }, image: {} }, voiceActors: [
    { id: 3, name: { full: 'Japanese Actor' }, languageV2: 'Japanese' }, { id: 4, name: { full: 'English Actor' }, languageV2: 'English' } ] })) } } } }), { headers: { 'X-StreamNyaa-Fetched-At': '1700000000000' } });
function mount() { const client = new QueryClient(); clients.push(client); return render(<QueryClientProvider client={client}><DesktopAnimeCast identity={{ anilistId: 1, malId: 2 }} /></QueryClientProvider>); }
beforeEach(() => vi.clearAllMocks());
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; });
describe('lazy Cast section', () => {
  it('loads only after expansion, reveals six at a time and filters language without refetching', async () => {
    vi.mocked(fetchAniList).mockResolvedValue(response()); mount();
    expect(fetchAniList).not.toHaveBeenCalled();
    const button = screen.getByRole('button', { name: /Cast & characters/ }); fireEvent.click(button);
    await screen.findByText('Character 100'); expect(screen.getAllByRole('article')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'English' })); expect(screen.getAllByText('English Actor')).toHaveLength(6);
    expect(screen.queryByText('Japanese Actor')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show more cast' })); expect(screen.getAllByRole('article')).toHaveLength(12);
    fireEvent.click(button); fireEvent.click(button); await screen.findByText('Character 100'); expect(fetchAniList).toHaveBeenCalledTimes(1);
  });
  it('keeps pagination on the selected provider and preserves earlier cast after failure', async () => {
    vi.mocked(fetchAniList).mockResolvedValueOnce(response(1, true)).mockRejectedValueOnce(new Error('offline')); mount();
    fireEvent.click(screen.getByRole('button', { name: /Cast & characters/ })); await screen.findByText('Character 100');
    fireEvent.click(screen.getByRole('button', { name: 'Show more cast' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show more cast' }));
    await waitFor(() => expect(fetchAniList).toHaveBeenCalledTimes(2));
    await screen.findByText(/Available cast remains visible/); expect(screen.getByText('Character 100')).toBeTruthy(); expect(fetchJikanPath).not.toHaveBeenCalled();
  });
  it('falls back only using verified MAL identity and honors cancellation', async () => {
    vi.mocked(fetchAniList).mockRejectedValue(new Error('offline'));
    vi.mocked(fetchJikanPath).mockResolvedValue(new Response(JSON.stringify({ data: [] })));
    expect(await fetchAnimeCast({ anilistId: 1, malId: 2 })).toMatchObject({ provider: 'jikan', data: [], hasNextPage: false });
    expect(fetchJikanPath).toHaveBeenCalledWith('/anime/2/characters', 86400, {});
    vi.mocked(fetchJikanPath).mockClear();
    await expect(fetchAnimeCast({ anilistId: 1 })).rejects.toThrow(); expect(fetchJikanPath).not.toHaveBeenCalled();
    const abort = new AbortController(); abort.abort(); await expect(fetchAnimeCast({ malId: 2 }, 1, { signal: abort.signal })).rejects.toThrow(/Cancelled/);
  });
  it('does not turn local admission waiting into fallback or accept a different installment', async () => {
    vi.mocked(fetchAniList).mockRejectedValue(new DesktopDataError({ code: 'queued', provider: 'anilist', retryable: true, message: 'Queued', origin: 'local-admission' }));
    await expect(fetchAnimeCast({ anilistId: 1, malId: 2 })).rejects.toThrow('Queued'); expect(fetchJikanPath).not.toHaveBeenCalled();
    vi.mocked(fetchAniList).mockResolvedValue(response());
    await expect(fetchAnimeCast({ anilistId: 99, malId: 2 })).rejects.toThrow(/Invalid cast identity/); expect(fetchJikanPath).not.toHaveBeenCalled();
  });
});
