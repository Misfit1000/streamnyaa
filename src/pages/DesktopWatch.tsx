import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Loader2, Play, Search, SlidersHorizontal, Star } from 'lucide-react';
import Seo from '../components/Seo';
import { fetchAnimeDetails, fetchAnimeEpisodes } from '../api/jikan';
import { dedupeNyaaItems, searchNyaa, type NyaaItem } from '../api/nyaa';
import { desktopWatchPath } from '../lib/desktopAnimeRoute';
import { getTorrentBadges, torrentBadgeClassName } from '../lib/torrentBadges';
import {
  findLocalPlaybackHistoryItem,
  formatPlaybackTime,
  getLocalPlaybackProgress,
  loadDesktopAutoOpenBestSource,
  loadDesktopAudioPreference,
  openLocalSourceNow,
  saveDesktopAutoOpenBestSource,
  saveDesktopAudioPreference,
  stopDesktopPlayback,
  subscribeDesktopAutoOpenBestSource,
  updateLocalPlaybackHistoryProgress,
  watchTypeForAudioPreference,
  type DesktopAudioPreference,
  type DesktopPlaybackProgress,
  type LocalPlaybackSource,
} from '../lib/desktop';

type AudioMode = 'sub' | 'dub';
type SourceSort = 'best' | 'seeders' | 'size';
type SourceFilterMode = 'strict' | 'balanced' | 'broad';
type SourceMatchTier = 'exact' | 'likely' | 'broad' | 'rejected';
type SourcePlayableStatus = 'verified' | 'untested' | 'low-seed' | 'likely-wrong' | 'unsupported';
type EpisodeViewMode = 'cards' | 'grid';
type PlaybackNotice = { tone: 'loading' | 'success' | 'error'; text: string };
type PlaybackStageView = { headline: string; detail: string; progress: number; step: 1 | 2 | 3 | 4; status: string };
type EpisodeMetaEntry = {
  title?: string;
  title_english?: string;
  title_romanji?: string;
  image?: string;
  thumbnail?: string;
};
type InstallmentKind = 'season' | 'movie' | 'ova' | 'ona' | 'special' | 'other';
type InstallmentItem = {
  mal_id: string | number;
  anilist_id: string | number | null;
  name: string;
  current: boolean;
  format: string;
  year: number | null;
  seasonNumber: number | null;
  sourceSeasonNumber: number | null;
  partNumber: number | null;
  relation?: string;
  kind: InstallmentKind;
  label: string;
};
type RankedNyaaItem = NyaaItem & {
  matchTier: SourceMatchTier;
  matchReasons: string[];
  playableStatus: SourcePlayableStatus;
  playableLabel: string;
  playable: boolean;
};

const EPISODE_WINDOW_SIZE = 72;
const EPISODE_GRID_PAGE_SIZE = 120;
const EPISODE_CARD_SEARCH_LIMIT = 36;
const AUTO_COMPACT_EPISODE_THRESHOLD = 180;
const SOURCE_QUERY_BATCH_SIZE = 3;
const SOURCE_RETRY_LIMIT = 5;
const FAILED_SOURCE_MEMORY_KEY = 'streamnyaa.desktopFailedSources';
const FAILED_SOURCE_MEMORY_TTL = 1000 * 60 * 20;
const FAILED_SOURCE_MEMORY_LIMIT = 80;
const ALLOWED_INSTALLMENT_KINDS = new Set<InstallmentKind>(['season', 'movie', 'ova', 'ona', 'special']);
const CORE_SEASON_RELATIONS = new Set(['PREQUEL', 'SEQUEL']);
const ANCILLARY_SOURCE_PATTERNS = [
  /\b(?:nc)?op(?:ening)?\b/i,
  /\b(?:nc)?ed(?:ing)?\b/i,
  /\bcreditless\b/i,
  /\bkaraoke\b/i,
  /\bpreview\b/i,
  /\btrailer\b/i,
  /\bpv\b/i,
  /\bteaser\b/i,
  /\bost\b/i,
  /\bsoundtrack\b/i,
];
type SourceFailureRecord = {
  failedAt: number;
  message: string;
  animeId?: string | number;
  episode?: number;
};

function posterFor(anime: any) {
  const fallbackId = Number(anime?.anilist_id || anime?.id || 0);
  const fallbackCover = fallbackId > 0 ? `https://img.anili.st/media/${fallbackId}` : '';
  return anime?.images?.webp?.large_image_url
    || anime?.images?.jpg?.large_image_url
    || anime?.images?.jpg?.image_url
    || fallbackCover
    || '';
}

function wideImageFor(anime: any) {
  return anime?.banner_image
    || anime?.trailer?.images?.maximum_image_url
    || posterFor(anime);
}

function uniqueImageCandidates(values: Array<string | undefined | null>) {
  return values
    .map((value) => String(value || '').trim())
    .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
}

function imageCandidatesFor(anime: any, wide = false) {
  return uniqueImageCandidates(wide ? [
    anime?.banner_image,
    anime?.trailer?.images?.maximum_image_url,
    anime?.images?.webp?.large_image_url,
    anime?.images?.jpg?.large_image_url,
    anime?.images?.jpg?.image_url,
  ] : [
    anime?.images?.webp?.large_image_url,
    anime?.images?.jpg?.large_image_url,
    anime?.images?.jpg?.image_url,
    anime?.banner_image,
    anime?.trailer?.images?.maximum_image_url,
  ]);
}

function SafeImage({
  candidates,
  alt,
  className,
  fallbackClassName,
}: {
  candidates: string[];
  alt: string;
  className: string;
  fallbackClassName?: string;
}) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const current = candidates[index] || '';

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [candidates.join('|')]);

  if (!current || failed) {
    return (
      <div className={fallbackClassName || className}>
        <div className="flex h-full w-full items-end bg-[radial-gradient(circle_at_34%_18%,rgba(225,29,72,0.38),transparent_36%),linear-gradient(145deg,#1a1016,#060609)] p-4">
          <span className="line-clamp-3 text-sm font-black leading-tight text-white/76">{alt || 'Anime'}</span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={current}
      alt={alt}
      className={className}
      decoding="async"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        setIndex((value) => {
          if (value < candidates.length - 1) return value + 1;
          setFailed(true);
          return value;
        });
      }}
    />
  );
}

function titleFromRoute(id = '') {
  const raw = decodeURIComponent(String(id))
    .replace(/^\d+-?/, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return 'Anime';
  return raw.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fallbackAnimeFromRoute(id = '') {
  const numeric = Number(String(id).match(/^\d+/)?.[0] || 0);
  const title = titleFromRoute(id);
  return {
    id: numeric || id,
    mal_id: numeric || id,
    anilist_id: numeric || null,
    title,
    title_romaji: title,
    title_english: title,
    images: { jpg: {}, webp: {} },
    banner_image: '',
    synopsis: 'Metadata could not be loaded, but source search is still available for this title.',
    episodes: null,
    status: 'UNKNOWN',
    score: 0,
    type: 'TV',
    year: null,
    genres: [],
    streamingEpisodes: [],
    nextAiringEpisode: null,
    relations: [],
  };
}

function cleanTitle(value = '') {
  return value.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleForInstallment(item: any) {
  const structuredTitle = item?.title && typeof item.title === 'object'
    ? item.title?.english || item.title?.romaji || item.title?.native
    : '';
  return String(
    item?.name
      || item?.title_english
      || item?.title_romaji
      || structuredTitle
      || (typeof item?.title === 'string' ? item.title : '')
      || '',
  ).trim();
}

function sourceFailureKey(source: Pick<NyaaItem, 'infoHash' | 'magnet' | 'title'>) {
  const hash = String(source.infoHash || '').trim().toLowerCase();
  if (hash) return `hash:${hash}`;
  const magnetHash = String(source.magnet || '').match(/btih:([a-z0-9]+)/i)?.[1];
  if (magnetHash) return `hash:${magnetHash.toLowerCase()}`;
  const normalizedTitle = cleanTitle(source.title || '').toLowerCase();
  return normalizedTitle ? `title:${normalizedTitle.slice(0, 180)}` : '';
}

function isObsoleteLargeSourceFailure(message = '') {
  return /too large for reliable desktop streaming|choose a smaller release|large_source/i.test(message);
}

function compactSourceFailures(records: Record<string, SourceFailureRecord>) {
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(records)
      .filter(([, record]) => now - Number(record.failedAt || 0) <= FAILED_SOURCE_MEMORY_TTL)
      .filter(([, record]) => !isObsoleteLargeSourceFailure(record.message || ''))
      .sort((left, right) => Number(right[1].failedAt || 0) - Number(left[1].failedAt || 0))
      .slice(0, FAILED_SOURCE_MEMORY_LIMIT),
  ) as Record<string, SourceFailureRecord>;
}

function loadSourceFailureRecords() {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(FAILED_SOURCE_MEMORY_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return compactSourceFailures(parsed as Record<string, SourceFailureRecord>);
  } catch {
    return {};
  }
}

function saveSourceFailureRecords(records: Record<string, SourceFailureRecord>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FAILED_SOURCE_MEMORY_KEY, JSON.stringify(compactSourceFailures(records)));
  } catch {
    // Failure memory only affects ranking. Playback should never depend on local storage.
  }
}

function rememberSourceFailure(
  source: RankedNyaaItem,
  message: string,
  context: { animeId?: string | number; episode?: number },
) {
  const key = sourceFailureKey(source);
  if (!key) return;
  if (isObsoleteLargeSourceFailure(message)) return;
  const records = loadSourceFailureRecords();
  records[key] = {
    failedAt: Date.now(),
    message: message.slice(0, 220),
    animeId: context.animeId,
    episode: context.episode,
  };
  saveSourceFailureRecords(records);
}

function forgetSourceFailure(source: RankedNyaaItem) {
  const key = sourceFailureKey(source);
  if (!key) return;
  const records = loadSourceFailureRecords();
  if (!records[key]) return;
  delete records[key];
  saveSourceFailureRecords(records);
}

function sourceFailureFor(source: RankedNyaaItem, records: Record<string, SourceFailureRecord>) {
  const key = sourceFailureKey(source);
  return key ? records[key] || null : null;
}

function sourceFailurePenalty(source: RankedNyaaItem, records: Record<string, SourceFailureRecord>) {
  const record = sourceFailureFor(source, records);
  if (!record) return 0;
  const ageRatio = Math.max(0, Math.min(1, (Date.now() - record.failedAt) / FAILED_SOURCE_MEMORY_TTL));
  return Math.round(80 * (1 - ageRatio));
}

function uniqueTextValues(values: Array<string | undefined | null>) {
  return values.filter((value, index, list): value is string => Boolean(value?.trim()) && list.indexOf(value) === index);
}

function seasonNumberFromText(value = '') {
  const match = value.match(/\bseason\s+(\d{1,2})\b/i)
    || value.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i);
  const number = Number(match?.[1] || 0);
  return number > 0 ? number : null;
}

function partNumberFromText(value = '') {
  const match = value.match(/\bpart\s+(\d{1,2})\b/i)
    || value.match(/\bcour\s+(\d{1,2})\b/i);
  const number = Number(match?.[1] || 0);
  return number > 0 ? number : null;
}

function stripSeasonDecorators(value = '') {
  return cleanTitle(
    value
      .replace(/\bseason\s+\d{1,2}\b/ig, ' ')
      .replace(/\b\d{1,2}(?:st|nd|rd|th)\s+season\b/ig, ' ')
      .replace(/\bpart\s+\d{1,2}\b/ig, ' ')
      .replace(/\bcour\s+\d{1,2}\b/ig, ' ')
      .replace(/\bfinal\s+season\b/ig, ' ')
      .replace(/\(\d{4}\)/g, ' ')
  );
}

function seriesRootTitle(value = '') {
  const cleaned = stripSeasonDecorators(value)
    .replace(/\b(?:movie|film|ova|ona|special)s?\b/ig, ' ');
  const segments = cleaned.split(/\s*[:：-]\s*/).map((segment) => cleanTitle(segment)).filter(Boolean);
  const firstSegment = segments[0] || '';
  const root = firstSegment.length >= 4 && firstSegment.split(' ').filter((token) => token.length > 1).length >= 1
    ? firstSegment
    : cleaned;
  return cleanTitle(root || value).toLowerCase();
}

function sameSeriesFamily(rootTitle = '', nextTitle = '') {
  const root = seriesRootTitle(rootTitle);
  const next = seriesRootTitle(nextTitle);
  if (!root || !next) return false;
  if (root === next) return true;
  if (root.length >= 8 && next.includes(root)) return true;
  if (next.length >= 8 && root.includes(next)) return true;
  const rootTokens = root.split(' ').filter((token) => token.length > 2);
  const nextTokens = new Set(next.split(' ').filter((token) => token.length > 2));
  if (rootTokens.length < 2 || nextTokens.size < 2) return false;
  const hits = rootTokens.filter((token) => nextTokens.has(token)).length;
  return hits >= Math.min(3, rootTokens.length);
}

function hasSeasonTitleSignal(value = '') {
  return Boolean(
    seasonNumberFromText(value)
      || partNumberFromText(value)
      || /\b(final\s+season|cour\s+\d+|part\s+\d+)\b/i.test(value),
  );
}

function sourceSearchTitleVariants(anime: any, routeId = '', installment?: InstallmentItem | null) {
  const routeTitle = titleFromRoute(routeId);
  const raw = uniqueTextValues([
    installment?.name,
    anime?.title_romaji,
    anime?.title_english,
    anime?.title,
    routeTitle,
  ]);

  return uniqueTextValues(raw.flatMap((title) => {
    const cleaned = cleanTitle(title);
    const stripped = stripSeasonDecorators(title);
    return [title, cleaned, stripped];
  }));
}

function sourceSearchSeasonHints(anime: any, routeId = '', installment?: InstallmentItem | null) {
  return uniqueTextValues([
    installment?.name,
    anime?.title_romaji,
    anime?.title_english,
    anime?.title,
    titleFromRoute(routeId),
  ])
    .map((title) => seasonNumberFromText(title))
    .concat(installment?.seasonNumber || 0)
    .concat(installment?.sourceSeasonNumber || 0)
    .filter((value, index, list): value is number => Boolean(value) && list.indexOf(value) === index);
}

function sourceSearchPartHints(anime: any, routeId = '', installment?: InstallmentItem | null) {
  return uniqueTextValues([
    installment?.name,
    anime?.title_romaji,
    anime?.title_english,
    anime?.title,
    titleFromRoute(routeId),
  ])
    .map((title) => partNumberFromText(title))
    .concat(installment?.partNumber || 0)
    .filter((value, index, list): value is number => Boolean(value) && list.indexOf(value) === index);
}

function sourceAliasVariants(anime: any, routeId = '', installment?: InstallmentItem | null) {
  return sourceSearchTitleVariants(anime, routeId, installment)
    .map((title) => stripSeasonDecorators(title) || cleanTitle(title))
    .map((title) => cleanTitle(title).toLowerCase())
    .filter((title, index, list) => title.length >= 4 && list.indexOf(title) === index);
}

function sourceTitleMatchesAlias(title = '', aliases: string[]) {
  const normalizedTitle = cleanTitle(title).toLowerCase();
  if (!normalizedTitle || !aliases.length) return false;
  return aliases.some((alias) => {
    if (normalizedTitle.includes(alias)) return true;
    const tokens = alias.split(' ').filter((token) => token.length >= 3);
    if (tokens.length < 2) return false;
    const matched = tokens.filter((token) => normalizedTitle.includes(token)).length;
    return matched / tokens.length >= 0.78;
  });
}

function isDubSource(title = '') {
  return /\b(dub|dubbed|dual[\s-]?audio|multi[\s-]?audio|english[\s-]?audio|eng[\s-]?dub)\b/i.test(title);
}

function isDubOnlySource(title = '') {
  return /\b(dub|dubbed|english[\s-]?dub|eng[\s-]?dub)\b/i.test(title)
    && !/\b(dual[\s-]?audio|multi[\s-]?audio)\b/i.test(title);
}

function isDualAudioSource(title = '') {
  return /\b(dual[\s-]?audio|multi[\s-]?audio)\b/i.test(title);
}

function isBatchSource(title = '') {
  return /\b(batch|complete\s+(?:season|series)|season\s+pack|collection)\b/i.test(title)
    || /\b\d{1,3}\s*-\s*\d{1,3}\b/.test(title);
}

function isAncillarySource(title = '') {
  return ANCILLARY_SOURCE_PATTERNS.some((pattern) => pattern.test(title));
}

function hasEpisodeSignal(title = '', episode: number) {
  const ep = String(episode);
  const padded = ep.padStart(2, '0');
  const compact = title.replace(/\s+/g, ' ');
  const sanitized = compact
    .replace(/\bseason\s+0?\d{1,3}\b/ig, ' ')
    .replace(/\b\d{1,3}(?:st|nd|rd|th)\s+season\b/ig, ' ')
    .replace(/\b(?:movie|film|ova|ona|special|part|cour|vol(?:ume)?)\s+0?\d{1,3}\b/ig, ' ')
    .replace(/\b(?:720|1080|2160)p\b/ig, ' ')
    .replace(/\bx26[45]\b/ig, ' ')
    .replace(/\bh\.?26[45]\b/ig, ' ');
  return [
    new RegExp(`\\bS\\d{1,2}E${padded}\\b`, 'i'),
    new RegExp(`\\bE${padded}\\b`, 'i'),
    new RegExp(`\\bEP?\\.?\\s*${ep}\\b`, 'i'),
    new RegExp(`(?:^|[\\s._\\-\\[\\(])0?${ep}(?:v\\d+)?(?:[\\s._\\-\\]\\)]|$)`, 'i'),
  ].some((pattern) => pattern.test(sanitized));
}

function sourceInstallmentKind(title = ''): InstallmentKind | null {
  if (/\b(movie|film|gekijouban)\b/i.test(title)) return 'movie';
  if (/\bova\b/i.test(title)) return 'ova';
  if (/\bona\b/i.test(title)) return 'ona';
  if (/\bspecial\b/i.test(title)) return 'special';
  if (/\bseason\s+\d{1,2}\b/i.test(title) || /\b\d{1,2}(?:st|nd|rd|th)\s+season\b/i.test(title) || /\bS\d{1,2}E\d{1,4}\b/i.test(title)) return 'season';
  return null;
}

function sourceSeasonNumber(title = '') {
  const sxe = title.match(/\bS(\d{1,2})E\d{1,4}\b/i);
  if (sxe) {
    const number = Number(sxe[1] || 0);
    if (number > 0) return number;
  }
  return seasonNumberFromText(title);
}

function sourcePartNumber(title = '') {
  return partNumberFromText(title);
}

function sourceOrdinalForKind(title = '', kind: InstallmentKind) {
  const kindPattern = kind === 'movie'
    ? '(?:movie|film|gekijouban)'
    : kind === 'special'
      ? 'special'
      : kind;
  const match = title.match(new RegExp(`\\b${kindPattern}\\s*0?(\\d{1,2})\\b`, 'i'));
  const number = Number(match?.[1] || 0);
  return number > 0 ? number : null;
}

function installmentOrdinal(item: InstallmentItem | null) {
  if (!item) return null;
  if (item.kind === 'season') return item.seasonNumber;
  const match = item.label.match(/\b(\d{1,2})\b/);
  const number = Number(match?.[1] || 0);
  return number > 0 ? number : null;
}

function sourceMatchesInstallment(title = '', installment: InstallmentItem | null) {
  if (!installment) return true;
  const explicitKind = sourceInstallmentKind(title);
  if (installment.kind === 'season') {
    if (explicitKind && explicitKind !== 'season') return false;
    const seasonNumber = installment.seasonNumber || installment.sourceSeasonNumber;
    const partNumber = installment.partNumber;
    const sourceSeason = sourceSeasonNumber(title);
    const sourcePart = sourcePartNumber(title);

    if (seasonNumber && sourceSeason && sourceSeason !== seasonNumber) return false;
    if (partNumber && sourcePart && sourcePart !== partNumber) return false;
    if (partNumber && seasonNumber && sourceSeason === seasonNumber && !sourcePart) return false;
    return true;
  }

  if (installment.kind === 'ova' || installment.kind === 'ona' || installment.kind === 'special') {
    if (explicitKind && explicitKind !== installment.kind) return false;
  }

  return true;
}

function sourceInstallmentMismatchReason(title = '', installment: InstallmentItem | null) {
  if (!installment) return '';
  const explicitKind = sourceInstallmentKind(title);
  const sourceSeason = sourceSeasonNumber(title);
  const sourcePart = sourcePartNumber(title);

  if (installment.kind === 'season') {
    if (explicitKind && explicitKind !== 'season') return `Wrong format: ${explicitKind}`;
    const expectedSeason = installment.seasonNumber || installment.sourceSeasonNumber;
    if (expectedSeason && sourceSeason && sourceSeason !== expectedSeason) {
      return `Wrong season: S${sourceSeason}`;
    }
    if (installment.partNumber && sourcePart && sourcePart !== installment.partNumber) {
      return `Wrong part: Part ${sourcePart}`;
    }
    return '';
  }

  if (installment.kind === 'movie' || installment.kind === 'ova' || installment.kind === 'ona' || installment.kind === 'special') {
    if (explicitKind && explicitKind !== installment.kind) return `Wrong format: ${explicitKind}`;
    if (explicitKind === 'season' || sourceSeason) return 'TV episode source';
    const expectedOrdinal = installmentOrdinal(installment);
    const sourceOrdinal = sourceOrdinalForKind(title, installment.kind);
    if (expectedOrdinal && sourceOrdinal && sourceOrdinal !== expectedOrdinal) {
      return `Wrong ${installment.kind}: ${sourceOrdinal}`;
    }
  }

  return '';
}

function sourceHasValidInput(source: NyaaItem) {
  const hasHash = Boolean(source.infoHash && /^[a-z0-9]{32,40}$/i.test(source.infoHash));
  const hasMagnet = Boolean(source.magnet && /^magnet:\?xt=urn:btih:/i.test(source.magnet));
  return hasHash || hasMagnet;
}

function classifySource(
  source: NyaaItem,
  context: {
    anime: any;
    routeId?: string;
    installment: InstallmentItem | null;
    episode: number;
  },
): RankedNyaaItem {
  const reasons: string[] = [];
  const title = source.title || '';
  const aliases = sourceAliasVariants(context.anime, context.routeId, context.installment);
  const titleMatch = sourceTitleMatchesAlias(title, aliases);
  const explicitKind = sourceInstallmentKind(title);
  const sourceSeason = sourceSeasonNumber(title);
  const sourcePart = sourcePartNumber(title);
  const episodeMatch = context.installment?.kind === 'movie'
    ? true
    : hasEpisodeSignal(title, context.episode);
  const mismatchReason = sourceInstallmentMismatchReason(title, context.installment);
  const validInput = sourceHasValidInput(source);
  const seeded = source.rawSeeders > 0;
  const videoSized = source.rawSize > 0 && source.rawSize <= 3 * 1024 * 1024 * 1024;
  const expectedSourceSeason = context.installment?.seasonNumber || context.installment?.sourceSeasonNumber || null;
  const laterSeasonNeedsSeasonSignal = context.installment?.kind === 'season'
    && Boolean(expectedSourceSeason && expectedSourceSeason > 1);
  const hasRequiredSeasonSignal = !laterSeasonNeedsSeasonSignal
    || sourceSeason === expectedSourceSeason
    || sourceTitleMatchesAlias(title, [cleanTitle(context.installment?.name || '').toLowerCase()].filter(Boolean));
  const hasRequiredPartSignal = !context.installment?.partNumber
    || sourcePart === context.installment.partNumber
    || /\b(part|cour)\b/i.test(title);
  let matchTier: SourceMatchTier = 'rejected';

  if (isBatchSource(title)) reasons.push('Batch source');
  if (isAncillarySource(title)) reasons.push('Non-episode extra');
  if (!validInput) reasons.push('Torrent hash missing');
  if (!seeded) reasons.push('No seeders');
  if (!titleMatch) reasons.push('Loose title match');
  if (mismatchReason) reasons.push(mismatchReason);
  if (episodeMatch) reasons.push(context.installment?.kind === 'movie' ? 'Movie match' : 'Exact episode');
  if (explicitKind) reasons.push(explicitKind === 'season' ? 'TV season' : explicitKind.toUpperCase());
  if (laterSeasonNeedsSeasonSignal && !hasRequiredSeasonSignal) reasons.push('Missing season signal');
  if (context.installment?.partNumber && !hasRequiredPartSignal) reasons.push('Missing part signal');
  if (context.installment?.label) reasons.push(context.installment.label);
  if (videoSized) reasons.push('Sane size');

  if (!isBatchSource(title) && !isAncillarySource(title) && validInput && titleMatch && !mismatchReason) {
    if (episodeMatch && seeded && hasRequiredSeasonSignal && hasRequiredPartSignal) matchTier = 'exact';
    else if (episodeMatch || seeded) matchTier = 'likely';
    else matchTier = 'broad';
  } else if (!isBatchSource(title) && !isAncillarySource(title) && validInput && !mismatchReason && episodeMatch) {
    matchTier = 'broad';
  }

  const structurallyPlayable = validInput
    && seeded
    && !isBatchSource(title)
    && !isAncillarySource(title)
    && !mismatchReason
    && matchTier !== 'rejected';
  const playableStatus: SourcePlayableStatus = !validInput
    ? 'unsupported'
    : mismatchReason || (!titleMatch && matchTier !== 'broad')
      ? 'likely-wrong'
      : !seeded
        ? 'low-seed'
        : matchTier === 'exact'
          ? 'verified'
          : 'untested';
  const playable = structurallyPlayable;
  const playableLabel = playableStatus === 'verified'
    ? 'Verified'
    : playableStatus === 'low-seed'
      ? 'Low seed'
      : playableStatus === 'unsupported'
        ? 'Unsupported'
        : playableStatus === 'likely-wrong'
          ? 'Likely wrong'
          : matchTier === 'broad'
            ? 'Wide match'
            : 'Untested';

  return {
    ...source,
    matchTier,
    matchReasons: reasons.filter((reason, index, list) => Boolean(reason) && list.indexOf(reason) === index),
    playableStatus,
    playableLabel,
    playable,
  };
}

function sourceTierWeight(tier: SourceMatchTier) {
  switch (tier) {
    case 'exact': return 0;
    case 'likely': return 1;
    case 'broad': return 2;
    default: return 3;
  }
}

function installmentDiscoveryKind(format = ''): InstallmentKind | null {
  const kind = installmentKindFor(format);
  if (kind === 'season' || kind === 'movie' || kind === 'ova' || kind === 'ona' || kind === 'special') return kind;
  return null;
}

function relationEntriesForGraph(anime: any) {
  return (anime?.relations || [])
    .flatMap((relation: any) => (relation?.entry || []).map((entry: any) => ({
      ...entry,
      relation: entry?.relation || relation?.relation || '',
    })))
    .filter((entry: any) => {
      if (!entry?.mal_id && !entry?.id) return false;
      const format = normalizeInstallmentFormat(entry?.format || entry?.type || 'TV');
      const kind = installmentDiscoveryKind(format);
      const mediaType = String(entry?.type || '').toUpperCase();
      if (!kind) return false;
      if (mediaType && !['ANIME', 'TV', 'TV_SHORT', 'OVA', 'ONA', 'SPECIAL', 'MOVIE'].includes(mediaType)) return false;
      return true;
    });
}

function relationTypeAllowed(entry: any, currentKind: InstallmentKind) {
  const relationType = String(entry?.relation || '').toUpperCase();
  if (!relationType) return false;
  if (currentKind === 'season') return CORE_SEASON_RELATIONS.has(relationType);
  return ['PREQUEL', 'SEQUEL', 'PARENT'].includes(relationType);
}

function installmentDiscoveryPriority(entry: any, displayKinds: Set<InstallmentKind>) {
  const format = normalizeInstallmentFormat(entry?.format || entry?.type || 'TV');
  const kind = installmentKindFor(format);
  if (displayKinds.has(kind)) return 0;
  if (kind === 'movie') return 2;
  return 1;
}

function isPartiallySplitSeason(item: Omit<InstallmentItem, 'label'>) {
  return item.kind === 'season' && Boolean(item.seasonNumber && item.partNumber);
}

function installmentTitleScore(item: Omit<InstallmentItem, 'label'>) {
  const normalized = String(item.name || '').toLowerCase();
  let score = 0;
  if (/\bpart\s+\d+\b/.test(normalized) || /\bcour\s+\d+\b/.test(normalized)) score += 20;
  if (/\bseason\s+\d+\b/.test(normalized) || /\b\d+(?:st|nd|rd|th)\s+season\b/.test(normalized)) score += 12;
  if (/\bdirector'?s cut\b|\brecap\b|\bcompilation\b|\bdigest\b|\bsummary\b|\btv edit(?:ion)?\b/.test(normalized)) score -= 40;
  return score;
}

function installmentIdentity(item: Omit<InstallmentItem, 'label'>) {
  if (item.kind === 'season') {
    if (item.seasonNumber && item.partNumber) return `season:${item.seasonNumber}:part:${item.partNumber}`;
    if (item.seasonNumber) return `season:${item.seasonNumber}`;
  }
  const normalizedTitle = cleanTitle(stripSeasonDecorators(item.name || '')).toLowerCase();
  return `${item.kind}:${normalizedTitle || item.year || item.mal_id}`;
}

function preferInstallmentCandidate(
  currentItem: Omit<InstallmentItem, 'label'>,
  nextItem: Omit<InstallmentItem, 'label'>,
) {
  if (nextItem.current && !currentItem.current) return nextItem;
  if (isPartiallySplitSeason(nextItem) && !isPartiallySplitSeason(currentItem)) return nextItem;
  if (nextItem.seasonNumber && !currentItem.seasonNumber) return nextItem;
  if (!currentItem.year && nextItem.year) return nextItem;
  if (installmentTitleScore(nextItem) > installmentTitleScore(currentItem)) return nextItem;
  return currentItem;
}

function knownAiredEpisodeCount(anime: any, episodeItems: any[] = []) {
  const pageMax = episodeItems.length
    ? Math.max(...episodeItems.map((episode: any) => Number(episode?.mal_id) || 0))
    : 0;
  if (anime?.nextAiringEpisode?.episode) return Math.max(Number(anime.nextAiringEpisode.episode) - 1, pageMax, 0);
  if (String(anime?.status || '').toUpperCase() === 'FINISHED') return Math.max(Number(anime?.episodes || 1), pageMax, 1);
  if (String(anime?.status || '').toUpperCase() === 'RELEASING') {
    return Math.max(Number(anime?.episodes || 0), Number(anime?.streamingEpisodes?.length || 0), pageMax, 1);
  }
  return Math.max(pageMax, Number(anime?.episodes || 0), 0);
}

function episodeNumberFromTitle(value = '') {
  const match = value.match(/\bepisode\s+(\d{1,4})\b/i) || value.match(/(?:^|[\s._-])(\d{1,4})(?:[\s._-]|$)/);
  const number = Number(match?.[1] || 0);
  return number > 0 ? number : null;
}

function sourceScore(source: NyaaItem, audioPreference: DesktopAudioPreference, audioMode: AudioMode) {
  let score = 0;
  if (audioMode === 'sub') {
    if (!isDubOnlySource(source.title)) score += 24;
  } else if (audioPreference === 'dub-only') {
    if (isDubOnlySource(source.title)) score += 44;
    else if (isDualAudioSource(source.title)) score += 18;
    else if (isDubSource(source.title)) score += 10;
  } else {
    if (isDualAudioSource(source.title)) score += 44;
    else if (isDubSource(source.title)) score += 24;
  }
  if (isTrustedSource(source)) score += 25;
  if (/\b1080p\b/i.test(source.title)) score += 20;
  if (source.rawSeeders >= 100) score += 20;
  else if (source.rawSeeders >= 50) score += 14;
  else if (source.rawSeeders >= 15) score += 8;
  if (/\b(hevc|h\.?265|x265)\b/i.test(source.title)) score += 6;
  if (source.rawSize > 0 && source.rawSize < 5 * 1024 * 1024 * 1024) score += 5;
  return score + Number(source.sourceScore || 0);
}

function isTrustedSource(source: NyaaItem) {
  return /\btrusted\b/i.test(String(source.trusted || ''));
}

function sourceQualityReasons(
  source: NyaaItem,
  episode: number,
  audioPreference: DesktopAudioPreference,
  audioMode: AudioMode,
) {
  const reasons: string[] = [];
  if (hasEpisodeSignal(source.title, episode)) reasons.push('Exact episode');
  if (isDualAudioSource(source.title)) reasons.push('Dual audio');
  else if (isDubOnlySource(source.title)) reasons.push('Dub');
  else if (audioMode === 'sub' || audioPreference === 'sub-preferred') reasons.push('Sub-safe');
  if (isTrustedSource(source)) reasons.push('Trusted');
  if (source.rawSeeders >= 100) reasons.push('Fast start');
  else if (source.rawSeeders >= 50) reasons.push('Stable peers');
  else if (source.rawSeeders >= 15) reasons.push('Usable peers');
  if (/\b1080p\b/i.test(source.title)) reasons.push('1080p');
  if (/\b(hevc|h\.?265|x265)\b/i.test(source.title)) reasons.push('HEVC');
  if (source.rawSize > 0 && source.rawSize <= 5 * 1024 * 1024 * 1024) reasons.push('Sane size');
  return reasons.filter((reason, index, list) => list.indexOf(reason) === index).slice(0, 6);
}

function torrentUrlFor(source: NyaaItem) {
  const link = String(source.link || '').trim();
  const viewMatch = link.match(/nyaa\.si\/view\/(\d+)/i);
  if (viewMatch) return `https://nyaa.si/download/${viewMatch[1]}.torrent`;
  return link;
}

function normalizeInstallmentFormat(value = '') {
  const format = String(value || '').toUpperCase();
  if (format === 'TV_SHORT') return 'TV';
  return format || 'TV';
}

function installmentKindFor(format = ''): InstallmentKind {
  const normalized = normalizeInstallmentFormat(format);
  if (normalized === 'TV') return 'season';
  if (normalized === 'MOVIE') return 'movie';
  if (normalized === 'OVA') return 'ova';
  if (normalized === 'ONA') return 'ona';
  if (normalized === 'SPECIAL') return 'special';
  return 'other';
}

function installmentSortWeight(kind: InstallmentKind) {
  switch (kind) {
    case 'season': return 0;
    case 'movie': return 1;
    case 'ova': return 2;
    case 'ona': return 3;
    case 'special': return 4;
    default: return 5;
  }
}

function displayKindsFor(currentKind: InstallmentKind) {
  if (currentKind === 'season') return new Set<InstallmentKind>(['season']);
  if (currentKind === 'movie') return new Set<InstallmentKind>(['movie']);
  if (currentKind === 'ova') return new Set<InstallmentKind>(['ova']);
  if (currentKind === 'ona') return new Set<InstallmentKind>(['ona']);
  if (currentKind === 'special') return new Set<InstallmentKind>(['special']);
  return new Set<InstallmentKind>(['season']);
}

function sortInstallments(items: Omit<InstallmentItem, 'label'>[]) {
  return [...items].sort((a, b) => {
    if (a.kind === 'season' && b.kind === 'season') {
      if (a.seasonNumber && b.seasonNumber) {
        return a.seasonNumber - b.seasonNumber
          || (a.partNumber || 0) - (b.partNumber || 0)
          || (a.year || 0) - (b.year || 0)
          || String(a.name || '').localeCompare(String(b.name || ''))
          || Number(a.mal_id) - Number(b.mal_id);
      }
      if (!a.seasonNumber && b.seasonNumber) return -1;
      if (a.seasonNumber && !b.seasonNumber) return 1;
    }
    const yearA = a.year || 0;
    const yearB = b.year || 0;
    return yearA - yearB
      || installmentSortWeight(a.kind) - installmentSortWeight(b.kind)
      || String(a.name || '').localeCompare(String(b.name || ''))
      || Number(a.mal_id) - Number(b.mal_id);
  });
}

function buildInstallmentLabels(items: Omit<InstallmentItem, 'label'>[]): InstallmentItem[] {
  const sorted = sortInstallments(items);
  let seasonIndex = 0;
  let movieIndex = 0;
  let ovaIndex = 0;
  let onaIndex = 0;
  let specialIndex = 0;
  const movieTotal = sorted.filter((item) => item.kind === 'movie').length;
  const ovaTotal = sorted.filter((item) => item.kind === 'ova').length;
  const onaTotal = sorted.filter((item) => item.kind === 'ona').length;
  const specialTotal = sorted.filter((item) => item.kind === 'special').length;

  return sorted.map((item) => {
    let label = item.format || 'Entry';
    let sourceSeasonNumber = item.sourceSeasonNumber || item.seasonNumber || null;
    if (item.kind === 'season') {
      if (item.seasonNumber) {
        const resolvedSeasonNumber = item.seasonNumber;
        seasonIndex = Math.max(seasonIndex + 1, resolvedSeasonNumber);
        sourceSeasonNumber = resolvedSeasonNumber;
        label = item.partNumber
          ? `Season ${resolvedSeasonNumber} Part ${item.partNumber}`
          : `Season ${resolvedSeasonNumber}`;
      } else if (sorted.filter((entry) => entry.kind === 'season').length === 1) {
        seasonIndex += 1;
        sourceSeasonNumber = 1;
        label = 'Season 1';
      } else {
        seasonIndex += 1;
        sourceSeasonNumber = seasonIndex;
        label = item.name || `TV ${seasonIndex}`;
      }
    } else if (item.kind === 'movie') {
      movieIndex += 1;
      label = movieTotal > 1 ? `Movie ${movieIndex}` : 'Movie';
    } else if (item.kind === 'ova') {
      ovaIndex += 1;
      label = ovaTotal > 1 ? `OVA ${ovaIndex}` : 'OVA';
    } else if (item.kind === 'ona') {
      onaIndex += 1;
      label = onaTotal > 1 ? `ONA ${onaIndex}` : 'ONA';
    } else if (item.kind === 'special') {
      specialIndex += 1;
      label = specialTotal > 1 ? `Special ${specialIndex}` : 'Special';
    }
    return { ...item, sourceSeasonNumber, label };
  });
}

function shouldSkipInstallment(item: any, kind: InstallmentKind, current: boolean, displayKinds: Set<InstallmentKind>) {
  const title = titleForInstallment(item);
  const mediaType = String(item?.type || '').toUpperCase();
  const status = String(item?.status || '').toUpperCase();
  if (!current && (!ALLOWED_INSTALLMENT_KINDS.has(kind) || !displayKinds.has(kind))) return true;
  if (!current && mediaType && !['ANIME', 'TV', 'TV_SHORT', 'OVA', 'ONA', 'SPECIAL', 'MOVIE'].includes(mediaType)) return true;
  if (!current && status === 'NOT_YET_RELEASED') return true;
  if (kind === 'season' && /\b(director'?s cut|recap|compilation|digest|summary|tv edit(?:ion)?)\b/i.test(title)) return true;
  return false;
}

function isSameTitleLineInstallment(rootAnime: any, item: any, kind: InstallmentKind, current: boolean, relation?: string) {
  if (current) return true;
  const currentKind = installmentKindFor(normalizeInstallmentFormat(rootAnime?.type || 'TV'));
  const relationType = String(relation || item?.relation || '').toUpperCase();
  if (!relationTypeAllowed({ relation: relationType }, currentKind)) return false;
  if (kind !== 'season') return true;

  const rootTitle = titleForInstallment(rootAnime);
  const nextTitle = titleForInstallment(item);
  if (!sameSeriesFamily(rootTitle, nextTitle)) return false;
  if (hasSeasonTitleSignal(nextTitle)) return true;
  return /\b(after\s+story|shippuuden|shippuden|kai|final|next|second|third|fourth)\b/i.test(nextTitle);
}

function buildInstallmentItems(anime: any, discoveredItems: any[] = []): InstallmentItem[] {
  const currentKind = installmentKindFor(normalizeInstallmentFormat(anime?.type || 'TV'));
  const displayKinds = displayKindsFor(currentKind);
  const deduped = new Map<string, Omit<InstallmentItem, 'label'>>();
  const pushItem = (item: any, current: boolean, relation?: string) => {
    const malId = String(item?.mal_id || item?.id || '');
    if (!malId) return;
    const format = normalizeInstallmentFormat(item?.format || item?.type || anime?.type || 'TV');
    const kind = installmentKindFor(format);
    if (shouldSkipInstallment(item, kind, current, displayKinds)) return;
    if (!isSameTitleLineInstallment(anime, item, kind, current, relation)) return;
    const title = titleForInstallment(item);
    const nextItem: Omit<InstallmentItem, 'label'> = {
      mal_id: item?.mal_id || item?.id,
      anilist_id: item?.anilist_id || item?.id || null,
      name: title || 'Untitled',
      current,
      format,
      year: Number(item?.year || item?.seasonYear || 0) || null,
      seasonNumber: seasonNumberFromText(title),
      sourceSeasonNumber: seasonNumberFromText(title),
      partNumber: partNumberFromText(title),
      relation,
      kind,
    };
    const identity = installmentIdentity(nextItem);
    const existing = deduped.get(identity);
    deduped.set(identity, existing ? preferInstallmentCandidate(existing, nextItem) : nextItem);
  };

  pushItem({
    mal_id: anime?.mal_id,
    id: anime?.id,
    title: anime?.title,
    format: anime?.type,
    year: anime?.year,
  }, true, 'CURRENT');

  (anime?.relations || []).forEach((relation: any) => {
    (relation?.entry || [])
      .filter((entry: any) => entry?.mal_id)
      .filter((entry: any) => relationTypeAllowed({ ...entry, relation: relation?.relation }, currentKind))
      .forEach((entry: any) => pushItem(entry, false, relation?.relation));
  });

  discoveredItems
    .filter((entry: any) => entry?.mal_id || entry?.id)
    .forEach((entry: any) => pushItem(
      entry,
      String(entry?.mal_id || entry?.id) === String(anime?.mal_id || anime?.id || ''),
      entry?.relation || 'SEQUEL',
    ));

  return buildInstallmentLabels(Array.from(deduped.values()));
}

function installmentsHeading(items: InstallmentItem[]) {
  if (!items.length) return 'Seasons';
  if (items.length === 1) {
    const only = items[0];
    if (only.kind === 'movie') return 'Movie';
    if (only.kind === 'ova') return 'OVA';
    if (only.kind === 'ona') return 'ONA';
    if (only.kind === 'special') return 'Special';
  }
  return items.every((item) => item.kind === 'season') ? 'Seasons' : 'Installments';
}

function installmentHint(items: InstallmentItem[]) {
  if (!items.length) return 'Switch between related entries for this title.';
  if (items.every((item) => item.kind === 'season')) {
    return 'Switch between aired TV seasons in the same title line.';
  }
  return 'Switch between seasons, OVAs, ONAs, and specials in the same title line.';
}

function railScroll(ref: { current: HTMLDivElement | null }, direction: 'left' | 'right', distance = 420) {
  ref.current?.scrollBy({ left: direction === 'left' ? -distance : distance, behavior: 'smooth' });
}

function railWheelScroll(event: any, ref: { current: HTMLDivElement | null }) {
  const rail = ref.current;
  if (!rail) return;
  const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  if (!delta) return;
  event.preventDefault();
  rail.scrollBy({ left: delta, behavior: 'auto' });
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const value = String((error as { message?: unknown }).message || '').trim();
    if (value) return value;
  }
  return fallback;
}

export default function DesktopWatch() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [audioPreference, setAudioPreference] = useState<DesktopAudioPreference>(() => loadDesktopAudioPreference());
  const [autoOpenBestSource, setAutoOpenBestSource] = useState(() => loadDesktopAutoOpenBestSource());
  const [audioMode, setAudioMode] = useState<AudioMode>(() => {
    const requestedType = searchParams.get('type');
    if (requestedType === 'dub' || requestedType === 'sub') return requestedType;
    return watchTypeForAudioPreference(loadDesktopAudioPreference());
  });
  const [sortBy, setSortBy] = useState<SourceSort>('best');
  const [sourceMode, setSourceMode] = useState<SourceFilterMode>('balanced');
  const [episodeSearch, setEpisodeSearch] = useState('');
  const [episodeViewMode, setEpisodeViewMode] = useState<EpisodeViewMode>('cards');
  const [episodeJumpValue, setEpisodeJumpValue] = useState('');
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [playback, setPlayback] = useState<{ torrentId: string; title: string; source: LocalPlaybackSource } | null>(null);
  const [playbackNotice, setPlaybackNotice] = useState<PlaybackNotice | null>(null);
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<string>>(() => new Set());
  const [failedSourceVersion, setFailedSourceVersion] = useState(0);
  const routeAniListId = searchParams.get('aid') || '';
  const routeMalId = searchParams.get('mid') || '';
  const seasonRailRef = useRef<HTMLDivElement | null>(null);
  const episodesRailRef = useRef<HTMLDivElement | null>(null);
  const sourceSectionRef = useRef<HTMLElement | null>(null);
  const selectedSeasonRef = useRef<HTMLButtonElement | null>(null);
  const selectedEpisodeRef = useRef<HTMLButtonElement | null>(null);
  const playActionLockRef = useRef(false);
  const [pendingAutoPlayEpisode, setPendingAutoPlayEpisode] = useState<number | null>(null);
  const requestedType = searchParams.get('type');

  const toggleSourceDetails = useCallback((sourceId: string) => {
    setExpandedSourceIds((current) => {
      const next = new Set(current);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  }, []);

  useEffect(() => subscribeDesktopAutoOpenBestSource(() => {
    setAutoOpenBestSource(loadDesktopAutoOpenBestSource());
  }), []);

  useEffect(() => {
    const nextPreference = loadDesktopAudioPreference();
    setAudioPreference(nextPreference);
    const nextMode = requestedType === 'dub' || requestedType === 'sub'
      ? requestedType
      : watchTypeForAudioPreference(nextPreference);
    setAudioMode((current) => (current === nextMode ? current : nextMode));
  }, [requestedType, id]);

  const detailsQuery = useQuery({
    queryKey: ['anime', id, routeAniListId, routeMalId],
    queryFn: () => fetchAnimeDetails(id!, {
      anilistId: routeAniListId,
      malId: routeMalId,
      routeTitle: titleFromRoute(id),
    }),
    enabled: !!id,
    placeholderData: (previous) => previous,
    staleTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
  });

  const fallbackAnime = useMemo(() => fallbackAnimeFromRoute(id), [id]);
  const anime = detailsQuery.data?.data || fallbackAnime;
  const hasFullMetadata = Boolean(detailsQuery.data?.data);
  const metadataFailed = detailsQuery.isError;
  const currentInstallmentKind = useMemo(
    () => installmentKindFor(normalizeInstallmentFormat(anime?.type || 'TV')),
    [anime?.type],
  );
  const currentDisplayKinds = useMemo(
    () => displayKindsFor(currentInstallmentKind),
    [currentInstallmentKind],
  );
  const requestedEpisode = Math.max(0, Number(searchParams.get('ep') || 0));
  const estimatedEpisode = requestedEpisode || knownAiredEpisodeCount(anime) || 1;
  const episodePage = Math.max(1, Math.ceil(estimatedEpisode / 100));

  const { data: installmentGraphData } = useQuery({
    queryKey: ['desktop-watch-installments-graph', anime?.mal_id || anime?.id || id, currentInstallmentKind],
    queryFn: async () => {
      type GraphQueueEntry = {
        routeId: string;
        malId: string;
        anilistId: string;
        title: string;
        relation: string;
      };
      const identityFor = (value: { malId?: string; anilistId?: string; routeId?: string }) =>
        value.anilistId
          ? `aid:${value.anilistId}`
          : value.malId
            ? `mid:${value.malId}`
            : `route:${value.routeId || ''}`;
      const seen = new Set<string>([
        identityFor({
          malId: String(anime?.mal_id || ''),
          anilistId: String(anime?.anilist_id || anime?.id || ''),
          routeId: String(id || ''),
        }),
      ]);
      const preferredQueue: GraphQueueEntry[] = [];
      const secondaryQueue: GraphQueueEntry[] = [];
      const enqueue = (entry: any) => {
        const queueEntry: GraphQueueEntry = {
          routeId: String(entry?.mal_id || entry?.id || ''),
          malId: String(entry?.mal_id || ''),
          anilistId: String(entry?.anilist_id || entry?.id || ''),
          title: titleForInstallment(entry),
          relation: String(entry?.relation || ''),
        };
        const identity = identityFor(queueEntry);
        if (!queueEntry.routeId || seen.has(identity)) return;
        if (preferredQueue.some((item) => identityFor(item) === identity) || secondaryQueue.some((item) => identityFor(item) === identity)) return;
        if (installmentDiscoveryPriority(entry, currentDisplayKinds) === 0) preferredQueue.push(queueEntry);
        else secondaryQueue.push(queueEntry);
      };
      const graphEntryAllowed = (entry: any) => {
        const format = normalizeInstallmentFormat(entry?.format || entry?.type || 'TV');
        const kind = installmentKindFor(format);
        return relationTypeAllowed(entry, currentInstallmentKind)
          && !shouldSkipInstallment(entry, kind, false, currentDisplayKinds)
          && isSameTitleLineInstallment(anime, entry, kind, false, entry?.relation);
      };

      relationEntriesForGraph(anime)
        .filter(graphEntryAllowed)
        .forEach(enqueue);
      const discovered: any[] = [];
      const maxNodes = 20;

      while ((preferredQueue.length || secondaryQueue.length) && discovered.length < maxNodes) {
        const nextEntry = preferredQueue.shift() || secondaryQueue.shift();
        if (!nextEntry) continue;
        const nextIdentity = identityFor(nextEntry);
        if (seen.has(nextIdentity)) continue;
        seen.add(nextIdentity);

        try {
          const detail = await fetchAnimeDetails(nextEntry.routeId, {
            anilistId: nextEntry.anilistId,
            malId: nextEntry.malId,
            routeTitle: nextEntry.title,
          });
          const relatedAnime = detail?.data;
          if (!relatedAnime) continue;
          discovered.push({ ...relatedAnime, relation: nextEntry.relation });

          relationEntriesForGraph(relatedAnime)
            .filter(graphEntryAllowed)
            .forEach(enqueue);
        } catch {
          // Best-effort graph expansion only.
        }
      }

      return discovered;
    },
    enabled: !!id && hasFullMetadata,
    placeholderData: (previous) => previous,
    staleTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
  });

  const { data: episodeData } = useQuery({
    queryKey: ['episodes', anime?.mal_id || routeMalId || id, episodePage],
    queryFn: async () => {
      const episodeMalId = String(anime?.mal_id || routeMalId || '').trim();
      if (!episodeMalId) {
        return { data: [], pagination: { last_visible_page: 1 } };
      }
      return fetchAnimeEpisodes(episodeMalId, episodePage);
    },
    enabled: !!id && hasFullMetadata,
    placeholderData: (previous) => previous,
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });

  const pageItems = episodeData?.data || [];
  const airedCount = knownAiredEpisodeCount(anime, pageItems);
  const selectedEpisode = Math.max(1, Math.min(requestedEpisode || airedCount || 1, airedCount || 1));
  const episodeSearchTerm = episodeSearch.trim().toLowerCase();
  const longEpisodeRun = airedCount > EPISODE_WINDOW_SIZE;
  const pageEpisodeMap = useMemo<Map<number, EpisodeMetaEntry>>(() => {
    const entries = pageItems
      .map((episode: any) => {
        const number = Number(episode?.mal_id || 0);
        return number > 0 ? [number, episode as EpisodeMetaEntry] as const : null;
      })
      .filter((entry): entry is readonly [number, EpisodeMetaEntry] => Boolean(entry));
    return new Map(entries);
  }, [pageItems]);
  const streamingEpisodeMap = useMemo<Map<number, EpisodeMetaEntry>>(() => {
    const entries = (Array.isArray(anime?.streamingEpisodes) ? anime.streamingEpisodes : [])
      .map((episode: any) => {
        const number = episodeNumberFromTitle(episode?.title || '');
        return number ? [number, episode as EpisodeMetaEntry] as const : null;
      })
      .filter((entry): entry is readonly [number, EpisodeMetaEntry] => Boolean(entry));
    return new Map(entries);
  }, [anime?.streamingEpisodes]);
  const allEpisodes = useMemo(() => {
    const count = Math.max(airedCount || pageItems.length || 1, selectedEpisode || 1);
    return Array.from({ length: count }, (_, index) => {
      const number = index + 1;
      const pageEpisode = pageEpisodeMap.get(number);
      const streamingEpisode = streamingEpisodeMap.get(number);
      return {
        number,
        title: pageEpisode?.title || pageEpisode?.title_english || pageEpisode?.title_romanji || streamingEpisode?.title || `Episode ${number}`,
        image: streamingEpisode?.thumbnail || pageEpisode?.image || wideImageFor(anime),
      };
    });
  }, [airedCount, anime, pageEpisodeMap, pageItems.length, selectedEpisode, streamingEpisodeMap]);
  const episodeRanges = useMemo(() => {
    const count = Math.max(allEpisodes.length, 1);
    return Array.from({ length: Math.ceil(count / EPISODE_GRID_PAGE_SIZE) }, (_, index) => {
      const start = index * EPISODE_GRID_PAGE_SIZE + 1;
      const end = Math.min(count, start + EPISODE_GRID_PAGE_SIZE - 1);
      return {
        start,
        end,
        label: `${start}-${end}`,
      };
    });
  }, [allEpisodes.length]);
  const [episodeGridStart, setEpisodeGridStart] = useState(1);
  const currentEpisodeRangeIndex = useMemo(
    () => Math.max(0, episodeRanges.findIndex((range) => range.start === episodeGridStart)),
    [episodeGridStart, episodeRanges],
  );
  const currentEpisodeRange = episodeRanges[currentEpisodeRangeIndex] || episodeRanges[0] || null;
  useEffect(() => {
    const matchingRange = episodeRanges.find((range) => selectedEpisode >= range.start && selectedEpisode <= range.end);
    setEpisodeGridStart(matchingRange?.start || 1);
  }, [episodeRanges, selectedEpisode]);
  useEffect(() => {
    if (airedCount >= AUTO_COMPACT_EPISODE_THRESHOLD) {
      setEpisodeViewMode('grid');
    }
  }, [airedCount, anime?.mal_id]);
  const cardEpisodes = useMemo(() => {
    const count = allEpisodes.length;
    const maxVisible = EPISODE_WINDOW_SIZE;
    const start = count > maxVisible
      ? Math.min(Math.max(1, selectedEpisode - Math.floor(maxVisible / 2)), Math.max(1, count - maxVisible + 1))
      : 1;
    return allEpisodes.slice(start - 1, start - 1 + Math.min(count, maxVisible));
  }, [allEpisodes, selectedEpisode]);
  const gridEpisodes = useMemo(() => {
    const selectedRange = episodeRanges.find((range) => range.start === episodeGridStart) || episodeRanges[0];
    if (!selectedRange) return allEpisodes.slice(0, EPISODE_GRID_PAGE_SIZE);
    return allEpisodes.slice(selectedRange.start - 1, selectedRange.end);
  }, [allEpisodes, episodeGridStart, episodeRanges]);
  const searchedEpisodes = useMemo(() => {
    if (!episodeSearchTerm) return [];
    const limit = episodeViewMode === 'grid' ? EPISODE_GRID_PAGE_SIZE : EPISODE_CARD_SEARCH_LIMIT;
    return allEpisodes
      .filter((episode) => {
        const byNumber = String(episode.number).includes(episodeSearchTerm);
        const byTitle = episode.title.toLowerCase().includes(episodeSearchTerm);
        return byNumber || byTitle;
      })
      .slice(0, limit);
  }, [allEpisodes, episodeSearchTerm, episodeViewMode]);
  const displayedEpisodes = useMemo(() => {
    if (episodeSearchTerm) return searchedEpisodes;
    if (longEpisodeRun && episodeViewMode === 'grid') return gridEpisodes;
    return cardEpisodes;
  }, [cardEpisodes, episodeSearchTerm, episodeViewMode, gridEpisodes, longEpisodeRun, searchedEpisodes]);
  const goEpisodeRange = useCallback((direction: -1 | 1) => {
    const nextRange = episodeRanges[currentEpisodeRangeIndex + direction];
    if (!nextRange) return;
    setEpisodeGridStart(nextRange.start);
  }, [currentEpisodeRangeIndex, episodeRanges]);

  const selectedEpisodeInfo = allEpisodes.find((episode) => episode.number === selectedEpisode) || displayedEpisodes[0];
  const seasonItems = useMemo(() => buildInstallmentItems(anime, installmentGraphData || []), [anime, installmentGraphData]);
  const selectedInstallment = seasonItems.find((item) => item.current) || seasonItems[0] || null;
  const installmentTitle = useMemo(() => installmentsHeading(seasonItems), [seasonItems]);
  const installmentSubtitle = useMemo(() => installmentHint(seasonItems), [seasonItems]);
  const showMetadataSkeleton = detailsQuery.isLoading && !hasFullMetadata;

  const { data: sources, isLoading: sourcesLoading, isFetching: sourcesFetching, refetch: refetchSources } = useQuery({
    queryKey: ['desktop-watch-sources', anime?.title, anime?.title_english, anime?.title_romaji, selectedInstallment?.mal_id, selectedInstallment?.label, selectedEpisode, audioMode, audioPreference],
    queryFn: async () => {
      const epPadded = String(selectedEpisode).padStart(2, '0');
      const titleCandidates = sourceSearchTitleVariants(anime, id, selectedInstallment).slice(0, 6);
      const seasonHints = sourceSearchSeasonHints(anime, id, selectedInstallment);
      const partHints = sourceSearchPartHints(anime, id, selectedInstallment);
      const audioSuffix = audioMode === 'dub' ? ' dub' : '';

      const normalizeSourcePool = (items: NyaaItem[]) => {
        const deduped = dedupeNyaaItems(items)
          .filter((source) => !isBatchSource(source.title))
          .filter((source) => !isAncillarySource(source.title));
        if (!deduped.length) return [];
        const ranked = deduped
          .map((source) => classifySource(source, {
            anime,
            routeId: id,
            installment: selectedInstallment,
            episode: selectedEpisode,
          }))
          .filter((source) => source.matchTier !== 'rejected');
        if (!ranked.length) return [];
        const seeded = ranked.filter((source) => source.rawSeeders > 0);
        const viable = seeded.length ? seeded : ranked;
        const audioFiltered = audioMode === 'dub'
          ? viable.filter((source) => {
              if (audioPreference === 'dub-only') return isDubOnlySource(source.title) || isDualAudioSource(source.title);
              return isDubSource(source.title);
            })
          : viable.filter((source) => !isDubOnlySource(source.title));
        return audioFiltered.length ? audioFiltered : viable;
      };

      const runQuery = async (query: string, options: { pages?: number; wide?: boolean; deep?: boolean }) => {
        const result = await searchNyaa(query, '1_2', '0', '1', options);
        return normalizeSourcePool(result);
      };

      const attemptedQueries = new Set<string>();
      const tryQueries = async (queries: string[], options: { pages?: number; wide?: boolean; deep?: boolean }) => {
        const pending: string[] = [];
        for (const rawQuery of queries) {
          const query = rawQuery.replace(/\s+/g, ' ').trim();
          if (!query) continue;
          const key = query.toLowerCase();
          if (attemptedQueries.has(key)) continue;
          attemptedQueries.add(key);
          pending.push(query);
        }

        for (let index = 0; index < pending.length; index += SOURCE_QUERY_BATCH_SIZE) {
          const batch = pending.slice(index, index + SOURCE_QUERY_BATCH_SIZE);
          const results = await Promise.all(batch.map(async (query) => ({ query, items: await runQuery(query, options) })));
          const hit = results.find((result) => result.items.length > 0);
          if (hit) return hit.items;
        }
        return [];
      };

      const exactEpisodeQueries = titleCandidates.flatMap((title) => {
        const cleanedTitle = cleanTitle(title);
        return [
          `${cleanedTitle} ${epPadded}${audioSuffix}`,
          `${cleanedTitle} episode ${selectedEpisode}${audioSuffix}`,
          `${cleanedTitle} ep ${selectedEpisode}${audioSuffix}`,
        ];
      });
      const exact = await tryQueries(exactEpisodeQueries, { pages: 2, wide: false, deep: false });
      if (exact.some((source) => source.matchTier === 'exact')) return exact;

      const seasonEpisodeQueries = seasonHints.flatMap((seasonNumber) => titleCandidates.flatMap((title) => {
        const stripped = stripSeasonDecorators(title) || cleanTitle(title);
        const seasonPadded = String(seasonNumber).padStart(2, '0');
        const queries = [
          `${stripped} s${seasonPadded}e${epPadded}${audioSuffix}`,
          `${stripped} season ${seasonNumber} episode ${selectedEpisode}${audioSuffix}`,
        ];
        partHints.forEach((partNumber) => {
          queries.push(`${stripped} season ${seasonNumber} part ${partNumber} episode ${selectedEpisode}${audioSuffix}`);
          queries.push(`${stripped} season ${seasonNumber} cour ${partNumber} episode ${selectedEpisode}${audioSuffix}`);
        });
        return queries;
      }));
      const seasonEpisode = await tryQueries(seasonEpisodeQueries, { pages: 2, wide: true, deep: true });
      if (seasonEpisode.some((source) => source.matchTier === 'exact')) return dedupeNyaaItems([...exact, ...seasonEpisode]) as RankedNyaaItem[];

      const broadEpisodeQueries = titleCandidates.flatMap((title) => {
        const cleanedTitle = cleanTitle(title);
        return [
          `${cleanedTitle} ${selectedEpisode}${audioSuffix}`,
          `${cleanedTitle} ${epPadded}`,
          `${cleanedTitle} ${selectedEpisode}`,
        ];
      });
      const broad = await tryQueries(broadEpisodeQueries, { pages: 5, wide: true, deep: true });
      const combinedEpisode = dedupeNyaaItems([...exact, ...seasonEpisode, ...broad]) as RankedNyaaItem[];
      if (combinedEpisode.some((source) => source.matchTier === 'exact' || source.matchTier === 'likely')) return combinedEpisode;

      const fallback = await tryQueries(titleCandidates.map((title) => cleanTitle(title)), { pages: 5, wide: true, deep: true });
      if (fallback.length) return dedupeNyaaItems([...combinedEpisode, ...fallback]) as RankedNyaaItem[];

      return [];
    },
    enabled: !!anime?.title && selectedEpisode > 0,
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const failedSourceRecords = useMemo(() => loadSourceFailureRecords(), [failedSourceVersion]);
  const allRankedSources = useMemo<RankedNyaaItem[]>(() => {
    const items = [...((sources || []) as RankedNyaaItem[])];
    return items.sort((a, b) => {
      const failureDelta = sourceFailurePenalty(a, failedSourceRecords) - sourceFailurePenalty(b, failedSourceRecords);
      if (failureDelta !== 0) return failureDelta;
      const tierDifference = sourceTierWeight(a.matchTier) - sourceTierWeight(b.matchTier);
      if (tierDifference !== 0 && sortBy === 'best') return tierDifference;
      if (sortBy === 'seeders') return b.rawSeeders - a.rawSeeders;
      if (sortBy === 'size') return a.rawSize - b.rawSize;
      return sourceScore(b, audioPreference, audioMode) - sourceScore(a, audioPreference, audioMode);
    });
  }, [audioMode, audioPreference, failedSourceRecords, sortBy, sources]);
  const exactSources = useMemo(() => allRankedSources.filter((source) => source.matchTier === 'exact'), [allRankedSources]);
  const likelySources = useMemo(() => allRankedSources.filter((source) => source.matchTier === 'likely'), [allRankedSources]);
  const broadSources = useMemo(() => allRankedSources.filter((source) => source.matchTier === 'broad'), [allRankedSources]);
  const playableSources = useMemo(() => {
    const shouldUseBroadFallback = sourceMode === 'balanced' && !exactSources.length && !likelySources.length;
    const eligible = sourceMode === 'strict'
      ? exactSources
      : sourceMode === 'balanced'
        ? [...exactSources, ...likelySources, ...(shouldUseBroadFallback ? broadSources : [])]
        : [...exactSources, ...likelySources, ...broadSources];
    return eligible
      .filter((source) => source.playable && (source.matchTier !== 'broad' || sourceMode === 'broad' || shouldUseBroadFallback))
      .sort((a, b) => sourceFailurePenalty(a, failedSourceRecords) - sourceFailurePenalty(b, failedSourceRecords));
  }, [broadSources, exactSources, failedSourceRecords, likelySources, sourceMode]);
  const sortedSources = useMemo(() => {
    if (sourceMode === 'strict') return exactSources;
    if (sourceMode === 'balanced') {
      const primary = [...exactSources, ...likelySources];
      return primary.length ? primary : broadSources;
    }
    return [...exactSources, ...likelySources, ...broadSources];
  }, [broadSources, exactSources, likelySources, sourceMode]);
  const sourcesBusy = sourcesLoading || sourcesFetching;
  const nextPlayableSource = useMemo(
    () => playableSources.find((source) => !sourceFailureFor(source, failedSourceRecords)) || playableSources[0] || null,
    [failedSourceRecords, playableSources],
  );

  const { data: playbackProgress } = useQuery<DesktopPlaybackProgress>({
    queryKey: ['desktop-playback-progress', playback?.torrentId],
    queryFn: () => getLocalPlaybackProgress(playback!.torrentId),
    enabled: Boolean(playback?.torrentId),
    refetchInterval: 1500,
    retry: 1,
  });
  const playbackStage = useMemo(() => playbackStageMeta(playbackProgress), [playbackProgress]);
  const playbackSteps = ['Metadata', 'Peers', 'Buffer', 'Play'];

  useEffect(() => {
    if (playback && playbackProgress?.state === 'stopped') {
      setPlayback(null);
      setPlaybackNotice({ tone: 'success', text: playbackProgress.message || 'Playback ended and temporary files were cleaned.' });
    }
  }, [playback, playbackProgress]);

  useEffect(() => {
    if (!playback || !playbackProgress?.ok || playbackProgress.state === 'stopped') return;
    if (!playbackProgress.current_seconds && !playbackProgress.duration_seconds && !playbackProgress.progress) return;
    updateLocalPlaybackHistoryProgress(playback.source, {
      currentSeconds: playbackProgress.current_seconds,
      durationSeconds: playbackProgress.duration_seconds,
      progressPercent: playbackProgress.progress,
    });
  }, [
    playback,
    playbackProgress?.current_seconds,
    playbackProgress?.duration_seconds,
    playbackProgress?.ok,
    playbackProgress?.progress,
    playbackProgress?.state,
  ]);

  useEffect(() => {
    selectedSeasonRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [id, selectedInstallment?.mal_id]);

  useEffect(() => {
    selectedEpisodeRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [displayedEpisodes, episodeViewMode, selectedEpisode, selectedEpisodeInfo?.number]);

  useEffect(() => {
    setEpisodeJumpValue(String(selectedEpisode));
  }, [selectedEpisode]);

  useEffect(() => {
    setEpisodeSearch('');
  }, [selectedInstallment?.mal_id]);

  const selectEpisode = useCallback((episodeNumber: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('ep', String(episodeNumber));
    next.set('type', audioMode);
    setSearchParams(next);
  }, [audioMode, searchParams, setSearchParams]);

  const submitEpisodeJump = useCallback(() => {
    const parsed = Number(episodeJumpValue || 0);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    selectEpisode(clampNumber(Math.round(parsed), 1, Math.max(1, airedCount || selectedEpisode || 1)));
  }, [airedCount, episodeJumpValue, selectEpisode, selectedEpisode]);

  const submitEpisodeSearch = useCallback(() => {
    const trimmed = episodeSearch.trim();
    if (!trimmed) return;
    const exactEpisode = Number(trimmed);
    if (Number.isFinite(exactEpisode) && exactEpisode > 0) {
      selectEpisode(clampNumber(Math.round(exactEpisode), 1, Math.max(1, airedCount || selectedEpisode || 1)));
    } else if (searchedEpisodes[0]) {
      selectEpisode(searchedEpisodes[0].number);
    }
  }, [airedCount, episodeSearch, searchedEpisodes, selectEpisode, selectedEpisode]);

  const sourcePayloadFor = useCallback((source: NyaaItem): LocalPlaybackSource => {
    const historyEntry = findLocalPlaybackHistoryItem({
      animeTitle: anime.title,
      animeId: anime.mal_id || anime.id,
      episode: selectedEpisode,
      magnet: source.magnet,
      title: source.title,
    });
    return {
      magnet: source.magnet,
      torrentUrl: torrentUrlFor(source),
      infoHash: source.infoHash,
      title: source.title,
      animeTitle: anime.title,
      animeId: anime.mal_id || anime.id,
      episode: selectedEpisode,
      size: source.size,
      seeders: source.seeders,
      image: posterFor(anime),
      poster: posterFor(anime),
      banner: wideImageFor(anime),
      progressPercent: historyEntry?.progressPercent ?? 0,
      resumeSeconds: historyEntry?.resumeSeconds ?? 0,
      durationSeconds: historyEntry?.durationSeconds ?? 0,
    };
  }, [anime, selectedEpisode]);

  const openOneSource = useCallback(async (source: NyaaItem) => {
    const playbackSource = sourcePayloadFor(source);
    const result = await openLocalSourceNow(playbackSource);
    if (!result.ok) throw new Error(result.message || 'Source link could not open.');
    if (!result.torrent_id) throw new Error('The local engine did not return a stream id.');
    return { result, playbackSource };
  }, [sourcePayloadFor]);

  const playSource = useCallback(async (source: RankedNyaaItem) => {
    if (playActionLockRef.current || activeSourceId) {
      setPlaybackNotice({ tone: 'loading', text: 'A playback action is already running. Wait for it to finish before starting another source.' });
      return;
    }
    if (!source.playable) {
      setPlaybackNotice({ tone: 'error', text: `${source.playableLabel} source. StreamNyaa will only play sources that pass the same-anime, same-installment, same-episode checks.` });
      return;
    }
    playActionLockRef.current = true;
    const retryPool = [
      source,
      ...playableSources.filter((candidate) => (
        (candidate.infoHash || candidate.magnet) !== (source.infoHash || source.magnet)
        && (
          candidate.matchTier !== 'broad'
          || source.matchTier === 'broad'
          || sourceMode === 'broad'
          || (!exactSources.length && !likelySources.length)
        )
      )),
    ].slice(0, SOURCE_RETRY_LIMIT);
    const errors: string[] = [];
    setPlaybackNotice({ tone: 'loading', text: `Opening the player and preparing this release${retryPool.length > 1 ? ' with backup sources ready' : ''}...` });
    try {
      for (let index = 0; index < retryPool.length; index += 1) {
        const candidate = retryPool[index];
        const sourceId = candidate.infoHash || candidate.magnet;
        setActiveSourceId(sourceId);
        if (index > 0) {
          setPlaybackNotice({ tone: 'loading', text: `Trying backup source ${index + 1} of ${retryPool.length}...` });
        }

        try {
          const { result, playbackSource } = await openOneSource(candidate);
          forgetSourceFailure(candidate);
          setFailedSourceVersion((value) => value + 1);
          setPlayback({ torrentId: result.torrent_id!, title: result.title || candidate.title, source: playbackSource });
          setPlaybackNotice({
            tone: 'success',
            text: index === 0
              ? 'Player opened. StreamNyaa keeps the same window active while the first playback buffer fills.'
              : `Primary source failed. StreamNyaa opened backup source ${index + 1} automatically.`,
          });
          return;
        } catch (error) {
          const message = errorMessage(error, 'Source link could not open.');
          if (/another playback action is already running|playback shutdown is busy|busy\./i.test(message)) {
            throw new Error(message);
          }
          rememberSourceFailure(candidate, message, {
            animeId: anime?.mal_id || anime?.id,
            episode: selectedEpisode,
          });
          setFailedSourceVersion((value) => value + 1);
          errors.push(message);
        }
      }

      throw new Error(errors[errors.length - 1] || 'Source link could not open.');
    } catch (error) {
      const fallbackHint = retryPool.length > 1
        ? ` StreamNyaa also tried ${Math.min(retryPool.length - 1, SOURCE_RETRY_LIMIT - 1)} backup source${retryPool.length > 2 ? 's' : ''}.`
        : '';
      setPlaybackNotice({ tone: 'error', text: `${errorMessage(error, 'Source link could not open.')}${fallbackHint}` });
    } finally {
      setActiveSourceId(null);
      playActionLockRef.current = false;
    }
  }, [activeSourceId, anime?.id, anime?.mal_id, exactSources.length, likelySources.length, openOneSource, playableSources, selectedEpisode, sourceMode]);

  const playNextPlayableSource = useCallback(() => {
    if (!nextPlayableSource) return;
    void playSource(nextPlayableSource);
  }, [nextPlayableSource, playSource]);

  const playEpisodeNumber = useCallback((episodeNumber: number) => {
    const targetEpisode = clampNumber(Math.round(episodeNumber), 1, Math.max(1, airedCount || selectedEpisode || 1));
    sourceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (targetEpisode !== selectedEpisode) {
      setPendingAutoPlayEpisode(targetEpisode);
      selectEpisode(targetEpisode);
      return;
    }
    if (activeSourceId || playActionLockRef.current) {
      setPendingAutoPlayEpisode(targetEpisode);
      setPlaybackNotice({ tone: 'loading', text: 'Current player handoff is still starting. The selected episode will open next.' });
      return;
    }
    if (sourcesBusy) {
      setPendingAutoPlayEpisode(targetEpisode);
      setPlaybackNotice({ tone: 'loading', text: 'Finding a verified same-episode source before opening playback...' });
      return;
    }
    if (playableSources[0]) {
      void playSource(playableSources[0]);
      return;
    }
    setPendingAutoPlayEpisode(targetEpisode);
  }, [activeSourceId, airedCount, playSource, playableSources, selectEpisode, selectedEpisode, sourcesBusy]);

  const chooseEpisode = useCallback((episodeNumber: number) => {
    if (autoOpenBestSource) {
      playEpisodeNumber(episodeNumber);
      return;
    }
    selectEpisode(episodeNumber);
  }, [autoOpenBestSource, playEpisodeNumber, selectEpisode]);

  useEffect(() => {
    if (pendingAutoPlayEpisode === null) return;
    if (pendingAutoPlayEpisode !== selectedEpisode) return;
    if (activeSourceId || playActionLockRef.current) return;
    if (sourcesBusy) return;
    if (playableSources[0]) {
      const bestSource = playableSources[0];
      setPendingAutoPlayEpisode(null);
      void playSource(bestSource);
      return;
    }
    setPendingAutoPlayEpisode(null);
    setPlaybackNotice({ tone: 'error', text: 'No verified same-episode source was found. Switch to Balanced to inspect likely matches, or open the manual source search.' });
  }, [activeSourceId, pendingAutoPlayEpisode, playSource, playableSources, selectedEpisode, sourcesBusy]);

  const stopPlayback = useCallback(async () => {
    try {
      setPlaybackNotice({ tone: 'loading', text: 'Stopping the active stream and cleaning temporary files...' });
      const result = await stopDesktopPlayback();
      setPlayback(null);
      setActiveSourceId(null);
      setPlaybackNotice({ tone: 'success', text: result.message || 'Playback was stopped and temporary files were cleaned.' });
    } catch (error) {
      setPlaybackNotice({ tone: 'error', text: errorMessage(error, 'Playback could not be stopped.') });
    }
  }, []);

  if (!id) return <div className="py-24 text-center text-white">Select an anime to continue.</div>;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0A0A0C] text-white">
      <Seo title={`${anime.title} Watch | StreamNyaa Desktop`} description="Desktop watch source screen." canonicalPath={`/watch/${id}`} robots="noindex, nofollow" />
      <SafeImage candidates={imageCandidatesFor(anime, true)} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.13] blur-2xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_24%,rgba(126,58,242,0.20),transparent_30%),linear-gradient(90deg,#050508_0%,rgba(5,5,8,0.94)_31%,rgba(5,5,8,0.82)_100%)]" />

      <div className="relative grid min-h-screen grid-cols-[360px_1fr] gap-7 px-5 py-6">
        <aside className="border-r border-white/8 pr-7">
          <Link to="/" className="mb-6 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white hover:bg-white/12">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="relative">
            <div className="pointer-events-none absolute -inset-4 overflow-hidden rounded-[2rem] opacity-25 blur-2xl">
              <SafeImage candidates={imageCandidatesFor(anime)} alt="" className="h-full w-full object-cover" fallbackClassName="h-full w-full" />
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/40 ring-1 ring-white/[0.02]">
              <SafeImage candidates={imageCandidatesFor(anime)} alt={anime.title} className="aspect-[2/3] w-full object-cover" />
            </div>
          </div>
          {showMetadataSkeleton ? (
            <>
              <div className="mt-7 h-12 w-56 animate-pulse rounded-xl bg-white/10" />
              <div className="mt-3 h-5 w-44 animate-pulse rounded-lg bg-white/8" />
              <div className="mt-4 flex flex-wrap gap-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="h-8 w-20 animate-pulse rounded-full bg-white/8" />
                ))}
              </div>
              <div className="mt-7 space-y-3">
                {Array.from({ length: 5 }, (_, index) => (
                  <div key={index} className={`h-4 animate-pulse rounded bg-white/8 ${index === 4 ? 'w-4/5' : 'w-full'}`} />
                ))}
              </div>
            </>
          ) : (
            <>
              {selectedInstallment?.label && selectedInstallment.label !== 'Season 1' ? (
                <p className="mt-7 text-[11px] font-black uppercase tracking-[0.22em] text-primary">{selectedInstallment.label}</p>
              ) : null}
              <h1 className={`${selectedInstallment?.label && selectedInstallment.label !== 'Season 1' ? 'mt-2' : 'mt-7'} break-words text-[30px] font-black leading-[1.06] tracking-[-0.035em]`}>{anime.title}</h1>
              <div className="mt-2 flex items-center gap-2 text-sm font-bold text-white/62">
                <span>{anime.year || 'Anime'}</span>
                <span>-</span>
                <span className="inline-flex items-center gap-1 text-yellow-400"><Star className="h-4 w-4 fill-current" />{anime.score ? anime.score.toFixed(1) : 'N/A'}</span>
                <span>-</span>
                <span>{airedCount || anime.episodes || '?'} episodes</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {(anime.genres || []).slice(0, 4).map((genre: any) => (
                  <span key={genre.name} className="rounded-full border border-white/14 bg-white/8 px-3 py-1.5 text-xs font-bold text-white/78">{genre.name}</span>
                ))}
              </div>
              <p className="mt-7 line-clamp-[8] text-[15px] leading-7 text-white/64">
                {metadataFailed ? (anime.synopsis || 'Source search is still available for this title.') : (anime.synopsis || 'No synopsis available.')}
              </p>
            </>
          )}
        </aside>

        <main className="min-w-0 py-8">
          <section>
            <div className="sticky top-0 z-20 mb-4 flex items-center justify-between border-b border-white/[0.06] bg-[#0A0A0C]/82 pb-4 pt-1 backdrop-blur-xl">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">{installmentTitle}</p>
                <p className="mt-2 text-xs font-semibold text-white/34">{installmentSubtitle}</p>
                <div ref={seasonRailRef} onWheel={(event) => railWheelScroll(event, seasonRailRef)} className="mt-3 flex gap-3 overflow-x-auto pb-2 hide-scrollbar scroll-smooth">
                  {seasonItems.map((season) => {
                    const sharedClassName = `shrink-0 rounded-full border px-5 py-2.5 text-sm font-black transition-all ${
                      season.current
                        ? 'border-transparent bg-primary text-white shadow-lg shadow-primary/18'
                        : 'border-white/10 bg-white/[0.04] text-white/64 hover:border-white/18 hover:bg-white/[0.07] hover:text-white'
                    }`;
                    return season.current ? (
                      <button
                        key={`current-${season.mal_id}`}
                        ref={selectedSeasonRef}
                        type="button"
                        className={sharedClassName}
                      >
                        {season.label}
                      </button>
                    ) : (
                      <Link
                        key={season.mal_id || season.name}
                        to={desktopWatchPath(
                          {
                            mal_id: season.mal_id,
                            anilist_id: season.anilist_id,
                            id: season.anilist_id,
                            title: season.name,
                          },
                          { type: audioMode },
                        )}
                        className={sharedClassName}
                      >
                        {season.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden rounded-full border border-white/12 bg-white/[0.05] p-1 md:inline-flex">
                  {(['sub', 'dub'] as AudioMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        const nextPreference: DesktopAudioPreference = mode === 'sub'
                          ? 'sub-preferred'
                          : audioPreference === 'dub-only'
                            ? 'dub-only'
                            : 'dual-preferred';
                        setAudioPreference(nextPreference);
                        saveDesktopAudioPreference(nextPreference);
                        setAudioMode(mode);
                        const next = new URLSearchParams(searchParams);
                        next.set('type', mode);
                        setSearchParams(next);
                      }}
                      className={`rounded-full px-5 py-2 text-sm font-black ${audioMode === mode ? 'bg-white text-black' : 'text-white/62 hover:text-white'}`}
                    >
                      {mode === 'dub' ? 'Dual / Dub' : 'Sub'}
                    </button>
                  ))}
                </div>
                <div className="hidden items-center gap-2 md:flex">
                  <button
                    type="button"
                    onClick={() => railScroll(seasonRailRef, 'left', 260)}
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/12 bg-white/[0.04] text-white/74 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                    aria-label="Scroll installments left"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => railScroll(seasonRailRef, 'right', 260)}
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/12 bg-white/[0.04] text-white/74 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                    aria-label="Scroll installments right"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="sticky top-[154px] z-10 -mx-2 mb-4 flex items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-[#0A0A0C]/78 px-2 py-3 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-lg font-black">
                <Download className="h-4 w-4 text-primary" />
                <span>{selectedInstallment?.kind === 'movie' ? 'Movie' : selectedInstallment?.kind === 'ova' ? 'OVA Episodes' : selectedInstallment?.kind === 'ona' ? 'ONA Episodes' : 'Episodes'} ({airedCount || allEpisodes.length || 0})</span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <div className="hidden items-center gap-2 rounded-xl border border-white/12 bg-black/35 px-3 py-2 md:flex">
                  <Search className="h-4 w-4 text-white/42" />
                  <input
                    value={episodeSearch}
                    onChange={(event) => setEpisodeSearch(event.target.value.slice(0, 48))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        submitEpisodeSearch();
                      }
                    }}
                    className="w-48 bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/32"
                    placeholder="Search episode number or title"
                  />
                </div>
                {longEpisodeRun ? (
                  <div className="hidden rounded-xl border border-white/10 bg-black/30 p-1 md:flex">
                    {(['cards', 'grid'] as EpisodeViewMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setEpisodeViewMode(mode)}
                        className={`rounded-lg px-3 py-2 text-xs font-black uppercase tracking-[0.16em] ${
                          episodeViewMode === mode
                            ? 'bg-white/[0.12] text-white'
                            : 'text-white/56 hover:text-white'
                        }`}
                      >
                        {mode === 'grid' ? 'Compact' : 'Cards'}
                      </button>
                    ))}
                  </div>
                ) : null}
                {longEpisodeRun && episodeViewMode === 'grid' && !episodeSearchTerm && episodeRanges.length > 1 ? (
                  <div className="hidden items-center gap-2 rounded-xl border border-white/12 bg-black/35 p-1 md:flex">
                    <button
                      type="button"
                      disabled={currentEpisodeRangeIndex <= 0}
                      onClick={() => goEpisodeRange(-1)}
                      className="grid h-10 w-10 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Previous episode range"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <select
                      value={String(episodeGridStart)}
                      onChange={(event) => setEpisodeGridStart(Number(event.target.value) || 1)}
                      className="rounded-xl border border-white/12 bg-black/45 px-4 py-3 text-sm font-black text-white outline-none"
                    >
                      {episodeRanges.map((range) => (
                        <option key={range.start} value={range.start}>{range.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={currentEpisodeRangeIndex >= episodeRanges.length - 1}
                      onClick={() => goEpisodeRange(1)}
                      className="grid h-10 w-10 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Next episode range"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
                {longEpisodeRun ? (
                  <div className="hidden items-center gap-2 rounded-xl border border-white/12 bg-black/35 px-3 py-2 md:flex">
                    <span className="text-[11px] font-black uppercase tracking-[0.18em] text-white/44">Jump</span>
                    <input
                      value={episodeJumpValue}
                      onChange={(event) => setEpisodeJumpValue(event.target.value.replace(/[^\d]/g, '').slice(0, 4))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          submitEpisodeJump();
                        }
                      }}
                      inputMode="numeric"
                      className="w-20 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-black text-white outline-none"
                      placeholder="Episode"
                    />
                    <button
                      type="button"
                      onClick={submitEpisodeJump}
                      className="rounded-lg bg-primary px-3 py-2 text-xs font-black text-white"
                    >
                      Go
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={Boolean(activeSourceId) || sourcesBusy}
                  onClick={() => playEpisodeNumber(selectedEpisode)}
                  className="hidden rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-40 md:inline-flex"
                >
                  {Boolean(activeSourceId) || pendingAutoPlayEpisode === selectedEpisode ? 'Opening...' : 'Play Episode'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !autoOpenBestSource;
                    setAutoOpenBestSource(next);
                    saveDesktopAutoOpenBestSource(next);
                  }}
                  className={`hidden rounded-xl border px-4 py-3 text-xs font-black uppercase tracking-[0.16em] transition-colors md:inline-flex ${
                    autoOpenBestSource
                      ? 'border-white/14 bg-white/[0.08] text-white'
                      : 'border-white/12 bg-black/35 text-white/48 hover:border-white/18 hover:text-white'
                  }`}
                >
                  Auto-play {autoOpenBestSource ? 'On' : 'Off'}
                </button>
                <div className={`hidden items-center gap-2 md:flex ${longEpisodeRun && episodeViewMode === 'grid' ? 'opacity-40 pointer-events-none' : ''}`}>
                  <button
                    type="button"
                    onClick={() => railScroll(episodesRailRef, 'left', 520)}
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/12 bg-white/[0.04] text-white/74 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                    aria-label="Scroll episodes left"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => railScroll(episodesRailRef, 'right', 520)}
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/12 bg-white/[0.04] text-white/74 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                    aria-label="Scroll episodes right"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            {episodeSearchTerm && !displayedEpisodes.length ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-6 text-sm font-bold text-white/54">
                No episodes matched that search. Try a title keyword or an episode number.
              </div>
            ) : episodeViewMode === 'grid' && longEpisodeRun ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(94px,1fr))] gap-3">
                {displayedEpisodes.map((episode) => (
                  <div
                    key={episode.number}
                    className={`rounded-xl border px-3 py-3 text-left transition-all ${
                      episode.number === selectedEpisode
                        ? 'border-white/20 bg-white/[0.075] shadow-lg shadow-black/20 ring-1 ring-primary/25'
                        : 'border-white/10 bg-white/[0.035] hover:-translate-y-0.5 hover:border-white/18 hover:bg-white/[0.055]'
                    }`}
                  >
                    <button
                      ref={episode.number === selectedEpisode ? selectedEpisodeRef : null}
                      type="button"
                      onClick={() => chooseEpisode(episode.number)}
                      className="w-full text-left"
                    >
                      <p className={`text-base font-black ${episode.number === selectedEpisode ? 'text-white' : 'text-white/86'}`}>Ep {episode.number}</p>
                      <p className="mt-1 line-clamp-2 text-[11px] font-bold leading-5 text-white/48">{episode.title}</p>
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(activeSourceId)}
                      onClick={() => playEpisodeNumber(episode.number)}
                      className="mt-3 inline-flex h-8 items-center gap-2 rounded-lg bg-white/[0.08] px-3 text-[11px] font-black uppercase tracking-[0.16em] text-white transition-colors hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      Play
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div ref={episodesRailRef} onWheel={(event) => railWheelScroll(event, episodesRailRef)} className="flex gap-3 overflow-x-auto pb-3 hide-scrollbar scroll-smooth">
                {displayedEpisodes.map((episode) => (
                  <button
                    key={episode.number}
                    ref={episode.number === selectedEpisode ? selectedEpisodeRef : null}
                    type="button"
                    onClick={() => chooseEpisode(episode.number)}
                    className={`group relative h-[156px] w-[230px] shrink-0 overflow-hidden rounded-lg border text-left transition-all ${
                      episode.number === selectedEpisode
                        ? 'border-white/22 bg-white/[0.08] shadow-lg shadow-black/22 ring-1 ring-primary/30'
                        : 'border-white/10 hover:-translate-y-0.5 hover:border-white/20'
                    }`}
                  >
                    <SafeImage candidates={uniqueImageCandidates([episode.image, wideImageFor(anime), posterFor(anime)])} alt={episode.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                    <div className={`absolute inset-0 ${episode.number === selectedEpisode ? 'bg-[linear-gradient(0deg,rgba(48,8,16,0.92),rgba(0,0,0,0.06)_62%)]' : 'bg-[linear-gradient(0deg,rgba(0,0,0,0.82),rgba(0,0,0,0.08)_62%)]'}`} />
                    <span className={`absolute left-2 top-2 rounded-md px-2 py-1 text-xs font-black ${episode.number === selectedEpisode ? 'bg-white text-black' : 'bg-black/70 text-white'}`}>{episode.number}</span>
                    <p className="absolute bottom-3 left-3 right-3 line-clamp-1 text-sm font-black">{episode.title}</p>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs font-semibold text-white/26">
              {episodeSearchTerm
                ? `Found ${displayedEpisodes.length} matching episode${displayedEpisodes.length === 1 ? '' : 's'}. Press Enter to open the first match quickly.`
                : episodeViewMode === 'grid' && longEpisodeRun
                  ? `Compact view shows episodes ${currentEpisodeRange?.start || displayedEpisodes[0]?.number || 1}-${currentEpisodeRange?.end || displayedEpisodes[displayedEpisodes.length - 1]?.number || displayedEpisodes.length} of ${airedCount}. Click a tile to select it, or use Play to open the best source directly.`
                  : airedCount > displayedEpisodes.length
                    ? `Showing episodes ${displayedEpisodes[0]?.number || 1}-${displayedEpisodes[displayedEpisodes.length - 1]?.number || displayedEpisodes.length} of ${airedCount}. Use mouse wheel, the arrow buttons, search, or jump directly to an episode.`
                    : 'Use mouse wheel, search, or the arrow buttons to browse every aired episode in this season.'}
            </p>
          </section>

          <section ref={sourceSectionRef} className="mt-8 pb-24">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => sourceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="rounded-full bg-primary px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary/25"
                >
                  <SlidersHorizontal className="mr-2 inline h-4 w-4" />
                  Source Links
                </button>
                <button
                  type="button"
                  disabled={!playableSources[0] || Boolean(activeSourceId) || sourcesBusy}
                  onClick={() => playableSources[0] && void playSource(playableSources[0])}
                  className="rounded-full bg-white px-5 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Play Episode
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-xl border border-white/10 bg-black/35 p-1">
                  {(['strict', 'balanced', 'broad'] as SourceFilterMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setSourceMode(mode)}
                      className={`rounded-lg px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition-colors ${
                        sourceMode === mode
                          ? 'bg-white text-black'
                          : 'text-white/52 hover:bg-white/[0.07] hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SourceSort)} className="rounded-xl border border-white/12 bg-black/45 px-4 py-3 text-sm font-black text-white outline-none">
                  <option value="best">Best Match</option>
                  <option value="seeders">Seeders (High to Low)</option>
                  <option value="size">Smaller Files First</option>
                </select>
              </div>
            </div>

            {playbackNotice ? (
              <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm font-bold ${
                playbackNotice.tone === 'error'
                  ? 'border-red-400/25 bg-red-500/10 text-red-100'
                  : playbackNotice.tone === 'success'
                    ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
                    : 'border-primary/25 bg-primary/10 text-white/76'
              }`}>
                <span>{playbackNotice.text}</span>
                {playbackNotice.tone === 'error' && nextPlayableSource ? (
                  <button
                    type="button"
                    disabled={Boolean(activeSourceId) || sourcesBusy}
                    onClick={playNextPlayableSource}
                    className="rounded-full border border-white/12 bg-white px-4 py-2 text-xs font-black text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Try next playable source
                  </button>
                ) : null}
              </div>
            ) : null}

            {playback ? (
              <div className="mb-5 overflow-hidden rounded-2xl border border-white/10 bg-[#111217]/82 p-4 shadow-lg shadow-black/20">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Active stream</p>
                    <p className="mt-1 line-clamp-1 text-sm font-black text-white">{playback.title}</p>
                    <p className="mt-2 text-sm font-black text-white">{playbackStage.headline}</p>
                    <p className="mt-1 text-xs font-bold text-white/52">{playbackStage.detail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black uppercase tracking-wider text-white/38">{playbackStage.status}</p>
                    <p className="mt-1 text-sm font-black text-white">{Math.round(playbackStage.progress)}%</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {playbackSteps.map((label, index) => {
                    const activeStep = index + 1 <= playbackStage.step;
                    return (
                      <span
                        key={label}
                        className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                          activeStep
                            ? 'border-white/14 bg-white/[0.08] text-white'
                            : 'border-white/10 bg-white/[0.04] text-white/38'
                        }`}
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${playbackStage.progress}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-bold text-white/42">
                  <span>Peers: {playbackProgress?.peers ?? '...'}</span>
                  <span>Downloaded: {playbackProgress?.downloaded_bytes ? `${Math.round(playbackProgress.downloaded_bytes / 1024 / 1024)} MB` : '...'}</span>
                  {playbackProgress?.current_seconds ? (
                    <span>
                      Resume {formatPlaybackTime(playbackProgress.current_seconds)}
                      {playbackProgress?.duration_seconds ? ` / ${formatPlaybackTime(playbackProgress.duration_seconds)}` : ''}
                    </span>
                  ) : null}
                </div>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => void stopPlayback()}
                    className="rounded-full border border-white/12 bg-black/35 px-4 py-2 text-xs font-black text-white/78 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                  >
                    Stop stream
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Smart source selector</p>
                <h2 className="mt-1 text-lg font-black">Available Sources <span className="text-white/35">- Episode {selectedEpisode}</span></h2>
              </div>
              <div className="flex gap-2 text-xs font-black text-white/58">
                {['1080p', 'High seeders', 'Dual Audio', 'HEVC'].map((label) => <span key={label} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5">{label}</span>)}
              </div>
            </div>
            <div className="mb-4 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-white/42">
              <span className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5">
                Sort: {sortBy === 'seeders' ? 'Seed health' : sortBy === 'size' ? 'Small files' : 'Best match'}
              </span>
              <span className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5">
                Audio: {audioPreference === 'sub-preferred' ? 'Sub preferred' : audioPreference === 'dub-only' ? 'Dub only' : 'Dual preferred'}
              </span>
              <span className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5">Exact episode first</span>
              <span className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5">
                Showing {sourceMode === 'strict' ? 'exact only' : sourceMode === 'balanced' ? 'exact + likely' : 'all tiers'}
              </span>
              <span className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5">
                Exact {exactSources.length} / Likely {likelySources.length} / Broad {broadSources.length}
              </span>
            </div>

            {sourcesBusy ? (
              <div className="grid gap-3">
                <div className="rounded-2xl border border-white/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025)_48%,rgba(244,63,94,0.055))] p-4 shadow-lg shadow-black/18">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Finding best source</p>
                      <p className="mt-1 text-sm font-black text-white">Checking episode match, seed health, audio preference, and release quality.</p>
                      <p className="mt-1 text-xs font-bold text-white/50">The first playable source will be ranked above the full list.</p>
                    </div>
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                </div>
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="desktop-skeleton-shimmer h-[76px] rounded-2xl border border-white/[0.06]" />
                ))}
              </div>
            ) : sortedSources.length ? (
              <div className="grid gap-3">
                {sortedSources.map((source, index) => {
                  const sourceId = source.infoHash || source.magnet || source.link || source.title;
                  const active = activeSourceId === (source.infoHash || source.magnet);
                  const reasons = [
                    ...source.matchReasons,
                    ...sourceQualityReasons(source, selectedEpisode, audioPreference, audioMode),
                  ].filter((reason, reasonIndex, list) => list.indexOf(reason) === reasonIndex);
                  const score = Math.round(sourceScore(source, audioPreference, audioMode));
                  const visibleReasons = reasons.slice(0, 3);
                  const expanded = expandedSourceIds.has(sourceId);
                  const quality = /\b720p\b/i.test(source.title) ? '720p' : /\b2160p|4k\b/i.test(source.title) ? '4K' : '1080p';
                  const codec = /\b(hevc|h\.?265|x265)\b/i.test(source.title) ? 'HEVC' : /\b(avc|h\.?264|x264)\b/i.test(source.title) ? 'H.264' : 'Video';
                  const audioLabel = isDualAudioSource(source.title) ? 'Dual Audio' : isDubOnlySource(source.title) ? 'Dub' : 'Sub';
                  const failure = sourceFailureFor(source, failedSourceRecords);
                  const previousTier = sortedSources[index - 1]?.matchTier;
                  return (
                    <Fragment key={sourceId}>
                    {index === 0 || source.matchTier !== previousTier ? (
                      <div className={`${index === 0 ? '' : 'mt-2'} flex items-center justify-between border-t border-white/8 pt-4`}>
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/52">{sourceTierLabel(source.matchTier)}</p>
                          <p className="mt-1 text-xs font-bold text-white/32">{sourceTierDescription(source.matchTier)}</p>
                        </div>
                        <p className="text-xs font-bold text-white/36">
                          {source.matchTier === 'exact' ? exactSources.length : source.matchTier === 'likely' ? likelySources.length : broadSources.length} source
                          {(source.matchTier === 'exact' ? exactSources.length : source.matchTier === 'likely' ? likelySources.length : broadSources.length) === 1 ? '' : 's'}
                        </p>
                      </div>
                    ) : null}
                    <div
                      className={`relative overflow-hidden rounded-2xl border bg-[#111217]/78 p-4 shadow-lg shadow-black/18 transition-all hover:-translate-y-0.5 hover:border-white/16 hover:bg-[#181a22]/78 ${
                        index === 0 && source.matchTier === 'exact' ? 'border-white/14 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.035)_52%,rgba(244,63,94,0.06))] shadow-black/25' : 'border-white/8'
                      }`}
                    >
                      {index === 0 && source.matchTier === 'exact' ? <div className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-primary" /> : null}
                      <div className="flex items-center gap-4">
                        <span className="shrink-0 rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2 text-xs font-black text-white">{quality}</span>
                        <div className="min-w-0 flex-1">
                          {index === 0 && source.matchTier === 'exact' ? <p className="mb-1 text-[10px] font-black uppercase tracking-[0.22em] text-primary">Recommended source</p> : null}
                          <p className="line-clamp-1 text-sm font-black text-white">{source.title}</p>
                          <p className="mt-1 text-xs font-semibold text-white/48">
                            {quality} <span className="text-white/24">-</span> {codec} <span className="text-white/24">-</span> {audioLabel} <span className="text-white/24">-</span> {source.size}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-white/45">
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${playableStatusClassName(source.playableStatus)}`}>
                              {source.playableLabel}
                            </span>
                            {failure ? (
                              <span
                                title={failure.message}
                                className="rounded-full border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-200"
                              >
                                Recently failed
                              </span>
                            ) : null}
                            <span className="text-emerald-400">{sourceHealth(source.rawSeeders)}</span>
                            <span>{source.seeders} seeders</span>
                            {visibleReasons.map((reason) => (
                              <span key={`${sourceId}-${reason}`} className="rounded-full border border-white/8 bg-white/[0.045] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/54">
                                {reason}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleSourceDetails(sourceId)}
                            className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-black text-white/58 transition-colors hover:border-white/18 hover:text-white"
                          >
                            Details
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                          </button>
                          <button type="button" onClick={() => navigator.clipboard?.writeText(source.magnet || torrentUrlFor(source))} className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.05] text-white/62 transition-colors hover:border-white/18 hover:text-white">
                            <Copy className="h-4 w-4" />
                          </button>
                          <button type="button" disabled={Boolean(active) || !source.playable} onClick={() => void playSource(source)} className="inline-flex h-10 min-w-[86px] items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-primary/18 disabled:cursor-not-allowed disabled:opacity-60">
                            {active ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                            {active ? 'Opening' : source.playable ? 'Play' : 'Blocked'}
                          </button>
                        </div>
                      </div>
                      {expanded ? (
                        <div className="mt-4 rounded-xl border border-white/8 bg-black/24 p-3">
                          <div className="flex flex-wrap gap-2">
                            {[...reasons, `Score ${score}`, source.category, source.pubDate ? `Updated ${new Date(source.pubDate).toLocaleDateString()}` : '', source.infoHash ? `Hash ${source.infoHash.slice(0, 10)}` : '']
                              .filter(Boolean)
                              .map((label) => (
                                <span key={`${sourceId}-${label}`} className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/46">
                                  {label}
                                </span>
                              ))}
                            {getTorrentBadges(source).map((badge) => (
                              <span key={`${sourceId}-${badge.label}`} className={torrentBadgeClassName(badge.tone)}>{badge.label}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    </Fragment>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025)_48%,rgba(244,63,94,0.05))] p-8 text-center text-white/62">
                <p className="text-lg font-black text-white">No playable source found</p>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/50">Try switching audio mode, lowering quality expectations, or opening the manual source search for this title.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => void refetchSources()}
                    className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-black text-white shadow-lg shadow-primary/18 transition-colors hover:bg-primary/90"
                  >
                    Retry
                  </button>
                  <Link
                    to={`/nyaa?q=${encodeURIComponent(anime.title || '')}`}
                    className="inline-flex h-11 items-center rounded-xl border border-white/10 bg-white/[0.06] px-5 text-sm font-black text-white transition-colors hover:border-white/18 hover:bg-white/[0.09]"
                  >
                    Open Sources Search
                  </Link>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function sourceHealth(seedCount: number) {
  if (seedCount >= 100) return 'Fast';
  if (seedCount >= 50) return 'Healthy';
  if (seedCount >= 15) return 'Usable';
  return 'Low seed';
}

function sourceTierLabel(tier: SourceMatchTier) {
  if (tier === 'exact') return 'Exact matches';
  if (tier === 'likely') return 'Likely matches';
  if (tier === 'broad') return 'Broad matches';
  return 'Rejected';
}

function sourceTierDescription(tier: SourceMatchTier) {
  if (tier === 'exact') return 'Same anime, same installment, same episode. Default playback uses this group.';
  if (tier === 'likely') return 'Strong title match, but one filename signal is weaker. Visible in Balanced mode.';
  if (tier === 'broad') return 'Loose matches only. Kept visible for manual inspection and not used for autoplay.';
  return '';
}

function playableStatusClassName(status: SourcePlayableStatus) {
  if (status === 'verified') return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300';
  if (status === 'untested') return 'border-sky-400/20 bg-sky-500/10 text-sky-300';
  if (status === 'low-seed') return 'border-amber-400/20 bg-amber-500/10 text-amber-300';
  if (status === 'unsupported') return 'border-red-400/20 bg-red-500/10 text-red-300';
  return 'border-white/10 bg-white/[0.05] text-white/44';
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function playbackStageMeta(playbackProgress?: DesktopPlaybackProgress | null): PlaybackStageView {
  const rawProgress = Number(playbackProgress?.progress || 0);
  const message = playbackProgress?.message?.trim();
  switch (playbackProgress?.state) {
    case 'ready':
      return {
        headline: 'Playing in local player',
        detail: message || 'Playback is active. The selected episode has enough buffer to keep going.',
        progress: rawProgress > 0 ? clampNumber(rawProgress, 92, 100) : 92,
        step: 4,
        status: 'Ready',
      };
    case 'buffering':
      return {
        headline: 'Buffering episode',
        detail: message || 'The player is open. StreamNyaa is still filling the playback buffer.',
        progress: rawProgress > 0 ? clampNumber(rawProgress, 62, 88) : 72,
        step: 3,
        status: 'Buffering',
      };
    case 'connecting':
      return {
        headline: 'Connecting peers',
        detail: message || 'Peers are responding. StreamNyaa is building the first playback buffer.',
        progress: rawProgress > 0 ? clampNumber(rawProgress, 28, 54) : 42,
        step: 2,
        status: 'Peers',
      };
    case 'stopped':
      return {
        headline: 'Playback stopped',
        detail: message || 'Playback ended and temporary files were cleaned.',
        progress: 100,
        step: 4,
        status: 'Stopped',
      };
    default:
      return {
        headline: 'Preparing stream',
        detail: message || 'Reading torrent metadata and waiting for the first peers.',
        progress: rawProgress > 0 ? clampNumber(rawProgress, 10, 28) : 18,
        step: 1,
        status: 'Metadata',
      };
  }
}
