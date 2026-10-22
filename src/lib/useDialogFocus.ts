import { useEffect, type RefObject } from 'react';
export function useDialogFocus(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open || !ref.current) return;
    const previous = document.activeElement as HTMLElement | null, element = ref.current;
    const controls = () => Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]'));
    controls()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') { const items = controls(), current = items.indexOf(document.activeElement as HTMLElement); if (event.shiftKey && current <= 0) { event.preventDefault(); items.at(-1)?.focus(); } else if (!event.shiftKey && current === items.length - 1) { event.preventDefault(); items[0]?.focus(); } }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
  }, [open, ref, close]);
}
