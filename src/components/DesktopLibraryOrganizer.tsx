import { useEffect, useState } from 'react';
import { createLibraryCollection, libraryOrganizationEvent, libraryStatuses, organizationIdentity, readLibraryOrganization, undoLibraryOrganization, updateLibraryOrganization, type LibraryStatus, type LibraryUndo } from '../lib/desktopLibraryOrganization';

export default function DesktopLibraryOrganizer({ anime }: { anime: any[] }) {
  const [data, setData] = useState(readLibraryOrganization);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState('All statuses');
  const [collection, setCollection] = useState('');
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [undo, setUndo] = useState<LibraryUndo>();
  const [error, setError] = useState('');
  useEffect(() => {
    const refresh = () => setData(readLibraryOrganization());
    window.addEventListener(libraryOrganizationEvent, refresh); window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(libraryOrganizationEvent, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const visible = anime.filter((item) => {
    const entry = data.entries[organizationIdentity(item)];
    return (status === 'All statuses' || (entry?.status || 'Plan to watch') === status)
      && (!collection || entry?.collections.includes(collection))
      && String(item.title).toLowerCase().includes(query.toLowerCase());
  });
  const change = (ids: string[], value: { status?: LibraryStatus; collection?: string }) => {
    try { setUndo(updateLibraryOrganization(ids, value)); setSelected([]); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Library update could not be saved.'); }
  };
  const selectClass = 'rounded-lg bg-[#202024] px-3 py-2 text-sm text-white';
  return <details className="sn-glass-panel my-5 p-5">
    <summary className="cursor-pointer text-lg font-semibold">Organize library</summary>
    <p className="mt-2 text-sm text-white/60">Manage viewing status and collections on this PC. Bookmarks, favorites, and watch history stay unchanged.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <input aria-label="Search organized library" placeholder="Search saved anime" value={query} onChange={(e) => setQuery(e.target.value)} className={selectClass} />
      <select aria-label="Filter viewing status" value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}><option>All statuses</option>{libraryStatuses.map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Filter collection" value={collection} onChange={(e) => setCollection(e.target.value)} className={selectClass}><option value="">All collections</option>{data.collections.map((value) => <option key={value}>{value}</option>)}</select>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); try { createLibraryCollection(name); setName(''); setError(''); } catch (error) { setError(error instanceof Error ? error.message : 'Could not save collection.'); } }}>
        <input aria-label="New collection name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Collection name" className={selectClass} />
        <button type="submit" disabled={!name.trim()} className="sn-secondary-action">Create</button>
      </form>
    </div>
    <div className="my-3 flex flex-wrap items-center gap-2">
      <button type="button" className="sn-secondary-action" onClick={() => setSelected(visible.map(organizationIdentity))}>Select visible ({visible.length})</button>
      <button type="button" className="sn-secondary-action" disabled={!selected.length} onClick={() => setSelected([])}>Clear selection</button>
      <select aria-label="Set selected viewing status" disabled={!selected.length} value="" onChange={(e) => change(selected, { status: e.target.value as LibraryStatus })} className={selectClass}><option value="">Set status ({selected.length})</option>{libraryStatuses.map((value) => <option key={value}>{value}</option>)}</select>
      <select aria-label="Add selected to collection" disabled={!selected.length} value="" onChange={(e) => change(selected, { collection: e.target.value })} className={selectClass}><option value="">Add to collection</option>{data.collections.map((value) => <option key={value}>{value}</option>)}</select>
      {undo ? <button type="button" className="sn-secondary-action" onClick={() => { try { undoLibraryOrganization(undo); setUndo(undefined); setError(''); } catch { setError('Undo could not be saved.'); } }}>Undo last change</button> : null}
    </div>
    {error ? <p role="alert" className="py-2 text-sm text-red-300">{error}</p> : null}
    <div className="max-h-96 overflow-y-auto">
      {visible.map((item) => { const id = organizationIdentity(item); const entry = data.entries[id]; return <div key={id} className="flex items-center gap-3 border-t border-white/5 py-3">
        <input type="checkbox" aria-label={`Select ${item.title}`} checked={selected.includes(id)} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, id] : ids.filter((value) => value !== id))} />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p><p className="text-xs text-white/50">{entry?.collections.join(' · ') || 'No collection'}</p></div>
        <select aria-label={`Viewing status for ${item.title}`} value={entry?.status || 'Plan to watch'} onChange={(e) => change([id], { status: e.target.value as LibraryStatus })} className={selectClass}>{libraryStatuses.map((value) => <option key={value}>{value}</option>)}</select>
      </div>; })}
      {!visible.length ? <p className="py-6 text-sm text-white/60">No saved anime match these filters.</p> : null}
    </div>
  </details>;
}
