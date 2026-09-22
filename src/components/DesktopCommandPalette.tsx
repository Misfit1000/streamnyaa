import { useAuth } from '../context/AuthContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { desktopWatchOrBrowsePath } from '../lib/desktopAnimeRoute';
import { primeDesktopWatchSnapshot } from '../lib/desktopWatchSnapshot';
import { jikanAdultTitle } from '../api/desktopExplore';
import { organizationIdentity } from '../lib/desktopLibraryOrganization';

export default function DesktopCommandPalette({ onClose }: { onClose: () => void }) {
  const { isAdmin } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { myList, likedAnimes, nsfwMode } = useStore();
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  const actions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const routes = [ ['Home', '/'], ['Explore anime', '/search'], ['Calendar · My week', '/schedule?scope=tracked'], ['Library', '/my-list'], ['Downloads & Offline', '/my-list?tab=offline'], ['History & resume', '/dashboard'], ['Settings', '/desktop-settings'], ['Appearance · revert UI', '/desktop-settings#appearance'], ['Diagnostics', '/desktop-settings#diagnostics'], ['Backup & restore', '/desktop-settings#privacy'] ];
    const result = routes.filter(([title]) => (title !== 'Diagnostics' || isAdmin) && title.toLowerCase().includes(needle)).map(([title, path]) => ({ title, hint:'Navigate', run: () => navigate(path) }));
    const seen = new Set<string>();
    for (const anime of [...myList, ...likedAnimes]) {
      const id = organizationIdentity(anime);
      if (seen.has(id) || (!nsfwMode && jikanAdultTitle(anime))) continue;
      seen.add(id);
      if (needle && !String(anime.title).toLowerCase().includes(needle)) continue;
      result.push({ title: anime.title, hint: 'Saved anime', run: () => { const path = desktopWatchOrBrowsePath(anime); primeDesktopWatchSnapshot(path, anime); navigate(path); } });
    }
    if (needle) result.unshift({ title: `Search online for “${query.trim()}”`, hint: 'Explore', run: () => navigate(`/search?q=${encodeURIComponent(query.trim())}`) });
    return result.slice(0, 24);
  }, [query, myList, likedAnimes, nsfwMode, navigate, isAdmin]);
  return <dialog ref={dialog} className="sn-command-dialog" aria-labelledby="command-heading" onCancel={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }} onKeyDown={event => {
    if (!['ArrowDown','ArrowUp'].includes(event.key)) return;
    const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('input,button[data-command]') || []);
    const current = elements.indexOf(document.activeElement as HTMLElement);
    event.preventDefault(); elements[(current + (event.key === 'ArrowDown' ? 1 : elements.length - 1)) % elements.length]?.focus();
  }}>
    <header className="flex items-center justify-between p-4"><h2 id="command-heading" className="font-semibold">Go anywhere</h2><button onClick={onClose} aria-label="Close command palette">Esc · Close</button></header>
    <input autoFocus aria-label="Search commands and saved anime" className="w-full border-y border-white/10 bg-black/20 px-5 py-4 outline-none" placeholder="Search pages, saved anime, settings…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if(event.key === 'Enter' && actions[0]) { actions[0].run(); onClose(); } }} />
    <div className="max-h-[55vh] overflow-y-auto">{actions.map((action,index) => <button key={`${action.title}-${index}`} data-command className="sn-command-row" onClick={() => { action.run(); onClose(); }}><span className="min-w-0 flex-1 truncate">{action.title}</span><small className="text-white/45">{action.hint}</small></button>)}</div>
    {!actions.length && <p className="p-5 text-white/60">No matching commands or saved titles.</p>}
  </dialog>;
}
