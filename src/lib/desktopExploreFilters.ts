export type YearScope = 'year' | 'ranking' | 'seasonal';
const yearScopes = new Set<string>(['year', 'ranking', 'seasonal']);
const storageKey = 'streamnyaa.desktop.exploreYears.v1';

export function isYearScope(mode: string): mode is YearScope { return yearScopes.has(mode); }

function validYear(value: unknown, currentYear: number): number | undefined {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1960 && year <= currentYear + 1 ? year : undefined;
}

export function rememberedExploreYear(mode: string, currentYear: number): number | undefined {
  if (!isYearScope(mode)) return undefined;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}')[mode];
    if (saved === 'all' && mode === 'ranking') return undefined;
    const year = validYear(saved, currentYear);
    if (year) return year;
    // Migrate the old unified ranking preference without restoring its shared filters.
    if (mode === 'ranking' && saved === undefined) {
      const legacyYear = validYear(new URLSearchParams(localStorage.getItem('streamnyaa.desktop.rankingFilters.v1.anilist') || '').get('year'), currentYear);
      if (legacyYear !== undefined) rememberExploreYear(mode, legacyYear);
      return legacyYear;
    }
  } catch { /* Optional device preference. */ }
  return mode === 'ranking' ? undefined : currentYear;
}

export function exploreYear(mode: string, params: URLSearchParams, currentYear: number): number | undefined {
  if (!isYearScope(mode)) return undefined;
  return params.has('year') ? validYear(params.get('year'), currentYear) : rememberedExploreYear(mode, currentYear);
}

export function rememberExploreYear(mode: string, year: number | undefined) {
  if (!isYearScope(mode)) return;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    localStorage.setItem(storageKey, JSON.stringify({ ...saved, [mode]: year ?? 'all' }));
  } catch { /* Browsing still works when preference storage is unavailable. */ }
}

export function switchExploreMode(params: URLSearchParams, currentMode: string, nextMode: string, currentYear: number) {
  if (isYearScope(currentMode)) rememberExploreYear(currentMode, exploreYear(currentMode, params, currentYear));
  const next = new URLSearchParams(params);
  next.set('mode', nextMode);
  ['q', 'page', 'year', 'season'].forEach(key => next.delete(key));
  const restored = rememberedExploreYear(nextMode, currentYear);
  if (restored !== undefined) next.set('year', String(restored));
  return next;
}
