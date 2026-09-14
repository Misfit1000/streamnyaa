import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DesktopCatalogActions from '../../src/components/DesktopCatalogActions';
import { useStore } from '../../src/store/useStore';
afterEach(() => { cleanup(); useStore.setState({ myList: [], likes: [], likedAnimes: [] }); localStorage.clear(); });
describe('catalog quick actions', () => {
  it('bookmarks the original provider identity without starting playback', () => {
    const anime = { mal_id: 42, anilist_id: 100, title: 'Fixture' };
    render(<DesktopCatalogActions anime={anime} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bookmark Fixture' }));
    expect(useStore.getState().myList).toEqual([anime]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove bookmark for Fixture' }));
    expect(useStore.getState().myList).toEqual([]);
    expect(useStore.getState().isLiked(42)).toBe(false);
  });
  it('includes legacy favorites and removes both saved memberships together', () => {
    const anime = { mal_id: 42, title: 'Legacy' };
    useStore.getState().addToMyList(anime);
    useStore.getState().toggleLike(anime);
    render(<DesktopCatalogActions anime={anime} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove bookmark for Legacy' }));
    expect(useStore.getState().myList).toEqual([]);
    expect(useStore.getState().likedAnimes).toEqual([]);
  });
});
