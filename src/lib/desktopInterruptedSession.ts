const key = 'streamnyaa.desktop.interruptedPlayback.v1';
export interface InterruptedPlayback { animeId: string; episode: string; savedAt: number }
export function readInterruptedPlayback(now = Date.now()): InterruptedPlayback | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (!value || typeof value.animeId !== 'string' || !value.animeId || value.animeId.length > 200
      || typeof value.episode !== 'string' || !/^\d+$/.test(value.episode) || Number(value.episode) < 1
      || !Number.isFinite(value.savedAt) || value.savedAt > now || now - value.savedAt > 7 * 86400000) return null;
    return value;
  } catch { return null; }
}
export function markInterruptedPlayback(animeId: unknown, episode: unknown) {
  const id = String(animeId || '').trim();
  const number = Number(episode);
  if (!id || id.length > 200 || !Number.isSafeInteger(number) || number < 1) return;
  try { localStorage.setItem(key, JSON.stringify({ animeId: id, episode: String(number), savedAt: Date.now() })); } catch { /* Playback must remain usable when storage is full. */ }
}
export function clearInterruptedPlayback() {
  try { localStorage.removeItem(key); } catch { /* Do not block closing playback. */ }
}
