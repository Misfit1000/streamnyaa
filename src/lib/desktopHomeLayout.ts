import { useState } from 'react';
export const homeShelves = { continue:'Continue Watching', spotlight:'Spotlight', episodes:'New Episodes', season:'This Season', trending:'Trending', airing:'Top Airing', upcoming:'Upcoming', popular:'Popular Picks', yearly:'Top by year' };
export type ShelfId = keyof typeof homeShelves;
const key = 'streamnyaa.desktop.homeLayout.v1';
type Layout = { order: ShelfId[]; hidden: ShelfId[] };
export function readHomeLayout(): Layout {
  const defaults = Object.keys(homeShelves) as ShelfId[];
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    return { order: [...new Set<ShelfId>([...(Array.isArray(saved.order) ? saved.order.filter((id: string) => defaults.includes(id as ShelfId)) : []), ...defaults])], hidden: Array.isArray(saved.hidden) ? saved.hidden.filter((id: string) => defaults.includes(id as ShelfId)) : [] };
  } catch { return { order: defaults, hidden: [] }; }
}
export function useHomeLayout() {
  const [layout,setLayout] = useState(readHomeLayout);
  const [error,setError] = useState('');
  return { layout, error, save: (next: Layout) => { try { localStorage.setItem(key, JSON.stringify(next)); setLayout(next); setError(''); } catch { setError('Home layout could not be saved.'); } } };
}
