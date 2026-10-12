import { useEffect, useRef, useState } from 'react';
import { Activity, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import DesktopActivitySummary, { DesktopCatalogStatus } from './DesktopActivitySummary';

export default function DesktopActivityCenter() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), close = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    const show = () => setOpen(true); window.addEventListener('streamnyaa-open-activity', show);
    return () => window.removeEventListener('streamnyaa-open-activity', show);
  }, []);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
      if (event.key === 'Tab') {
        const items = Array.from(root.current?.querySelectorAll<HTMLElement>('section[role="dialog"] button, section[role="dialog"] a[href]') || []);
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }
    };
    document.addEventListener('pointerdown', outside); window.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', keyboard); };
  }, [open]);
  return <div ref={root} className="relative flex items-center gap-2"><DesktopCatalogStatus />
    <button ref={trigger} type="button" aria-label="Activity" title="Transfers and status" aria-expanded={open} onClick={() => setOpen(value => !value)} className="sn-icon-action h-10 w-10"><Activity size={19} /></button>
    {open && <section role="dialog" aria-label="Activity" className="absolute right-0 top-12 z-50 w-[min(390px,calc(100vw-32px))] rounded-xl border border-white/10 bg-[#101014] p-4 shadow-xl">
      <header className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Activity</h2><button ref={close} type="button" onClick={() => { setOpen(false); trigger.current?.focus(); }} aria-label="Close activity" className="sn-icon-action h-9 w-9"><X size={17} /></button></header>
      <DesktopActivitySummary />
    </section>}
  </div>;
}
