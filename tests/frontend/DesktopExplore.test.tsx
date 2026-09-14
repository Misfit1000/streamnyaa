import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ExploreAnimeCard, PremiumSelect } from '../../src/pages/DesktopExplore';

afterEach(() => cleanup());

describe('desktop Explore behavior', () => {
  it('renders portrait artwork without transform-based WebView2 clipping', () => {
    const { container } = render(
      <MemoryRouter>
        <ExploreAnimeCard
          index={0}
          anime={{
            mal_id: 52991,
            title: 'Frieren: Beyond Journey’s End',
            images: { webp: { large_image_url: 'https://images.example/frieren.webp' } },
            banner_image: 'https://images.example/banner/frieren.webp',
            type: 'TV',
            score: 9.3,
            episodes: 27,
            latestEpisode: 24,
          }}
        />
      </MemoryRouter>,
    );

    const image = screen.getByRole('img', { name: 'Frieren: Beyond Journey’s End' });
    expect(image.getAttribute('src')).toBe('https://images.example/frieren.webp');
    expect(image.className).not.toMatch(/scale|transition|transform/);
    expect(container.querySelector('.sn-explore-poster')).not.toBeNull();
    expect(screen.getByText('EP 24/27')).toBeTruthy();
  });

  it('renders select options in a body-level popup outside clipped filter panels', () => {
    const onChange = vi.fn();
    const { container } = render(
      <div data-testid="filter-panel">
        <PremiumSelect
          value="2026"
          ariaLabel="Year"
          onChange={onChange}
          options={[{ label: '2026', value: '2026' }, { label: '2025', value: '2025' }]}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Year' }));
    const popup = screen.getByRole('listbox', { name: 'Year' });
    expect(document.body.contains(popup)).toBe(true);
    expect(container.contains(popup)).toBe(false);
    fireEvent.click(screen.getByRole('option', { name: '2025' }));
    expect(onChange).toHaveBeenCalledWith('2025');
  });

  it('offers a real airing notification action for upcoming anime', () => {
    render(
      <MemoryRouter>
        <ExploreAnimeCard
          index={0}
          anime={{
            id: 200,
            mal_id: 200,
            title: 'Upcoming Anime',
            status: 'NOT_YET_AIRED',
            images: { jpg: { large_image_url: 'https://images.example/upcoming.jpg' } },
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Notify me when this anime airs' })).toBeTruthy();
  });
});
