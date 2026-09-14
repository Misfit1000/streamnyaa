import { useEffect, useState } from 'react';
import '../styles/desktop-revamp.css';

const designKey = 'streamnyaa.desktop.design.v1';
export type DesktopDesign = 'classic' | 'revamped';
export function readDesktopDesign(): DesktopDesign {
  try { return localStorage.getItem(designKey) === 'classic' ? 'classic' : 'revamped'; } catch { return 'classic'; }
}
export function saveDesktopDesign(design: DesktopDesign) {
  localStorage.setItem(designKey, design);
  window.dispatchEvent(new Event('streamnyaa-design-changed'));
}
export function useDesktopDesign() {
  const [design, setDesign] = useState(readDesktopDesign);
  useEffect(() => {
    const refresh = () => setDesign(readDesktopDesign());
    window.addEventListener('streamnyaa-design-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('streamnyaa-design-changed', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  return design;
}

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
  const design = useDesktopDesign();
  useEffect(() => {
    document.documentElement.dataset.desktopDesign = design;
    return () => { delete document.documentElement.dataset.desktopDesign; };
  }, [design]);
  useEffect(() => {
    const previous = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = `${16 * scale / 100}px`;
    return () => { document.documentElement.style.fontSize = previous; };
  }, [scale]);
}
