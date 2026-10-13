import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DesktopHistory from '../../src/pages/DesktopHistory';
import DesktopLibrary from '../../src/pages/DesktopLibrary';
import { saveHideEpisodeSpoilers } from '../../src/lib/desktopSpoilers';

const fixture = vi.hoisted(() => ({
  history: [] as any[], saved: [] as any[], liked: [] as any[], bookmarkRenders: 0, cardRenders: 0,
  historyChanged: (() => {}) as () => void,
  openSource: vi.fn(async (_source: any) => ({ message: 'Playback request sent.' })),
  clearHistory: vi.fn(), removeHistory: vi.fn(), clearLibrary: vi.fn(),
  isSaved: () => true, isLiked: () => false,
}));

vi.mock('../../src/lib/desktop', () => ({
  loadLocalPlaybackHistory: () => fixture.history,
  subscribeLocalPlaybackHistory: (callback: () => void) => { fixture.historyChanged = callback; return () => {}; },
  formatPlaybackTime: (value: number) => `${value || 0}s`,
  openLocalSourceNow: (source: any) => fixture.openSource(source),
  clearLocalPlaybackHistory: () => fixture.clearHistory(),
  removeLocalPlaybackHistoryItem: (source: any) => fixture.removeHistory(source),
}));
vi.mock('../../src/store/useStore', () => ({ useStore: () => ({
  myList: fixture.saved, likedAnimes: fixture.liked, clearMyList: fixture.clearLibrary,
  isInMyList: fixture.isSaved, isLiked: fixture.isLiked,
}) }));
vi.mock('../../src/components/DesktopDownloads', () => ({ default: () => null }));
vi.mock('../../src/components/DesktopLibraryOrganizer', () => ({ default: () => null }));
vi.mock('../../src/components/DesktopBookmarkButton', () => ({ default: ({ anime }: any) => {
  fixture.bookmarkRenders += 1;
  return <button aria-label={`Bookmark ${anime.title}`}>Bookmark</button>;
} }));
vi.mock('../../src/components/AnimeCard', () => ({ default: ({ anime }: any) => {
  fixture.cardRenders += 1;
  return <a href={`/watch/${anime.mal_id}`}>{anime.title}</a>;
} }));

beforeEach(() => {
  localStorage.clear();
  // Render-count fixtures must not cross a real minute boundary under load.
  vi.spyOn(Date, 'now').mockReturnValue(120_000);
  fixture.history = Array.from({ length: 400 }, (_, index) => ({
    animeId: String(index + 1), animeTitle: `Anime ${index + 1}`, title: `Release ${index + 1}`,
    magnet: `magnet:${index + 1}`, episode: 1, progressPercent: 20, resumeSeconds: 120,
    durationSeconds: 600, savedAt: 1000 + index, poster: `https://images.test/${index}.jpg`,
  }));
  fixture.saved = fixture.history.map(source => ({ mal_id: source.animeId, title: source.animeTitle }));
  fixture.bookmarkRenders = 0; fixture.cardRenders = 0;
  fixture.openSource.mockClear(); fixture.clearHistory.mockClear(); fixture.clearLibrary.mockClear();
});
afterEach(cleanup);

describe('desktop long-list rendering', () => {
  it('keeps every History row and action mounted when opening and cancelling confirmation', async () => {
    const { container } = render(<MemoryRouter><DesktopHistory /></MemoryRouter>);
    const rows = [...container.querySelectorAll('article')];
    const resume = container.querySelector<HTMLButtonElement>('button[aria-label="Resume Anime 400"]')!;
    resume.focus();
    const before = fixture.bookmarkRenders;
    fireEvent.click(within(container.querySelector('section')!).getByRole('button', { name: 'Clear all' }));
    fireEvent.click(within(container.querySelector('[role="alertdialog"]') as HTMLElement).getByRole('button', { name: 'Cancel' }));
    console.info(`History mounted=${rows.length}, confirmation descendant renders=${fixture.bookmarkRenders - before}`);
    expect(rows).toHaveLength(400);
    expect([...container.querySelectorAll('article')]).toEqual(rows);
    expect(document.activeElement).toBe(resume);
    expect(fixture.bookmarkRenders - before).toBe(0);
    await act(async () => { fireEvent.click(resume); });
    expect(fixture.openSource).toHaveBeenCalledWith(fixture.history[399]);
    expect(screen.getByText('Playback request sent.')).toBeTruthy();
    expect(fixture.bookmarkRenders - before).toBe(0);
  }, 20_000);

  it('keeps all Library cards, routes and search results through unrelated dialog state', () => {
    const { container } = render(<MemoryRouter><DesktopLibrary /></MemoryRouter>);
    const cards = [...container.querySelectorAll('a[href^="/watch/"]')];
    const before = fixture.cardRenders;
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    console.info(`Library mounted=${cards.length}, confirmation descendant renders=${fixture.cardRenders - before}`);
    expect(cards).toHaveLength(400);
    expect([...container.querySelectorAll('a[href^="/watch/"]')]).toEqual(cards);
    expect(fixture.cardRenders - before).toBe(0);
    fireEvent.change(screen.getByPlaceholderText('Search your library...'), { target: { value: 'Anime 400' } });
    expect(container.querySelectorAll('a[href^="/watch/"]')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Anime 400' }).getAttribute('href')).toBe('/watch/400');
    expect(fixture.clearLibrary).not.toHaveBeenCalled();
  });

  it('refreshes History for progress, search, layout and spoiler changes', () => {
    fixture.history = fixture.history.slice(0, 2);
    const { container } = render(<MemoryRouter><DesktopHistory /></MemoryRouter>);
    expect(container.querySelectorAll('article')).toHaveLength(2);
    fixture.history = [{ ...fixture.history[0], resumeSeconds: 240, progressPercent: 40 }];
    act(() => fixture.historyChanged());
    expect(screen.getByText('240s / 600s')).toBeTruthy();
    expect(container.querySelectorAll('article')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Grid history view' }));
    expect(screen.getByRole('button', { name: 'Grid history view' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Release 1')).toBeTruthy();
    act(() => saveHideEpisodeSpoilers(true));
    expect(screen.queryByText('Release 1')).toBeNull();
    expect(screen.getByText('Episode 1')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Search title, source, or episode...'), { target: { value: 'no match' } });
    expect(container.querySelectorAll('article')).toHaveLength(0);
    expect(screen.getByText('No matching history.')).toBeTruthy();
  });

  it('refreshes relative History labels on the next render after the minute changes without polling', () => {
    fixture.history = fixture.history.slice(0, 1);
    const now = vi.mocked(Date.now).mockReturnValue(10_000);
    render(<MemoryRouter><DesktopHistory /></MemoryRouter>);
    expect(screen.getByText('Just now')).toBeTruthy();
    const before = fixture.bookmarkRenders;
    now.mockReturnValue(50_000);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fixture.bookmarkRenders).toBe(before);
    now.mockReturnValue(65_000);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.queryByText('Just now')).toBeNull();
    expect(screen.getByText('1m ago')).toBeTruthy();
    expect(fixture.bookmarkRenders).toBe(before + 1);
    now.mockReturnValue(69_000);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fixture.bookmarkRenders).toBe(before + 1);
  });

  it('renders only the selected Library category and refreshes history when progress changes', () => {
    fixture.history = fixture.history.slice(0, 2);
    const { container } = render(<MemoryRouter initialEntries={['/my-list?tab=history']}><DesktopLibrary /></MemoryRouter>);
    expect(container.querySelectorAll('article')).toHaveLength(2);
    expect(fixture.cardRenders).toBe(0);
    fixture.history = [{ ...fixture.history[0], resumeSeconds: 240, progressPercent: 40 }];
    act(() => fixture.historyChanged());
    expect(container.querySelectorAll('article')).toHaveLength(1);
    expect(screen.getByText('Resume 240s / 600s - 40%')).toBeTruthy();
    expect(fixture.cardRenders).toBe(0);
    expect(screen.getByRole('link', { name: 'Open page' }).getAttribute('href')).toContain('/watch/');
  });

  it('refreshes Library bookmark membership and sort order from current store data', () => {
    fixture.saved = fixture.saved.slice(0, 2);
    const { container, rerender } = render(<MemoryRouter><DesktopLibrary /></MemoryRouter>);
    const titles = () => [...container.querySelectorAll('a[href^="/watch/"]')].map(link => link.textContent);
    expect(titles()).toEqual(['Anime 2', 'Anime 1']);
    fireEvent.change(container.querySelector('select')!, { target: { value: 'title-asc' } });
    expect(titles()).toEqual(['Anime 1', 'Anime 2']);
    fixture.saved = [fixture.saved[1], { mal_id: '3', title: 'Anime 3' }];
    rerender(<MemoryRouter><DesktopLibrary /></MemoryRouter>);
    expect(titles()).toEqual(['Anime 2', 'Anime 3']);
  });
});
