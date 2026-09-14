import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AccountSyncProvider, useAccountSync } from '../../src/context/AccountSyncContext';
import { useStore } from '../../src/store/useStore';

const mock = vi.hoisted(() => ({ desktop: true, auth: {} as any, fetch: vi.fn(), write: vi.fn(), history: [] as any[] }));
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => mock.auth }));
vi.mock('../../src/lib/accountSync', async importOriginal => ({
  ...await importOriginal<any>(), fetchAccountSync: mock.fetch, replaceAccountSyncData: mock.write,
}));
vi.mock('../../src/lib/desktop', () => ({
  isDesktopApp: () => mock.desktop,
  loadDesktopWatchProgress: () => mock.history,
  replaceDesktopWatchProgress: (rows: any[]) => { mock.history = rows; },
  subscribeDesktopWatchProgress: () => () => {},
}));
const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { resolve, promise }; };
const empty = { library: [], watchHistory: [], profile: null };
const anime = (id: number) => ({ mal_id: id, title: `Anime ${id}` }) as any;
const row = (id: number) => ({ animeId: String(id), animeTitle: `Anime ${id}`, anime: anime(id), bookmarked: true, liked: false, updatedAt: '2020-01-01T00:00:00Z' });
let sync: ReturnType<typeof useAccountSync>;
function Probe() { sync = useAccountSync(); return null; }
const app = () => <AccountSyncProvider><Probe /></AccountSyncProvider>;
const login = (id: string) => { mock.auth = { loading: false, user: { id }, session: { user: { id }, access_token: id } }; };
beforeEach(() => {
  mock.desktop = true; localStorage.clear(); mock.history = []; mock.fetch.mockReset(); mock.write.mockReset().mockResolvedValue({ ok: true });
  useStore.setState({ myList: [], likes: [], likedAnimes: [] }); login('a');
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('preserves an edit made while initial synchronization is fetching', async () => {
  const work = deferred(); mock.fetch.mockReturnValue(work.promise);
  render(app());
  act(() => useStore.getState().addToMyList(anime(2)));
  await act(async () => work.resolve({ ...empty, library: [row(1)] }));
  await waitFor(() => expect(mock.write).toHaveBeenCalled());
  expect(useStore.getState().myList.map(a => a.mal_id)).toEqual(expect.arrayContaining([1, 2]));
  expect(mock.write.mock.calls[0][1].library.map((a: any) => a.animeId)).toContain('2');
});

it('rejects a late response after logout and preserves the outgoing journal', async () => {
  useStore.getState().addToMyList(anime(1));
  const work = deferred(); mock.fetch.mockReturnValue(work.promise);
  const view = render(app());
  mock.auth = { loading: false, session: null, user: null };
  view.rerender(app());
  await act(async () => work.resolve({ ...empty, library: [row(99)] }));
  expect(mock.write).not.toHaveBeenCalled();
  expect(useStore.getState().myList).toEqual([]);
  expect(localStorage.getItem('streamnyaa.desktop.accountSync.v2.a')).toContain('Anime 1');
});

it('never transfers the previous account projection into a different account', async () => {
  useStore.getState().addToMyList(anime(1));
  const old = deferred(); mock.fetch.mockReturnValueOnce(old.promise).mockResolvedValue(empty);
  const view = render(app()); login('b'); view.rerender(app());
  await waitFor(() => expect(mock.write).toHaveBeenCalledTimes(1));
  expect(mock.write.mock.calls[0][0].user.id).toBe('b');
  expect(mock.write.mock.calls[0][1].library).toEqual([]);
  await act(async () => old.resolve({ ...empty, library: [row(99)] }));
  expect(mock.write).toHaveBeenCalledTimes(1);
  expect(useStore.getState().myList).toEqual([]);
});

it('serializes repeated sync requests rather than overlapping fetches', async () => {
  const work = deferred(); mock.fetch.mockReturnValueOnce(work.promise).mockResolvedValue(empty);
  render(app());
  act(() => { void sync.syncNow(); void sync.syncNow(); });
  expect(mock.fetch).toHaveBeenCalledTimes(1);
  await act(async () => work.resolve(empty));
  await waitFor(() => expect(mock.fetch).toHaveBeenCalledTimes(2));
  expect(mock.write).toHaveBeenCalledTimes(2);
});

it('does not replace the saved account projection while authentication restores', () => {
  localStorage.setItem('streamnyaa.desktop.accountProjectionOwner.v1', 'a');
  useStore.getState().addToMyList(anime(1));
  mock.auth = { loading: true, session: null, user: null };
  render(app());
  expect(useStore.getState().myList).toHaveLength(1);
  expect(mock.fetch).not.toHaveBeenCalled();
});

it('does not reuse an old flight after logging out and back into the same account', async () => {
  const old = deferred(); mock.fetch.mockReturnValueOnce(old.promise).mockResolvedValue(empty);
  const view = render(app());
  mock.auth = { loading: false, session: null, user: null }; view.rerender(app());
  login('a'); view.rerender(app());
  await waitFor(() => expect(mock.fetch).toHaveBeenCalledTimes(2));
  await act(async () => old.resolve({ ...empty, library: [row(99)] }));
  expect(useStore.getState().myList).toEqual([]);
});

it('keeps the web journal and shared hook on the existing web account projection', async () => {
  mock.desktop = false;
  useStore.getState().addToMyList(anime(7));
  mock.fetch.mockResolvedValue(empty);
  render(app());
  await waitFor(() => expect(mock.write).toHaveBeenCalled());
  expect(localStorage.getItem('streamnyaa.accountSync.v2.a')).toContain('Anime 7');
  expect(localStorage.getItem('streamnyaa.desktop.accountSync.v2.a')).toBeNull();
  expect(localStorage.getItem('streamnyaa.desktop.accountProjectionOwner.v1')).toBeNull();
  expect(sync.state).toBe('synced');
});
