export interface ExplorePreset {
    id: string;
    name: string;
    query: string;
    createdAt: number;
    updatedAt: number;
    lastAppliedAt?: number;
}
export const explorePresetKey = 'streamnyaa-desktop-explore-presets-v2';
const legacyKey = 'streamnyaa-desktop-explore-presets-v1';
const allowed = ['mode', 'q', 'genre', 'format', 'status', 'order', 'year', 'season', 'hideCompleted', 'released'];
export function sanitizeExplorePreset(query: string) {
    const input = new URLSearchParams(query), output = new URLSearchParams();
    for (const key of allowed) {
        const value = input.get(key)?.trim();
        if (key === 'mode' && !['new', 'trending', 'popular', 'top', 'airing', 'seasonal', 'upcoming', 'year', 'ranking'].includes(value || ''))
            continue;
        if (key === 'status' && !['Airing', 'Completed', 'Upcoming'].includes(value || ''))
            continue;
        if (key === 'released' && !['7', '30', '90'].includes(value || ''))
            continue;
        if (key === 'year' && !/^(19|20|21)\d{2}$/.test(value || ''))
            continue;
        if (value && value.length <= 200 && !['Any', 'all'].includes(value) && !(key === 'order' && value === 'best') && !(key === 'hideCompleted' && value !== '1'))
            output.set(key, value);
    }
    return output.toString();
}
export function presetSummary(query: string) {
    const p = new URLSearchParams(sanitizeExplorePreset(query));
    const mode = p.get('mode') || 'popular';
    return [mode === 'new' ? 'New episodes' : mode === 'ranking' ? 'Top 100' : mode.charAt(0).toUpperCase() + mode.slice(1), ...['q', 'genre', 'format', 'status', 'year', 'season'].map(k => p.get(k)), p.has('released') ? `Past ${p.get('released')} days` : '', p.has('hideCompleted') ? 'Hide completed' : ''].filter(Boolean).join(' · ');
}
export function meaningfulPreset(query: string) { return Boolean(sanitizeExplorePreset(query).replace(/^mode=popular$/, '')); }
function normalize(items: unknown): ExplorePreset[] {
    if (!Array.isArray(items))
        return [];
    return items.filter(item => typeof item?.name === 'string' && item.name.trim() && typeof item.query === 'string').slice(0, 12).map(item => ({ id: typeof item.id === 'string' ? item.id : crypto.randomUUID(), name: item.name.trim().slice(0, 40), query: sanitizeExplorePreset(item.query), createdAt: Number(item.createdAt) || Date.now(), updatedAt: Number(item.updatedAt) || Date.now(), lastAppliedAt: Number(item.lastAppliedAt) || undefined }));
}
export function readExplorePresets(): ExplorePreset[] {
    try {
        const stored = localStorage.getItem(explorePresetKey);
        if (stored !== null)
            return normalize(JSON.parse(stored).items);
        const items = normalize(JSON.parse(localStorage.getItem(legacyKey) || '[]'));
        if (items.length) { try { localStorage.setItem(explorePresetKey, JSON.stringify({ version: 2, items })); } catch { /* Keep legacy presets usable if storage is full. */ } }
        return items;
    }
    catch {
        return [];
    }
}
export function writeExplorePresets(items: (Partial<ExplorePreset> & Pick<ExplorePreset, 'name' | 'query'>)[]) {
    const clean = normalize(items);
    localStorage.setItem(explorePresetKey, JSON.stringify({ version: 2, items: clean }));
    return clean;
}
