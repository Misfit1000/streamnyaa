import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import '../styles/desktop-controls.css';

export default function DesktopDrawer({ open, title, subtitle, onClose, children, docked = false }: {
  open: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode; docked?: boolean;
}) {
  const heading = useId();
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const dismiss = useRef(onClose); dismiss.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Let an open action menu consume Escape before dismissing its drawer.
        if (panel.current?.querySelector('[role="menu"]')) return;
        event.preventDefault(); event.stopPropagation(); dismiss.current();
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]') || []).filter(item => {
        if (item.tabIndex < 0 || item.closest('[hidden]') || item.getAttribute('aria-hidden') === 'true') return false;
        const closed = item.closest('details:not([open])');
        return !closed || closed.querySelector(':scope > summary') === item;
      });
      const first = items[0], last = items.at(-1);
      if (!items.length) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const focus = (event: FocusEvent) => { if (!panel.current?.contains(event.target as Node)) close.current?.focus(); };
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) dismiss.current(); };
    document.addEventListener('keydown', keyboard, true);
    document.addEventListener('focusin', focus);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', keyboard, true); document.removeEventListener('focusin', focus);
      document.removeEventListener('pointerdown', outside);
      document.body.style.overflow = oldOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(<div className={`sn-drawer-layer ${docked ? 'sn-drawer-docked' : ''}`}>
    <aside ref={panel} role="dialog" aria-modal="true" aria-labelledby={heading} className="sn-drawer-panel">
      <header className="sn-drawer-heading"><div><h2 id={heading}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button ref={close} type="button" onClick={onClose} className="sn-icon-action" aria-label={`Close ${title}`}><X className="h-5 w-5" /></button></header>
      <div className="sn-drawer-content">{children}</div>
    </aside>
  </div>, document.body);
}
