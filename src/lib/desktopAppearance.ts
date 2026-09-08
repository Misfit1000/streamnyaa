import { useEffect, useState } from 'react';

export const desktopInterfaceScales = [85, 100, 115, 125] as const;
const storageKey = 'streamnyaa.desktop.interfaceScale';
const changedEvent = 'streamnyaa-interface-scale-changed';
export function normalizeInterfaceScale(value: unknown): number {
  const numeric = Number(value);
  return desktopInterfaceScales.some((scale) => scale === numeric) ? numeric : 100;
}
export function readInterfaceScale() {
  try { return normalizeInterfaceScale(localStorage.getItem(storageKey)); } catch { return 100; }
}
export function saveInterfaceScale(value: number) {
  const scale = normalizeInterfaceScale(value);
  localStorage.setItem(storageKey, String(scale));
  window.dispatchEvent(new Event(changedEvent));
  return scale;
}
export function useInterfaceScale() {
  const [scale, setScale] = useState(readInterfaceScale);
  useEffect(() => {
    const update = () => setScale(readInterfaceScale());
    window.addEventListener(changedEvent, update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener(changedEvent, update); window.removeEventListener('storage', update); };
  }, []);
  return scale;
}
export function useDesktopInterfaceScale() {
  const scale = useInterfaceScale();
  useEffect(() => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = `${16 * scale / 100}px`;
    return () => { document.documentElement.style.fontSize = previous; };
  }, [scale]);
}
