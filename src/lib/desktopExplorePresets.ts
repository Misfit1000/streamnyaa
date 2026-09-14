export interface ExplorePreset { name: string; query: string }
const key = 'streamnyaa-desktop-explore-presets-v1';
const allowed = new Set(['mode', 'q', 'genre', 'format', 'status', 'order', 'year', 'season', 'ranking', 'view', 'hideCompleted', 'released']);
export function sanitizeExplorePreset(query: string) {
  const output = new URLSearchParams();
  new URLSearchParams(query).forEach((value, name) => {
    if (allowed.has(name) && value.length <= 200) output.set(name, value);
  });
  return output.toString();
}
export function readExplorePresets(): ExplorePreset[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item?.name === 'string' && item.name.trim() && typeof item.query === 'string')
      .slice(0, 12).map((item) => ({ name: item.name.slice(0, 40), query: sanitizeExplorePreset(item.query) })) : [];
  } catch { return []; }
}
export function writeExplorePresets(items: ExplorePreset[]) {
  const clean = items.slice(0, 12).map((item) => ({ name: item.name.trim().slice(0, 40), query: sanitizeExplorePreset(item.query) }));
  localStorage.setItem(key, JSON.stringify(clean));
  return clean;
}
