import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, X } from 'lucide-react';

export default function DesktopTrailer({ title, url, onClose }: { title: string; url: string; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(expanded); expandedRef.current = expanded;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = root.current;
    close.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { if (document.fullscreenElement) void document.exitFullscreen(); else if (expandedRef.current) setExpanded(false); else onClose(); }
      if (event.key === 'Tab' && root.current) {
        const items = Array.from(root.current.querySelectorAll<HTMLElement>('button, iframe'));
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const fullscreen = () => setExpanded(Boolean(document.fullscreenElement));
    window.addEventListener('keydown', keyboard);
    document.addEventListener('fullscreenchange', fullscreen);
    return () => {
      window.removeEventListener('keydown', keyboard); document.removeEventListener('fullscreenchange', fullscreen);
      if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => undefined);
      previous?.focus();
    };
  }, [onClose]);
  const toggle = async () => {
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    try { await root.current?.requestFullscreen(); } catch { /* Full-window layout remains usable. */ }
  };
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={root} role="dialog" aria-modal="true" aria-label={`${title} trailer`} className={`${expanded ? 'fixed inset-0' : 'w-full max-w-[960px] rounded-xl border border-white/15'} flex max-h-full flex-col overflow-hidden bg-black shadow-2xl`}>
      <header className="flex shrink-0 items-center justify-between gap-4 bg-[#101014] px-4 py-3"><strong className="truncate">{title} · Trailer</strong><div className="flex gap-2">
        <button type="button" className="sn-icon-action h-10 w-10" onClick={() => void toggle()} aria-label={expanded ? 'Exit trailer fullscreen' : 'Fullscreen trailer'}>{expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
        <button ref={close} type="button" className="sn-icon-action h-10 w-10" onClick={onClose} aria-label="Close trailer"><X size={18} /></button>
      </div></header>
      <iframe title={`${title} trailer`} src={url} className={`${expanded ? 'min-h-0 flex-1' : 'aspect-video min-h-[200px]'} w-full bg-black`} allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
    </div>
  </div>, document.body);
}
