import { useEffect, useRef, useState } from 'react';
import { meaningfulPreset, presetSummary, readExplorePresets, sanitizeExplorePreset, writeExplorePresets, type ExplorePreset } from '../lib/desktopExplorePresets';
export default function DesktopExplorePresetManager({ query, onApply }: {
    query: string;
    onApply: (query: string) => void;
}) {
    const [items, setItems] = useState(readExplorePresets), [name, setName] = useState(''), [editing, setEditing] = useState<string | null>(null), [error, setError] = useState(''), [removed, setRemoved] = useState<ExplorePreset | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const clean = sanitizeExplorePreset(query), active = items.find(item => item.query === clean);
    useEffect(() => { if (!removed)
        return; const timer = setTimeout(() => setRemoved(null), 8000); return () => clearTimeout(timer); }, [removed]);
    const save = (next: ExplorePreset[]) => { try {
        setItems(writeExplorePresets(next));
        setError('');
        return true;
    }
    catch {
        setError('Could not save presets. Check available storage.');
        return false;
    } };
    const update = (item: ExplorePreset) => {
        if (items.some(other => other.id !== item.id && other.query === clean)) {
            setError('These filters already belong to another preset.');
            return;
        }
        save(items.map(other => other.id === item.id ? { ...item, query: clean, updatedAt: Date.now() } : other));
    };
    return <section aria-label="Saved filters" className="my-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
 <div className="flex justify-between gap-3"><h2 className="font-semibold">Saved filters</h2><span className="text-xs text-white/60">{active ? `Saved preset · ${active.name}` : 'Unsaved changes'} · This device</span></div>
 <form className="mt-3 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); if (!name.trim() || !meaningfulPreset(clean))
        return; const existing = items.find(item => item.id === editing) || items.find(item => item.name.toLowerCase() === name.trim().toLowerCase()); if (items.some(item => item.id !== existing?.id && item.query === clean)) {
        setError('These filters are already saved. Apply or rename that preset.');
        return;
    } if (!existing && items.length >= 12) {
        setError('You can save up to 12 presets.');
        return;
    } const now = Date.now(); const item = { ...existing, id: existing?.id || crypto.randomUUID(), name: name.trim(), query: clean, createdAt: existing?.createdAt || now, updatedAt: now }; if (save([...items.filter(p => p.id !== item.id), item])) {
        setName('');
        setEditing(null);
    } }}>
 <input ref={input} aria-label="Preset name" value={name} maxLength={40} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') {
        setName('');
        setEditing(null);
    } }} placeholder="Name this view" className="rounded-lg bg-black/30 px-3 py-2"/>
 <button className="sn-secondary-action disabled:opacity-40" disabled={!name.trim() || !meaningfulPreset(clean)}>{editing || items.some(p => p.name.toLowerCase() === name.trim().toLowerCase()) ? 'Update preset' : 'Save current'}</button>
 </form>
 {!items.length && <p className="mt-3 text-sm text-white/60">Choose a feed and filters, then save a view to reopen it in one click.</p>}
 {items.map(item => <div key={item.id} className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3"><div className="min-w-0 flex-1"><strong>{item.name}</strong><p className="text-xs text-white/60">{presetSummary(item.query)}</p></div>
 <button className="sn-secondary-action" aria-pressed={active?.id === item.id} onClick={() => { save(items.map(p => p.id === item.id ? { ...p, lastAppliedAt: Date.now() } : p)); onApply(item.query); }}>Apply</button>
 <button className="sn-secondary-action" disabled={!meaningfulPreset(clean)} onClick={() => update(item)}>Update</button>
 <button className="sn-secondary-action" onClick={() => { setEditing(item.id); setName(item.name); onApply(item.query); input.current?.focus(); }}>Rename / edit</button>
 <button className="sn-secondary-action" onClick={() => { if (save(items.filter(p => p.id !== item.id)))
            setRemoved(item); }}>Delete</button></div>)}
 {removed && <button className="sn-secondary-action mt-3" onClick={() => { if (save([...items, removed]))
        setRemoved(null); }}>Undo deletion</button>}
 {error && <p role="status" className="mt-2 text-sm text-red-300">{error}</p>}
 </section>;
}
