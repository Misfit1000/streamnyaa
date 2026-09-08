import { useEffect, useState } from 'react';
const key = 'streamnyaa.desktop.hideEpisodeSpoilers';
const event = 'streamnyaa-spoilers-changed';
export function readHideEpisodeSpoilers() {
  try { return localStorage.getItem(key) === 'true'; } catch { return false; }
}
export function saveHideEpisodeSpoilers(enabled: boolean) {
  localStorage.setItem(key, String(enabled));
  window.dispatchEvent(new Event(event));
}
export function useHideEpisodeSpoilers() {
  const [enabled, setEnabled] = useState(readHideEpisodeSpoilers);
  useEffect(() => {
    const update = () => setEnabled(readHideEpisodeSpoilers());
    window.addEventListener(event, update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener(event, update); window.removeEventListener('storage', update); };
  }, []);
  return enabled;
}
