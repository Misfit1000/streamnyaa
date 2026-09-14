const key = 'streamnyaa.desktop.interruptedPlayback.v1';
export interface InterruptedPlayback { animeId: string; episode: string; savedAt: number; sourceKey?: string; positionSeconds?: number; durationSeconds?: number }
export function readInterruptedPlayback(now = Date.now()): InterruptedPlayback | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (!value || typeof value.animeId !== 'string' || !value.animeId || value.animeId.length > 200
      || typeof value.episode !== 'string' || !/^\d+$/.test(value.episode) || Number(value.episode) < 1
      || (value.sourceKey !== undefined && (typeof value.sourceKey !== 'string' || !value.sourceKey || value.sourceKey.length > 1000))
      || (value.positionSeconds !== undefined && (!Number.isFinite(value.positionSeconds) || value.positionSeconds < 0))
      || (value.durationSeconds !== undefined && (!Number.isFinite(value.durationSeconds) || value.durationSeconds < 0))
      || !Number.isFinite(value.savedAt) || value.savedAt > now || now - value.savedAt > 7 * 86400000) return null;
    return value;
  } catch { return null; }
}
export function interruptedSourceKey(source: { infoHash?: string; magnet?: string; title?: string }) {
  const hash = source.infoHash || source.magnet?.match(/(?:[?&])xt=urn:btih:([a-zA-Z0-9]+)/i)?.[1];
  return hash ? `hash:${hash.toLowerCase()}` : `title:${String(source.title || '').trim()}`;
}
export function markInterruptedPlayback(animeId: unknown, episode: unknown, sourceKey?: string, positionSeconds?: number, durationSeconds?: number) {
  const id = String(animeId || '').trim();
  const number = Number(episode);
  if (!id || id.length > 200 || !Number.isSafeInteger(number) || number < 1) return;
  if (sourceKey !== undefined && (!sourceKey || sourceKey.length > 1000)) return;
  try { localStorage.setItem(key, JSON.stringify({ animeId: id, episode: String(number), savedAt: Date.now(), ...(sourceKey ? { sourceKey } : {}),
    ...(Number.isFinite(positionSeconds) && positionSeconds! >= 0 ? { positionSeconds } : {}),
    ...(Number.isFinite(durationSeconds) && durationSeconds! >= 0 ? { durationSeconds } : {}),
  })); } catch { /* Playback must remain usable when storage is full. */ }
}
export function clearInterruptedPlayback(expected?: InterruptedPlayback) {
  try {
    if (expected) {
      const current = readInterruptedPlayback();
      if (!current || current.savedAt !== expected.savedAt || current.animeId !== expected.animeId
        || current.episode !== expected.episode || current.sourceKey !== expected.sourceKey) return;
    }
    localStorage.removeItem(key);
  } catch { /* Do not block closing playback. */ }
}
