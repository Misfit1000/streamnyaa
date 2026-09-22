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

  it('uses a native select that commits 2025 without a dismissible portal', () => {
    const onChange=vi.fn();
    const view=render(<PremiumSelect value="2026" ariaLabel="Year" onChange={onChange} options={[{label:'2026',value:'2026'},{label:'2025',value:'2025'}]}/>);
    const select=screen.getByRole('combobox',{name:'Year'});
    expect(select.tagName).toBe('SELECT');
    fireEvent.mouseDown(select);fireEvent.mouseUp(select);fireEvent.click(select);
    fireEvent.change(select,{target:{value:'2025'}});
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2025');
    view.rerender(<PremiumSelect value="2025" ariaLabel="Year" onChange={onChange} options={[{label:'2026',value:'2026'},{label:'2025',value:'2025'}]}/>);
    expect((select as HTMLSelectElement).value).toBe('2025');
    expect(screen.getByRole('option',{name:'2025'}).getAttribute('value')).toBe('2025');
    expect(screen.queryByRole('listbox')).toBeNull();
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
