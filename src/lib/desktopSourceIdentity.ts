/** Source identity is independent of display labels and torrent popularity. */
export type SourceIdentity = {
  animeId: string;
  aliases: string[];
  installmentAliases: string[];
  format: string;
  seasonNumber: number | null;
  partNumber: number | null;
  sequel: boolean;
};
export type SourceEvidence = { evidence: 'exact' | 'uncertain' | 'conflict'; reason: string; episodeMatch: boolean };
export const SOURCE_CLASSIFIER_VERSION = 3;

export function normalizeSourceTitle(value = '') {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;|&/g, ' and ').replace(/[’‘'`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
function positive(value: unknown) { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : null; }
export function seasonFromTitle(value = '') {
  return positive(value.match(/\b(?:season\s*|s)(\d{1,2})(?=\b|e\d)/i)?.[1]
    || value.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i)?.[1]);
}
export function partFromTitle(value = '') { return positive(value.match(/\b(?:part|cour)\s*(\d{1,2})\b/i)?.[1]); }
export function parseSourceEpisode(value = ''): number | null {
  const explicit = value.match(/\bs\d{1,2}e0*(\d{1,4})(?:v\d+)?\b/i)
    || value.match(/\b(?:episode|ep|e)\.?\s*0*(\d{1,4})(?:v\d+)?\b/i)
    || value.match(/\s[-–]\s*0*(\d{1,4})(?:v\d+)?(?=\D|$)/i);
  if (explicit) return positive(explicit[1]);
  const clean = value.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\b(?:season|part|cour|movie|film|ova|ona|special|vol(?:ume)?)\s*\d+\b/ig, ' ')
    .replace(/\b\d+(?:st|nd|rd|th)\s+season\b/ig, ' ');
  const final = clean.match(/(?:^|\s)0*(\d{1,4})(?:v\d+)?\s*$/i);
  const n = clean.trim().split(/\s+/).length > 1 ? positive(final?.[1]) : null;
  return n && n < 1900 ? n : null;
}
/** A contextual episode is a request, never evidence of a release's episode. */
export function sourceEpisodeIdentity(title: string, requestedEpisode?: number | string | null) {
  const episode = parseSourceEpisode(title), requested = positive(requestedEpisode);
  return { episode, conflict: Boolean(requested && episode && requested !== episode), needsReview: episode == null };
}
export function sourceAnimeTitle(value = '') {
  return normalizeSourceTitle(value.replace(/^\s*(?:\[[^\]]+\]\s*)+/, '')
    .split(/\bs\d{1,2}e\d{1,4}(?:v\d+)?\b|\b(?:episode|ep)\.?\s*\d+\b|\s[-–]\s*\d+(?:v\d+)?\b/i)[0]
    .replace(/\[[^\]]*\]|\([^)]*(?:\d{3,4}p|web|hevc|aac)[^)]*\)/ig, ' ')
    .replace(/\b(?:480|720|1080|1440|2160)p\b.*$/i, '')
    .replace(/\b(?:hevc|x26[45]|h\.?26[45]|aac|flac|web(?:[ .-]?(?:dl|rip)|(?=\s*(?:$|\d{3,4}p|dual|h[ .]?26|aac)))|bluray|bdrip|bdremux|repack|dual[ .-]?audio|jap[ .-]?eng)\b.*$/i, '')
    .replace(/\.(?:mkv|mp4|avi|webm|m2ts)\s*$/i,''));
}
function sourceTitleCandidates(value:string) {
  const segments=value.split('|');
  for(const match of value.matchAll(/\(([^)]+)\)/g))segments.push(match[1]);
  segments.push(value.replace(/\([^)]*\)/g,' '));
  return orderedSourceAliases(segments.map(sourceAnimeTitle));
}
function stripMarkers(value = '') {
  return normalizeSourceTitle(value.replace(/\b(?:season|part|cour)\s*\d+\b|\b\d+(?:st|nd|rd|th)\s+season\b|\bs\d{1,2}(?:e\d+)?\b/ig, ' '));
}
function containsTitle(value: string, alias: string) { return Boolean(alias && (` ${value} `).includes(` ${alias} `)); }
function canonicalTitleCore(value: string) {
  return stripMarkers(value).replace(/\b(?:the\s+)?(?:movie|film)\b(?!\s*\d)/g,' ').trim().replace(/\s+/g,' ').split(' ').filter(word => !/^\d{4}$/.test(word) || Number(word) < 1900 || Number(word) > 2099).join(' ');
}
function hasExactCanonicalTitle(parsed: string, aliases: string[], episode: number) {
  const core = canonicalTitleCore(parsed);
  const words = core.split(' ');
  const suffix = words.at(-1)?.match(/^(?:(?:episode|ep|e))?0*(\d+)(?:v\d+)?$/i);
  const withoutEpisode = suffix && Number(suffix[1]) === episode && words.length > 1 ? words.slice(0, -1).join(' ') : core;
  return aliases.some(alias => { const canonical = canonicalTitleCore(alias); return Boolean(canonical && (core === canonical || withoutEpisode === canonical)); });
}
export function orderedSourceAliases(values: unknown[]) {
  const seen = new Set<string>();
  return values.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map(x => x.trim()).filter(x => { const key = normalizeSourceTitle(x); if (seen.has(key)) return false; seen.add(key); return true; });
}

export function buildSourceIdentity(anime: any, installment?: { name?: string; format?: string; seasonNumber?: number | null; partNumber?: number | null; sequel?: boolean; aliases?: string[] }) : SourceIdentity {
  const title = typeof anime?.title === 'string' ? anime.title : '';
  const aliases = orderedSourceAliases([
    anime?.title_romaji, anime?.title?.romaji, anime?.title_english, anime?.title?.english, title,
    anime?.title_japanese, anime?.title?.native, installment?.name,
    ...(Array.isArray(anime?.titles) ? anime.titles.map((x: any) => x?.title || x?.name || x) : []),
    ...(anime?.synonyms || []), ...(anime?.title_synonyms || []), ...(installment?.aliases || []),
  ]);
  const seasonNumber = positive(installment?.seasonNumber) || aliases.map(seasonFromTitle).find(Boolean) || null;
  const partNumber = positive(installment?.partNumber) || aliases.map(partFromTitle).find(Boolean) || null;
  const sequel = Boolean(installment?.sequel || (seasonNumber && seasonNumber > 1) || (partNumber && partNumber > 1)
    || (anime?.relations || []).some((r: any) => /^(prequel|parent)$/i.test(r?.relation || r?.relationType || '')));
  // Only complete aliases of THIS canonical entry, never aliases imported from related entries.
  const predecessorTitles = orderedSourceAliases((anime?.relations || []).filter((r: any) => /^(prequel|parent)$/i.test(r?.relation || r?.relationType || ''))
    .flatMap((r: any) => (r?.entry || []).map((entry: any) => entry?.name || entry?.title || ''))).map(stripMarkers);
  const format=String(installment?.format || anime?.type || anime?.format || 'TV').toUpperCase();
  const allOriginalAliasesLength=aliases.length;
  // A translated franchise prefix can repeat its romanized name. Keep a
  // shortened translation only when a verified prequel establishes that prefix
  // and at least two installment-specific words remain.
  for(const alias of [...aliases])if(format==='MOVIE'&&alias.includes(':')){
    const root=alias.split(':')[0].trim(),words=normalizeSourceTitle(alias).split(' ');
    for(const previous of predecessorTitles){const prior=previous.split(' ');let common=0;while(common<words.length&&words[common]===prior[common])common++;
      const suffix=words.slice(common);if(common>=3&&root.split(/\s+/).length>=2&&suffix.length>=2&&!/^(?:part|movie|film|season|cour)\b/.test(suffix.join(' '))){ aliases.push(`${root} ${suffix.join(' ')}`); const repeated=words.slice(normalizeSourceTitle(root).split(' ').length,common);if(repeated.length>=2)aliases.push(`${repeated.join(' ')} ${suffix.join(' ')}`); }
    }
  }
  const installmentAliases = orderedSourceAliases(aliases).filter(x => seasonFromTitle(x) || partFromTitle(x)
    || format==='MOVIE' && (x.includes(':') || /\b(?:movie|film)\s*\d+\b/i.test(x) || ![...predecessorTitles].some(p=>p===stripMarkers(x))&&aliases.indexOf(x)>=allOriginalAliasesLength)
    || /\b(?:second|third|fourth|final|after story|shippuuden|shippuden|ii|iii|iv)\b/i.test(x)
    || predecessorTitles.some(predecessor => stripMarkers(x) !== predecessor && containsTitle(stripMarkers(x), predecessor)));
  return { animeId: anime?.anilist_id ? `anilist:${anime.anilist_id}` : anime?.mal_id ? `mal:${anime.mal_id}` : '',
    aliases:orderedSourceAliases(aliases), installmentAliases, format, seasonNumber, partNumber, sequel };
}
export function sourceIdentitySignature(identity: SourceIdentity) { return JSON.stringify([SOURCE_CLASSIFIER_VERSION, identity]); }

/** Desktop uses the same native validator as the background notification worker. */
export async function validateDesktopSourceCandidates<T extends { title: string }>(items: T[], identity: SourceIdentity, episode: number | null): Promise<Array<T & { nativeEvidence: SourceEvidence['evidence']; nativeIdentitySignature: string }>> {
  if (!items.length) return [];
  const invoke = typeof window !== 'undefined' ? window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke : undefined;
  if (!invoke && typeof window !== 'undefined' && (window.__STREAMNYAA_DESKTOP__ || window.__TAURI__ || window.__TAURI_INTERNALS__)) throw new Error('Native source identity validation is unavailable. Retry when the desktop connection recovers.');
  const signature = sourceIdentitySignature(identity);
  const evidence = invoke ? await invoke<SourceEvidence['evidence'][]>('classify_desktop_sources', { identity, episode, titles: items.map(item => item.title) })
    : items.map(item => classifySourceIdentity(item.title, identity, episode || parseSourceEpisode(item.title) || 1).evidence);
  if (!Array.isArray(evidence) || evidence.length !== items.length || evidence.some(value => !['exact', 'uncertain', 'conflict'].includes(value))) throw new Error('Source identity validation could not finish.');
  return items.map((item, index) => ({ ...item, nativeEvidence: evidence[index], nativeIdentitySignature: signature }));
}

export function classifySourceIdentity(title: string, identity: SourceIdentity, episode: number): SourceEvidence {
  const candidates=sourceTitleCandidates(title);
  const parsed = candidates.find(value=>hasExactCanonicalTitle(value,identity.aliases,episode)) || candidates.find(value=>identity.aliases.some(alias=>containsTitle(stripMarkers(value),stripMarkers(alias)))) || candidates[0] || '';
  const aliases = identity.aliases.map(stripMarkers).filter(Boolean);
  const titleMatch = aliases.some(alias => containsTitle(canonicalTitleCore(parsed), canonicalTitleCore(alias)));
  const episodeMatch = identity.format === 'MOVIE' || parseSourceEpisode(title) === episode;
  const conflict = (reason: string): SourceEvidence => ({ evidence: 'conflict', reason, episodeMatch });
  if (!identity.animeId || !titleMatch) return conflict('Different anime title');
  if (/\b(?:trailer|preview|creditless|ncop|nced|soundtrack|ost|pv)\b/i.test(title)) return conflict('Non-episode extra');
  const season = seasonFromTitle(title), part = partFromTitle(title);
  const movieNumber=(value:string)=>positive(value.match(/\b(?:movie|film)\s*(\d+)\b/i)?.[1]);
  const expectedMovie=identity.format==='MOVIE'?identity.aliases.map(movieNumber).find(Boolean):null;
  if(expectedMovie&&((movieNumber(title)&&movieNumber(title)!==expectedMovie)||(part&&part!==expectedMovie)))return conflict('Wrong movie installment');
  if (!identity.sequel && !identity.seasonNumber && season && season > 1) return conflict(`Unconfirmed sequel: S${season}`);
  if (identity.seasonNumber && season && identity.seasonNumber !== season) return conflict(`Wrong season: S${season}`);
  if (identity.partNumber && part && identity.partNumber !== part) return conflict(`Wrong part: Part ${part}`);
  const kind = title.match(/\b(movie|film|ova|ona|special)\b/i)?.[1]?.toUpperCase();
  if (kind && (kind === 'FILM' ? 'MOVIE' : kind) !== identity.format && !(identity.format === 'TV_SHORT' && !kind)) return conflict(`Wrong format: ${kind}`);
  if (/\b(?:batch|complete|collection|season pack)\b/i.test(title) || /(?:^|[\s\[])\d{1,4}-\d{1,4}(?:[\s\]]|$)/.test(title)) return { evidence: 'uncertain', reason: 'Batch episode files need verification', episodeMatch };
  const actualEpisode = parseSourceEpisode(title);
  if (identity.format !== 'MOVIE' && actualEpisode && actualEpisode !== episode) return conflict(`Wrong episode: ${actualEpisode}`);
  if (!identity.partNumber && part && part > 1) return { evidence: 'uncertain', reason: 'Part identity needs verification', episodeMatch };
  if (!episodeMatch) return { evidence: 'uncertain', reason: 'Episode identity needs verification', episodeMatch };
  if (!hasExactCanonicalTitle(parsed, identity.aliases, episode)) return { evidence: 'uncertain', reason: 'Release subtitle is not verified for this installment', episodeMatch };
  const matchingAliases = identity.installmentAliases.filter(alias => identity.format==='MOVIE' ? containsTitle(canonicalTitleCore(parsed),canonicalTitleCore(alias)) : containsTitle(parsed,normalizeSourceTitle(alias)));
  const installmentAlias = matchingAliases.length > 0;
  const seasonAlias = matchingAliases.some(alias => seasonFromTitle(alias) === identity.seasonNumber || !seasonFromTitle(alias) && !partFromTitle(alias));
  const partAlias = matchingAliases.some(alias => partFromTitle(alias) === identity.partNumber || !seasonFromTitle(alias) && !partFromTitle(alias));
  const seasonProven = !identity.seasonNumber || identity.seasonNumber === 1 || season === identity.seasonNumber || seasonAlias;
  const partProven = !identity.partNumber || identity.partNumber === 1 || part === identity.partNumber || partAlias;
  const sequelProven = !identity.sequel || Boolean(season === identity.seasonNumber && season && season > 1)
    || Boolean(part === identity.partNumber && part && part > 1) || installmentAlias;
  if (!seasonProven || !partProven || !sequelProven) return { evidence: 'uncertain', reason: 'Installment identity needs verification', episodeMatch };
  return { evidence: 'exact', reason: 'Same anime, installment and episode', episodeMatch };
}
