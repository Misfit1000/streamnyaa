import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import '../styles/desktop-controls.css';
export type DesktopMenuAction = { label: string; action: () => void; disabled?: boolean; title?: string };
export default function DesktopActionMenu({ label, actions, children }: {label: string; actions: DesktopMenuAction[]; children?: ReactNode}) {
  const [open, setOpen] = useState(false); const root = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement>(null); const menu = useRef<HTMLDivElement>(null); const id = useId();
  useEffect(() => {
    if (!open) return;
    const bounds = trigger.current?.getBoundingClientRect();
    root.current?.classList.toggle('sn-action-menu-up', Boolean(bounds && window.innerHeight - bounds.bottom < 300 && bounds.top > 300));
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const dismiss = () => { setOpen(false); trigger.current?.focus(); };
  return <div ref={root} className="sn-action-menu" onKeyDown={event => {
    if (!open) { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } return; }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault(); const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }}>
    <button ref={trigger} type="button" className={children ? 'sn-secondary-action' : 'sn-icon-action'} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>{children || <MoreHorizontal className="h-5 w-5" />}</button>
    {open && <div id={id} ref={menu} role="menu" aria-label={label} className="sn-action-menu-items">{actions.map(item => <button key={item.label} role="menuitem" type="button" disabled={item.disabled} title={item.title} onClick={() => { dismiss(); item.action(); }}>{item.label}</button>)}</div>}
  </div>;
}
