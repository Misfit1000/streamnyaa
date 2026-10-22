export type ComparisonFact = { label: string; value: string; provider?: string; unit?: string; known: boolean };
const names = (items: any) => Array.isArray(items) ? items.map(item => typeof item === 'string' ? item : item.name).filter(Boolean).join(', ') : '';
export function comparisonFacts(anime: any): ComparisonFact[] {
  const provider = anime?.metadataProvider || (anime?.anilist_id ? 'anilist' : anime?.mal_id ? 'tenrai' : undefined);
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
  const fact = (label: string, value?: string, unit?: string, source?: string): ComparisonFact => ({ label, value: value || 'Unknown', known: Boolean(value), unit, provider: source });
  const score = number(anime?.score), popularity = number(anime?.popularity);
  const popularityKind = anime?.popularityKind || (provider === 'anilist' ? 'list-count' : provider === 'tenrai' ? 'rank' : undefined);
  return [
    fact('Score', score ? `${score.toFixed(2)} / 10` : undefined, 'score-10', provider),
    fact('Popularity', popularity && popularityKind ? popularityKind === 'list-count' ? `${popularity.toLocaleString()} users with this title on their lists` : `Rank #${popularity.toLocaleString()} on MyAnimeList` : undefined, popularityKind, provider),
    fact('Format', anime?.type), fact('Episodes', number(anime?.episodes)?.toLocaleString(), 'episodes'),
    fact('Release status', anime?.status?.replace(/_/g, ' ').toLowerCase()),
    fact('Year / season', [anime?.year, anime?.season?.toLowerCase()].filter(Boolean).join(' · ')),
    fact('Studios', names(anime?.studios)), fact('Genres', names(anime?.genres)),
  ];
}
export function comparableFacts(a: ComparisonFact, b: ComparisonFact) {
  return a.known && b.known && a.unit === b.unit && a.provider === b.provider;
}
export function compareIdentity(anime: any) {
  return anime?.mal_id ? `mal:${anime.mal_id}` : anime?.anilist_id ? `anilist:${anime.anilist_id}` : '';
}
export function parseCompareIdentity(value: string | null) {
  const match = /^(mal|anilist):([1-9]\d{0,9})$/.exec(value || '');
  return match ? { provider: match[1], id: match[2], route: match[1] === 'anilist' ? `anilist-${match[2]}` : match[2] } : undefined;
}
