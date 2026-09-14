// Separate episode pages from discovery-cache eviction. Keys always use MAL IDs.
const key = 'streamnyaa.desktop.episodePages.v1';
type Page = { savedAt: number; data: any[]; pagination: { last_visible_page: number; has_next_page?: boolean } };
function read(): Record<string, Page> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 1_500_000) return {};
    const parsed = JSON.parse(raw);
    return parsed.version === 1 && parsed.pages && typeof parsed.pages === 'object' ? parsed.pages : {};
  } catch { return {}; }
}
export function readEpisodePage(id: string, page: number): Page | undefined {
  const saved = read()[`${id}:${page}`];
  if (!saved || !Number.isFinite(saved.savedAt) || Date.now() - saved.savedAt > 30 * 86400_000 || !Array.isArray(saved.data)
    || !Number.isSafeInteger(saved.pagination?.last_visible_page) || !saved.data.every(item => Number.isSafeInteger(item?.mal_id) && item.mal_id > 0 && item.mal_id <= 100000)) return undefined;
  return saved;
}
export function saveEpisodePage(id: string, page: number, value: any) {
  if (!/^[1-9]\d*$/.test(id) || !Array.isArray(value.data) || !value.data.length) return;
  try {
    const pages = read();
    pages[`${id}:${page}`] = { savedAt: Date.now(), data: value.data.map((item: any) => ({ mal_id: item.mal_id, title: item.title, title_english: item.title_english, title_romanji: item.title_romanji, aired: item.aired, filler: item.filler, recap: item.recap })), pagination: value.pagination };
    const entries = Object.entries(pages).sort((a,b) => b[1].savedAt - a[1].savedAt).slice(0, 60);
    let json = JSON.stringify({ version: 1, pages: Object.fromEntries(entries) });
    while (json.length > 1_500_000 && entries.length > 1) { entries.pop(); json = JSON.stringify({ version: 1, pages: Object.fromEntries(entries) }); }
    if (json.length <= 1_500_000) localStorage.setItem(key, json);
  } catch { /* Playback does not depend on cache writes. */ }
}
