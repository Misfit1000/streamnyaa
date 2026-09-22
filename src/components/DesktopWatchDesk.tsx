import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { openLocalSourceNow, formatPlaybackTime, type LocalPlaybackSource } from '../lib/desktop';
import { desktopWatchPath } from '../lib/desktopAnimeRoute';
import type { WatchDeskRelease } from '../lib/desktopWatchDesk';
const positionKey = 'streamnyaa.desktop.watchDesk.position.v1';
export function clampDesk(x: number, y: number, width: number, height: number, viewportWidth: number, viewportHeight: number) { return { x: Math.max(8, Math.min(x, viewportWidth - width - 8)), y: Math.max(8, Math.min(y, viewportHeight - height - 8)) }; }
export function watchDeskDetails(source: LocalPlaybackSource) { return source.animeId ? desktopWatchPath({ mal_id: source.animeId, title: source.animeTitle || source.title }, source.episode ? { ep: String(source.episode) } : undefined) : `/search?q=${encodeURIComponent(source.animeTitle || source.title)}`; }
export default function DesktopWatchDesk({ sources, history, upcoming }: {
    sources: LocalPlaybackSource[];
    history: LocalPlaybackSource[];
    upcoming: WatchDeskRelease[];
}) {
    const [open, setOpen] = useState(false), [error, setError] = useState('');
    const [position, setPosition] = useState(() => { try {
        const p = JSON.parse(localStorage.getItem(positionKey) || 'null');
        if (p?.version === 1 && Number.isFinite(p.x) && Number.isFinite(p.y))
            return { x: p.x, y: p.y };
    }
    catch { } return { x: window.innerWidth - 440, y: 90 }; });
    const panel = useRef<HTMLDivElement>(null), launcher = useRef<HTMLButtonElement>(null), closeButton = useRef<HTMLButtonElement>(null);
    const drag = useRef<{
        id: number;
        x: number;
        y: number;
        left: number;
        top: number;
    } | null>(null);
    const latestPosition = useRef(position);
    const frame = useRef<number | null>(null);
    const persist = () => { try { localStorage.setItem(positionKey, JSON.stringify({ version: 1, ...latestPosition.current })); } catch {} };
    const place = (x: number, y: number, immediate = false) => {
        const r = panel.current?.getBoundingClientRect();
        const next = clampDesk(x, y, r?.width || 420, r?.height || 400, window.innerWidth, window.innerHeight);
        latestPosition.current = next;
        if (immediate) { setPosition(next); persist(); return; }
        if (frame.current === null) frame.current = requestAnimationFrame(() => { frame.current = null; setPosition(latestPosition.current); });
    };
    const finishDrag = () => {
        if (!drag.current) return;
        drag.current = null;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        setPosition(latestPosition.current);
        persist();
    };
    const close = () => { finishDrag(); setOpen(false); launcher.current?.focus(); };
    useEffect(() => {
        if (!open) return;
        const clamp = () => { if (!drag.current) place(latestPosition.current.x, latestPosition.current.y, true); };
        clamp(); closeButton.current?.focus();
        const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        const outside = (e: PointerEvent) => { if (!drag.current && !panel.current?.contains(e.target as Node) && !launcher.current?.contains(e.target as Node)) close(); };
        // Window listeners also work if WebView cannot capture the pointer.
        const move = (e: PointerEvent) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            e.preventDefault();
            place(d.left + e.clientX - d.x, d.top + e.clientY - d.y);
        };
        const end = (e: PointerEvent) => { if (drag.current?.id === e.pointerId) finishDrag(); };
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(clamp) : null;
        if (panel.current) observer?.observe(panel.current);
        window.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
        window.addEventListener('blur', finishDrag);
        window.addEventListener('resize', clamp);
        window.visualViewport?.addEventListener('resize', clamp);
        document.addEventListener('keydown', key);
        document.addEventListener('pointerdown', outside);
        return () => {
            finishDrag(); observer?.disconnect();
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
            window.removeEventListener('blur', finishDrag);
            window.removeEventListener('resize', clamp);
            window.visualViewport?.removeEventListener('resize', clamp);
            document.removeEventListener('keydown', key);
            document.removeEventListener('pointerdown', outside);
        };
    }, [open]);
    const resumable = sources.filter(s => !s.completed && Number(s.progressPercent || 0) < 92).slice(0, 5);
    return createPortal(<><button ref={launcher} aria-expanded={open} aria-controls="watch-desk" className="sn-secondary-action fixed right-0 top-1/3 z-30 rounded-l-xl px-3 py-2" onClick={() => open ? close() : setOpen(true)}>Watch desk</button>
 {open && <div id="watch-desk" ref={panel} role="dialog" aria-label="Your watch desk" aria-modal="false" style={{ left: position.x, top: position.y, width: 'min(420px, calc(100vw - 16px))', maxHeight: '82vh' }} className="fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-white/20 bg-[#101014] text-white shadow-2xl">
 <header className="flex touch-none select-none cursor-move items-center justify-between border-b border-white/10 p-3"
 onPointerDown={e => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button,a,input,select')) return;
    e.preventDefault();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: latestPosition.current.x, top: latestPosition.current.y };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* Window listeners retain dragging. */ }
 }} onLostPointerCapture={finishDrag}>
 <div role="button" tabIndex={0} aria-label="Move watch desk with drag or arrow keys" className="flex-1 rounded px-2 py-2 font-semibold" onKeyDown={e => {
    const delta = ({ ArrowLeft: [-20,0], ArrowRight: [20,0], ArrowUp: [0,-20], ArrowDown: [0,20] } as Record<string,number[]>)[e.key];
    if (delta) { e.preventDefault(); place(latestPosition.current.x + delta[0], latestPosition.current.y + delta[1], true); }
 }}>⠿ Your watch desk</div><button ref={closeButton} className="sn-secondary-action" onClick={close}>Close</button></header>
 <div className="overflow-y-auto overscroll-contain p-4"><h2 className="font-semibold">Continue watching</h2>{!resumable.length && <p className="py-3 text-sm text-white/60">Start an episode to see it here.</p>}
 {resumable.map(source => <article key={source.magnet} className="mt-3 flex gap-3 rounded-xl bg-white/5 p-3">{source.poster && <img src={source.poster} alt="" className="h-20 w-14 rounded object-cover"/>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{source.animeTitle || source.title}</p><p className="text-xs text-white/60">Episode {source.episode || '?'} · {formatPlaybackTime(source.resumeSeconds || 0)}</p><progress aria-label="Watch progress" value={source.progressPercent || 0} max={100} className="my-2 h-1 w-full accent-primary"/><p className="text-xs text-white/50">{source.progressUpdatedAt || source.savedAt ? new Date(Number(source.progressUpdatedAt || source.savedAt)).toLocaleString() : ''}</p><div className="mt-2 flex gap-2"><button className="sn-secondary-action" onClick={() => void openLocalSourceNow(source).catch(e => setError(e instanceof Error ? e.message : 'Could not open playback.'))}>Resume</button><Link className="sn-secondary-action" to={watchDeskDetails(source)} onClick={close}>Details</Link></div></div></article>)}
 <h2 className="mt-5 font-semibold">Recent history</h2>{history.slice(0, 3).map((source, index) => <Link className="mt-2 block truncate text-sm text-white/70" key={`${source.magnet}-${index}`} to={watchDeskDetails(source)} onClick={close}>{source.animeTitle || source.title} · Episode {source.episode || '?'}</Link>)}<Link className="mt-2 block text-sm text-primary" to="/dashboard" onClick={close}>View history →</Link>
 <h2 className="mt-5 font-semibold">Your upcoming releases</h2>{upcoming.slice(0, 4).map(item => <Link key={item.id} className="mt-3 block rounded-lg bg-white/5 p-3 text-sm" to={item.path} onClick={close}>{item.title}<span className="block text-xs text-white/60">Episode {item.episode} · {new Date(item.airingAt * 1000).toLocaleString()}</span></Link>)}{!upcoming.length && <p className="mt-2 text-sm text-white/60">No saved upcoming release times for your tracked titles.</p>}<Link className="mt-3 block text-sm text-primary" to="/schedule?scope=tracked" onClick={close}>Open calendar →</Link>{error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}</div></div>}</>, document.body);
}
