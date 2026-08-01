import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Loader2, Maximize2, Pause, Play, RotateCcw, RotateCw, Search, SlidersHorizontal, Star, Volume2 } from 'lucide-react';
import Seo from '../components/Seo';
import { fetchAnimeDetails, fetchAnimeEpisodes } from '../api/jikan';
import { dedupeNyaaItems, searchNyaa, type NyaaItem } from '../api/nyaa';
import { desktopWatchPath, isUpcomingAnime } from '../lib/desktopAnimeRoute';
import { getTorrentBadges, torrentBadgeClassName } from '../lib/torrentBadges';
import {
  findLocalPlaybackHistoryItem,
  formatPlaybackTime,
  controlLocalPlayer,
  getLocalPlaybackProgress,
  listenDesktopPlayerNextEpisode,
  listenDesktopPlayerRecoveryRequest,
  loadDesktopPlayerPreferences,
  loadDesktopAutoPlayNextEpisode,
  loadDesktopAutoOpenBestSource,
  loadDesktopAudioPreference,
  openLocalSourceNow,
  saveDesktopWatchProgress,
  subscribeDesktopAutoPlayNextEpisode,
  subscribeDesktopPlayerPreferences,
  saveDesktopAutoOpenBestSource,
  saveDesktopAudioPreference,
  syncDesktopPlayerPreferencesToPlayer,
  stopDesktopPlayback,
  subscribeDesktopAutoOpenBestSource,
  updateLocalPlaybackHistoryProgress,
  watchTypeForAudioPreference,
  type DesktopAudioPreference,
  type DesktopPlayerControlAction,
  type DesktopPlaybackProgress,
  type LocalPlaybackSource,
} from '../lib/desktop';

type AudioMode = 'sub' | 'dub';
type SourceSort = 'best' | 'seeders' | 'size';
type SourceFilterMode = 'strict' | 'balanced' | 'broad';
type SourceMatchTier = 'exact' | 'likely' | 'broad' | 'rejected';
type SourcePlayableStatus = 'verified' | 'untested' | 'low-seed' | 'likely-wrong' | 'unsupported';
type SourceConfidenceBand = 'high' | 'medium' | 'low' | 'failed';
type SourceQualityFilter = 'auto' | '2160p' | '1080p' | '720p' | '480p' | 'other';
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
  episodeCount?: number | null;
  image?: string;
  bannerImage?: string;
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
const EPISODE_RAIL_DRAG_THRESHOLD = 8;
const TIMELINE_SKELETON_CARD_COUNT = 5;
const SOURCE_QUERY_BATCH_SIZE = 6;
const SOURCE_RETRY_LIMIT = 5;
const FAILED_SOURCE_MEMORY_KEY = 'streamnyaa.desktopFailedSources';
const FAILED_SOURCE_MEMORY_TTL = 1000 * 60 * 60 * 24;
const SOURCE_SUCCESS_MEMORY_TTL = 1000 * 60 * 60 * 24 * 7;
const FAILED_SOURCE_MEMORY_LIMIT = 160;
const ALLOWED_INSTALLMENT_KINDS = new Set<InstallmentKind>(['season', 'movie', 'ova', 'ona', 'special']);
const TIMELINE_RELATIONS = new Set(['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SPIN_OFF']);
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
  failedAt?: number;
  message?: string;
  animeId?: string | number;
  episode?: number;
  failureCount?: number;
  successAt?: number;
  successCount?: number;
};

function posterFor(anime: any) {
  const fallbackId = Number(anime?.anilist_id || anime?.id || 0);
  const fallbackCover = fallbackId > 0 ? `https://img.anili.st/media/${fallbackId}` : '';
  return anime?.coverImage?.extraLarge
    || anime?.coverImage?.large
    || anime?.coverImage?.medium
    || anime?.cover_image
    || anime?.poster
    || anime?.image
    || anime?.images?.webp?.large_image_url
    || anime?.images?.jpg?.large_image_url
    || anime?.images?.jpg?.image_url
    || fallbackCover
    || '';
}

function wideImageFor(anime: any) {
  return anime?.bannerImage
    || anime?.banner_image
    || anime?.backdrop
    || anime?.background
    || anime?.trailer?.images?.maximum_image_url
    || anime?.trailer?.images?.large_image_url
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
    posterFor(anime),
  ] : [
    anime?.images?.webp?.large_image_url,
    anime?.images?.jpg?.large_image_url,
    anime?.images?.jpg?.image_url,
    anime?.banner_image,
    anime?.trailer?.images?.maximum_image_url,
    posterFor(anime),
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
    synopsis: '',
    episodes: null,
    status: '',
    score: 0,
    type: '',
    year: null,
    genres: [],
    streamingEpisodes: [],
    nextAiringEpisode: null,
    relations: [],
  };
}

function formatCompactLabel(value: unknown) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compactAnimeType(value: unknown) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'TV_SHORT') return 'TV Short';
  if (normalized === 'OVA' || normalized === 'ONA') return normalized;
  return formatCompactLabel(value);
}

function youtubeVideoIdFor(value = '') {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let candidate = '';
    if (host === 'youtu.be') candidate = url.pathname.split('/').filter(Boolean)[0] || '';
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      candidate = url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts)\/([^/?#]+)/)?.[1] || '';
    }
    return /^[a-zA-Z0-9_-]{6,20}$/.test(candidate) ? candidate : '';
  } catch {
    return '';
  }
}

function trailerUrlFor(anime: any) {
  const trailer = anime?.trailer || {};
  const directId = youtubeVideoIdFor(trailer.url);
  if (directId) return `https://www.youtube.com/watch?v=${encodeURIComponent(directId)}`;
  const youtubeId = String(trailer.youtube_id || trailer.id || '').trim();
  if (/^[a-zA-Z0-9_-]{6,20}$/.test(youtubeId) && (!trailer.site || String(trailer.site).toLowerCase() === 'youtube')) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`;
  }
  return '';
}

function youtubeEmbedUrlFor(url = '') {
  const youtubeId = youtubeVideoIdFor(url);
  return youtubeId ? `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1` : '';
}

function animeStudiosFor(anime: any) {
  return (anime?.studios || [])
    .map((studio: any) => String(studio?.name || studio || '').trim())
    .filter(Boolean);
}

function cleanTitle(value = '') {
  return value.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

const SOURCE_TITLE_STOP_TOKENS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'season',
  'episode',
  'movie',
  'film',
  'ova',
  'ona',
  'special',
  'part',
  'cour',
  'english',
  'japanese',
  'sub',
  'subs',
  'dub',
  'dual',
  'audio',
  'multi',
  'web',
  'webrip',
  'webdl',
  'bluray',
  'bdrip',
  'hevc',
  'x264',
  'x265',
  'h264',
  'h265',
  'aac',
  'flac',
]);

function normalizeSourceMatchText(value = '') {
  return cleanTitle(
    String(value || '')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, ' and ')
      .replace(/[’‘`´]/g, "'")
      .replace(/[×]/g, ' x '),
  ).toLowerCase();
}

function uniqueSourceTokens(value = '') {
  const seen = new Set<string>();
  return normalizeSourceMatchText(value)
    .split(' ')
    .filter((token) => {
      if (!token || token.length < 3 || SOURCE_TITLE_STOP_TOKENS.has(token) || /^\d+$/.test(token)) return false;
      if (seen.has(token)) return false;
      seen.add(token);
      return true;
    });
}

function sourceAliasForms(value = '') {
  const normalized = normalizeSourceMatchText(value);
  if (!normalized) return [];
  const withoutSeason = normalizeSourceMatchText(stripSeasonDecorators(value));
  const withoutJoinerX = normalizeSourceMatchText(normalized.replace(/\bx\b/g, ' '));
  return uniqueTextValues([normalized, withoutSeason, withoutJoinerX])
    .filter((title) => title.length >= 4);
}

function parseSourceAnimeTitle(value = '') {
  let title = String(value || '')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, ' and ')
    .replace(/[’‘`´]/g, "'")
    .replace(/[×]/g, ' x ')
    .trim();

  title = title.replace(/^\s*(?:\[[^\]]+\]|\([^)]+\))\s*/g, ' ');

  const splitPatterns = [
    /\bS\d{1,2}E\d{1,4}\b/i,
    /\b(?:ep|episode)\.?\s*0?\d{1,4}\b/i,
    /\s+-\s+0?\d{1,4}(?:v\d+)?\b/i,
    /\s+-\s+\[[^\]]*(?:480|720|1080|2160)p[^\]]*\]/i,
    /\s+-\s+\([^)]+(?:480|720|1080|2160)p[^)]*\)/i,
  ];
  const splitAt = splitPatterns
    .map((pattern) => {
      const match = title.match(pattern);
      return typeof match?.index === 'number' && match.index > 0 ? match.index : -1;
    })
    .filter((index) => index > 0)
    .sort((left, right) => left - right)[0];
  if (splitAt) title = title.slice(0, splitAt);

  title = title
    .replace(/\b(?:480|720|1080|2160)p\b.*$/i, ' ')
    .replace(/\b(?:x26[45]|h\.?26[45]|avc|hevc|aac|flac|opus|ddp\d?(?:\.\d)?|10bits?|8bits?)\b.*$/i, ' ')
    .replace(/\b(?:web(?:rip|dl)?|blu(?:ray)?|bd(?:rip)?|hdtv|amzn|cr|netflix|nf)\b.*$/i, ' ')
    .replace(/\b(?:dual|multi)[\s-]?audio\b.*$/i, ' ')
    .replace(/\b(?:multi|eng|english)[\s-]?(?:sub|subs|dub)\b.*$/i, ' ');

  return normalizeSourceMatchText(title);
}

function sourceTitleCompatibility(title = '', aliases: string[]) {
  const parsedTitle = parseSourceAnimeTitle(title);
  const aliasForms = uniqueTextValues(aliases.flatMap((alias) => sourceAliasForms(alias)));
  const sourceTokens = uniqueSourceTokens(parsedTitle);
  let bestScore = 0;
  let bestSharedTokens: string[] = [];

  for (const alias of aliasForms) {
    const aliasTokens = uniqueSourceTokens(alias);
    if (parsedTitle && alias && parsedTitle.includes(alias)) {
      return {
        compatible: true,
        score: 100,
        parsedTitle,
        sharedTokens: aliasTokens,
        reason: 'accepted:exact-title',
      };
    }
    if (parsedTitle && alias && alias.includes(parsedTitle) && sourceTokens.length >= 2) {
      return {
        compatible: true,
        score: 92,
        parsedTitle,
        sharedTokens: sourceTokens,
        reason: 'accepted:source-title-contained',
      };
    }
    if (aliasTokens.length < 2 || sourceTokens.length < 2) continue;
    const sharedTokens = aliasTokens.filter((token) => sourceTokens.includes(token));
    const score = sharedTokens.length / Math.max(aliasTokens.length, 1);
    if (score > bestScore) {
      bestScore = score;
      bestSharedTokens = sharedTokens;
    }
    if (sharedTokens.length >= 2 && score >= 0.78) {
      return {
        compatible: true,
        score: Math.round(score * 100),
        parsedTitle,
        sharedTokens,
        reason: 'accepted:token-title',
      };
    }
  }

  const reason = bestSharedTokens.length === 1
    ? 'rejected:single-token-overlap'
    : 'rejected:title-mismatch';
  return {
    compatible: false,
    score: Math.round(bestScore * 100),
    parsedTitle,
    sharedTokens: bestSharedTokens,
    reason,
  };
}

function debugSourceDecision(payload: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem('streamnyaa.debugSourceMatching') !== 'true') return;
    console.debug('[StreamNyaa source match]', payload);
  } catch {
    // Debug logging should never affect source filtering.
  }
}

function debugSourceLoading(step: string, payload: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem('streamnyaa.debugSourceLoading') !== 'true') return;
    console.debug(`[StreamNyaa Watch] source-load ${step}`, payload);
  } catch {
    // Timing logs are optional diagnostics and must never affect source loading.
  }
}

function isSafeSourceQueryTitle(value = '') {
  const normalized = normalizeSourceMatchText(value);
  if (!normalized || normalized === 'anime') return false;
  const rawTokens = normalized.split(' ').filter(Boolean);
  const distinctiveTokens = uniqueSourceTokens(normalized);
  if (rawTokens.length >= 2) return true;
  return distinctiveTokens.length === 1
    && distinctiveTokens[0].length >= 5
    && !['hunter', 'journey', 'piece'].includes(distinctiveTokens[0]);
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
  const entries = Object.entries(records)
    .map(([key, record]) => {
      const cleaned = { ...record };
      if (isObsoleteLargeSourceFailure(cleaned.message || '')) {
        cleaned.failedAt = 0;
        cleaned.message = '';
      }
      return [key, cleaned] as const;
    })
    .filter(([, record]) => {
      const failureFresh = Boolean(record.failedAt && now - Number(record.failedAt) <= FAILED_SOURCE_MEMORY_TTL);
      const successFresh = Boolean(record.successAt && now - Number(record.successAt) <= SOURCE_SUCCESS_MEMORY_TTL);
      return failureFresh || successFresh;
    })
    .sort((left, right) => Math.max(Number(right[1].failedAt || 0), Number(right[1].successAt || 0)) - Math.max(Number(left[1].failedAt || 0), Number(left[1].successAt || 0)))
    .slice(0, FAILED_SOURCE_MEMORY_LIMIT);
  return Object.fromEntries(entries) as Record<string, SourceFailureRecord>;
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
  if (/superseded|stale|cancelled|canceled|user selected|playback request was superseded|source switch/i.test(message)) return;
  const records = loadSourceFailureRecords();
  const previous = records[key] || {};
  records[key] = {
    ...previous,
    failedAt: Date.now(),
    message: message.slice(0, 220),
    animeId: context.animeId,
    episode: context.episode,
    failureCount: Math.min(20, Number(previous.failureCount || 0) + 1),
  };
  saveSourceFailureRecords(records);
}

function rememberSourceSuccess(source: RankedNyaaItem) {
  const key = sourceFailureKey(source);
  if (!key) return;
  const records = loadSourceFailureRecords();
  const previous = records[key] || {};
  records[key] = {
    ...previous,
    failedAt: 0,
    message: '',
    successAt: Date.now(),
    successCount: Math.min(50, Number(previous.successCount || 0) + 1),
  };
  saveSourceFailureRecords(records);
}

function sourceFailureFor(source: RankedNyaaItem, records: Record<string, SourceFailureRecord>) {
  const key = sourceFailureKey(source);
  const record = key ? records[key] || null : null;
  if (!record?.failedAt) return null;
  if (Date.now() - Number(record.failedAt) > FAILED_SOURCE_MEMORY_TTL) return null;
  if (record.successAt && Number(record.successAt) > Number(record.failedAt)) return null;
  return record;
}

function sourceSuccessFor(source: RankedNyaaItem, records: Record<string, SourceFailureRecord>) {
  const key = sourceFailureKey(source);
  const record = key ? records[key] || null : null;
  if (!record?.successAt) return null;
  if (Date.now() - Number(record.successAt) > SOURCE_SUCCESS_MEMORY_TTL) return null;
  return record;
}

function sourceFailurePenalty(source: RankedNyaaItem, records: Record<string, SourceFailureRecord>) {
  const record = sourceFailureFor(source, records);
  if (!record) return 0;
  const ageRatio = Math.max(0, Math.min(1, (Date.now() - Number(record.failedAt || 0)) / FAILED_SOURCE_MEMORY_TTL));
  const message = String(record.message || '');
  const severity = /no playable|metadata|invalid|400 bad request|expected scheme magnet|no seed|no peer|timeout/i.test(message)
    ? 92
    : /mpv|player|load stream/i.test(message)
      ? 72
      : 58;
  const repeatWeight = Math.min(22, Math.max(0, Number(record.failureCount || 1) - 1) * 6);
  return Math.round((severity + repeatWeight) * (1 - ageRatio));
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
  const structuredTitle = anime?.title && typeof anime.title === 'object'
    ? [anime.title?.english, anime.title?.romaji, anime.title?.native]
    : [];
  const listedTitles = Array.isArray(anime?.titles)
    ? anime.titles.flatMap((item: any) => [item?.title, item?.name, item])
    : [];
  const synonyms = Array.isArray(anime?.synonyms) ? anime.synonyms : [];
  const titleSynonyms = Array.isArray(anime?.title_synonyms) ? anime.title_synonyms : [];
  const raw = uniqueTextValues([
    installment?.name,
    anime?.title_romaji,
    anime?.title_english,
    anime?.title_japanese,
    anime?.title,
    routeTitle,
    ...structuredTitle,
    ...listedTitles,
    ...synonyms,
    ...titleSynonyms,
  ].map((value) => (typeof value === 'string' ? value : '')));

  return uniqueTextValues(raw.flatMap((title) => {
    const cleaned = cleanTitle(title);
    const stripped = stripSeasonDecorators(title);
    const withoutJoinerX = cleaned.replace(/\bx\b/ig, ' ');
    return [title, cleaned, stripped, withoutJoinerX];
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
  return sourceTitleCompatibility(title, aliases).compatible;
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
  const titleCompatibility = sourceTitleCompatibility(title, aliases);
  const titleMatch = titleCompatibility.compatible;
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
  if (titleMatch) reasons.push(titleCompatibility.reason);
  else reasons.push(titleCompatibility.reason);
  if (titleCompatibility.parsedTitle) reasons.push(`Parsed title: ${titleCompatibility.parsedTitle}`);
  if (mismatchReason) reasons.push(mismatchReason);
  if (episodeMatch) reasons.push(context.installment?.kind === 'movie' ? 'Movie match' : 'Exact episode');
  if (explicitKind) reasons.push(explicitKind === 'season' ? 'TV season' : explicitKind.toUpperCase());
  if (laterSeasonNeedsSeasonSignal && !hasRequiredSeasonSignal) reasons.push('Missing season signal');
  if (context.installment?.partNumber && !hasRequiredPartSignal) reasons.push('Missing part signal');
  if (context.installment?.label) reasons.push(context.installment.label);
  if (videoSized) reasons.push('Sane size');

  debugSourceDecision({
    selectedAnime: context.anime?.title || context.anime?.title_english || context.anime?.title_romaji,
    selectedEpisode: context.episode,
    searchQuery: source.matchedQuery || '',
    rawSourceTitle: title,
    parsedSourceAnimeTitle: titleCompatibility.parsedTitle,
    titleMatchScore: titleCompatibility.score,
    sharedTokens: titleCompatibility.sharedTokens,
    episodeMatch,
    rejectionReason: titleCompatibility.compatible ? '' : titleCompatibility.reason,
  });

  if (!isAncillarySource(title) && validInput && titleMatch && !mismatchReason) {
    if (episodeMatch && seeded && hasRequiredSeasonSignal && hasRequiredPartSignal) matchTier = isBatchSource(title) ? 'likely' : 'exact';
    else if (episodeMatch || seeded) matchTier = 'likely';
    else matchTier = 'broad';
  }

  const structurallyPlayable = validInput
    && seeded
    && !isAncillarySource(title)
    && !mismatchReason
    && matchTier !== 'rejected';
  const playableStatus: SourcePlayableStatus = !validInput
    ? 'unsupported'
    : mismatchReason || !titleMatch
      ? 'likely-wrong'
      : !seeded
        ? 'low-seed'
        : matchTier === 'exact'
          ? 'verified'
          : 'untested';
  const playable = structurallyPlayable;
  const playableLabel = playableStatus === 'verified'
    ? 'High confidence'
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
  if (currentKind === 'season') return TIMELINE_RELATIONS.has(relationType);
  return TIMELINE_RELATIONS.has(relationType);
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

function hasPlayableVideoSignal(title = '') {
  return /\.(mkv|mp4|webm|avi)(?:\b|$)/i.test(title)
    || /\b(?:mkv|mp4|web[-\s]?dl|web[-\s]?rip|blu[-\s]?ray|bdrip|hdtv)\b/i.test(title);
}

function hasUnsupportedContainerSignal(title = '') {
  return /\.(zip|rar|7z|iso|exe)(?:\b|$)/i.test(title)
    || /\b(?:sample|samples|extras|scan|scans|ost|soundtrack|pdf|ebook)\b/i.test(title);
}

function sourceSizeConfidence(source: NyaaItem) {
  const size = Number(source.rawSize || 0);
  if (size <= 0) return -4;
  const mib = size / 1024 / 1024;
  const gib = size / 1024 / 1024 / 1024;
  if (mib < 45) return -30;
  if (mib < 90) return -16;
  if (gib > 12) return -18;
  if (gib > 8) return -10;
  if (gib >= 0.12 && gib <= 5.5) return 8;
  return 2;
}

function sourceAudioPreferenceScore(source: NyaaItem, audioPreference: DesktopAudioPreference, audioMode: AudioMode) {
  if (audioMode === 'sub') return isDubOnlySource(source.title) ? -24 : 8;
  if (audioPreference === 'dub-only') {
    if (isDubOnlySource(source.title)) return 18;
    if (isDualAudioSource(source.title)) return 12;
    if (isDubSource(source.title)) return 8;
    return -12;
  }
  if (isDualAudioSource(source.title)) return 18;
  if (isDubSource(source.title)) return 10;
  return -4;
}

function sourceHistoryBoost(source: RankedNyaaItem, records: Record<string, SourceFailureRecord>) {
  const success = sourceSuccessFor(source, records);
  if (!success) return 0;
  const ageRatio = Math.max(0, Math.min(1, (Date.now() - Number(success.successAt || 0)) / SOURCE_SUCCESS_MEMORY_TTL));
  return Math.round((18 + Math.min(12, Number(success.successCount || 1) * 3)) * (1 - ageRatio));
}

function sourceConfidenceScore(
  source: RankedNyaaItem,
  records: Record<string, SourceFailureRecord>,
  audioPreference: DesktopAudioPreference,
  audioMode: AudioMode,
) {
  let score = source.matchTier === 'exact' ? 56 : source.matchTier === 'likely' ? 40 : source.matchTier === 'broad' ? 20 : 0;

  if (!sourceHasValidInput(source)) score -= 48;
  if (source.playableStatus === 'unsupported') score -= 40;
  if (source.playableStatus === 'likely-wrong') score -= 34;
  if (source.rawSeeders >= 100) score += 18;
  else if (source.rawSeeders >= 50) score += 14;
  else if (source.rawSeeders >= 15) score += 10;
  else if (source.rawSeeders > 0) score += 4;
  else score -= 34;

  if (source.matchReasons.includes('Exact episode') || source.matchReasons.includes('Movie match')) score += 12;
  if (source.matchReasons.some((reason) => /^Wrong |Missing season|Missing part|Loose title/i.test(reason))) score -= 18;
  if (isTrustedSource(source)) score += 10;
  if (hasPlayableVideoSignal(source.title)) score += 8;
  if (hasUnsupportedContainerSignal(source.title)) score -= 48;
  if (/\b1080p\b/i.test(source.title)) score += 7;
  if (/\b720p\b/i.test(source.title)) score += 4;
  if (/\b(hevc|h\.?265|x265|avc|h\.?264|x264)\b/i.test(source.title)) score += 4;
  if (isBatchSource(source.title)) score -= sourceSuccessFor(source, records) ? 6 : 18;
  score += sourceSizeConfidence(source);
  score += sourceAudioPreferenceScore(source, audioPreference, audioMode);
  score += Math.min(10, Math.max(0, Number(source.sourceScore || source.matchScore || 0) / 12));
  score += sourceHistoryBoost(source, records);
  score -= sourceFailurePenalty(source, records);

  return Math.round(clampNumber(score, 0, 100));
}

function sourceConfidenceMeta(
  source: RankedNyaaItem,
  records: Record<string, SourceFailureRecord>,
  audioPreference: DesktopAudioPreference,
  audioMode: AudioMode,
): { score: number; band: SourceConfidenceBand; label: string } {
  const score = sourceConfidenceScore(source, records, audioPreference, audioMode);
  if (sourceFailureFor(source, records)) return { score, band: 'failed', label: 'Recently failed' };
  if (sourceSuccessFor(source, records)) return { score, band: 'high', label: 'Worked before' };
  if (score >= 78) return { score, band: 'high', label: 'High confidence' };
  if (score >= 55) return { score, band: 'medium', label: 'Likely playable' };
  if (score >= 32) return { score, band: 'low', label: 'Unverified' };
  return { score, band: 'failed', label: 'Low confidence' };
}

function sourceConfidenceBadges(
  source: RankedNyaaItem,
  records: Record<string, SourceFailureRecord>,
  audioPreference: DesktopAudioPreference,
  audioMode: AudioMode,
) {
  const badges: string[] = [];
  if (sourceSuccessFor(source, records)) badges.push('Worked before');
  if (source.rawSeeders >= 50) badges.push('Healthy peers');
  else if (source.rawSeeders > 0) badges.push('Has seeders');
  if (source.matchReasons.includes('Exact episode') || source.matchReasons.includes('Movie match')) badges.push('Exact episode');
  if (isBatchSource(source.title)) badges.push('Batch');
  if (isDualAudioSource(source.title)) badges.push('Dual audio');
  else if (audioMode === 'sub' && !isDubOnlySource(source.title)) badges.push('Sub-safe');
  if (isTrustedSource(source)) badges.push('Trusted');
  if (hasPlayableVideoSignal(source.title)) badges.push('Video file');
  return badges.filter((badge, index, list) => list.indexOf(badge) === index).slice(0, 4);
}

function sourceMeetsConfidenceMode(
  source: RankedNyaaItem,
  mode: SourceFilterMode,
  shouldUseBroadFallback: boolean,
  records: Record<string, SourceFailureRecord>,
  audioPreference: DesktopAudioPreference,
  audioMode: AudioMode,
) {
  if (!source.playable) return false;
  const score = sourceConfidenceScore(source, records, audioPreference, audioMode);
  const workedBefore = Boolean(sourceSuccessFor(source, records));
  const recentlyFailed = Boolean(sourceFailureFor(source, records));
  if (mode === 'strict') {
    return source.matchTier === 'exact'
      && score >= 72
      && !recentlyFailed
      && (!isBatchSource(source.title) || workedBefore);
  }
  if (mode === 'balanced') {
    if (source.matchTier === 'broad' && !shouldUseBroadFallback) return false;
    if (isBatchSource(source.title) && !workedBefore && score < 68) return false;
    return score >= 42;
  }
  return score >= 16;
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

function sourceQualityBucket(title = ''): SourceQualityFilter {
  if (/\b(?:2160p|4k|uhd)\b/i.test(title)) return '2160p';
  if (/\b1080p\b/i.test(title)) return '1080p';
  if (/\b720p\b/i.test(title)) return '720p';
  if (/\b480p\b/i.test(title)) return '480p';
  return 'other';
}

function sourceQualityLabel(quality: SourceQualityFilter) {
  if (quality === 'auto') return 'Auto';
  if (quality === 'other') return 'Other';
  return quality;
}

function sourceCountLabel(count: number, label: string) {
  return `${count} ${label} match${count === 1 ? '' : 'es'}`;
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
  const relatedAnimeKinds = new Set<InstallmentKind>(['season', 'movie', 'ova', 'ona', 'special']);
  if (currentKind === 'season' || currentKind === 'movie' || currentKind === 'ova' || currentKind === 'ona' || currentKind === 'special') {
    return relatedAnimeKinds;
  }
  return relatedAnimeKinds;
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

  const rootTitle = titleForInstallment(rootAnime);
  const nextTitle = titleForInstallment(item);
  if (!sameSeriesFamily(rootTitle, nextTitle)) return false;
  if (kind !== 'season') return true;
  if (relationType === 'PREQUEL' || relationType === 'SEQUEL' || relationType === 'PARENT') return true;
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
      episodeCount: Number(item?.episodes || item?.episodeCount || item?.totalEpisodes || 0) || null,
      image: item?.coverImage?.extraLarge
        || item?.coverImage?.large
        || item?.images?.webp?.large_image_url
        || item?.images?.jpg?.large_image_url
        || item?.images?.jpg?.image_url
        || item?.image
        || item?.thumbnail
        || '',
      bannerImage: item?.banner_image || item?.bannerImage || item?.trailer?.images?.maximum_image_url || '',
    };
    const identity = installmentIdentity(nextItem);
    const existing = deduped.get(identity);
    deduped.set(identity, existing ? preferInstallmentCandidate(existing, nextItem) : nextItem);
  };

  pushItem({
    mal_id: anime?.mal_id,
    id: anime?.id,
    ...anime,
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

function installmentKindLabel(item: InstallmentItem) {
  if (item.kind === 'season') return 'TV';
  return item.kind.toUpperCase();
}

function installmentPrimaryLabel(item: InstallmentItem) {
  return item.label || (item.kind === 'season' ? 'Season' : installmentKindLabel(item));
}

function installmentSequenceBadge(item: InstallmentItem) {
  if (item.kind === 'season') {
    if (item.seasonNumber && item.partNumber) return `S${item.seasonNumber} P${item.partNumber}`;
    if (item.seasonNumber) return `S${item.seasonNumber}`;
    return 'TV';
  }
  const ordinal = installmentOrdinal(item);
  return ordinal ? `${installmentKindLabel(item)} ${ordinal}` : installmentKindLabel(item);
}

function installmentRelationLabel(item: InstallmentItem) {
  const relation = String(item.relation || '').toUpperCase();
  if (item.current || relation === 'CURRENT') return 'Current';
  if (relation === 'PREQUEL') return 'Prequel';
  if (relation === 'SEQUEL') return 'Sequel';
  if (relation === 'PARENT') return 'Parent';
  return item.label;
}

function installmentMetaParts(item: InstallmentItem) {
  return [
    installmentRelationLabel(item),
    installmentKindLabel(item),
    item.year ? String(item.year) : '',
    item.episodeCount ? `${item.episodeCount} eps` : '',
  ].filter(Boolean);
}

function installmentCardImageCandidates(item: InstallmentItem, anime: any) {
  return uniqueImageCandidates([
    item.bannerImage,
    item.image,
    item.current ? wideImageFor(anime) : '',
    item.current ? posterFor(anime) : '',
  ]);
}

function TimelineSkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="relative h-[118px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-lg shadow-black/18"
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025)_46%,rgba(255,255,255,0.04)),radial-gradient(circle_at_86%_0%,rgba(244,63,94,0.14),transparent_46%)]" />
      <div className="relative flex h-full gap-4 p-4">
        <div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-white/10" />
        <div className="min-w-0 flex-1">
          <div className="h-5 w-28 animate-pulse rounded bg-white/10" />
          <div className="mt-3 h-3 w-40 animate-pulse rounded bg-white/8" />
          <div className="mt-4 flex gap-2">
            <div className="h-3 w-12 animate-pulse rounded bg-white/7" />
            <div className="h-3 w-14 animate-pulse rounded bg-white/7" />
            <div className="h-3 w-10 animate-pulse rounded bg-white/7" />
          </div>
        </div>
      </div>
    </div>
  );
}

function railScroll(ref: { current: HTMLDivElement | null }, direction: 'left' | 'right', distance = 420) {
  ref.current?.scrollBy({ left: direction === 'left' ? -distance : distance, behavior: 'smooth' });
}

type RailWheelEvent = {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  preventDefault: () => void;
  stopPropagation: () => void;
};

function railWheelScroll(event: RailWheelEvent, rail: HTMLDivElement | null) {
  if (!rail) return;
  const deltaUnit = event.deltaMode === 1 ? 36 : event.deltaMode === 2 ? rail.clientWidth : 1;
  const deltaX = event.deltaX * deltaUnit;
  const deltaY = event.deltaY * deltaUnit;
  const delta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  if (!delta) return;
  const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
  if (maxScroll <= 1) return;
  const atStart = rail.scrollLeft <= 0.5;
  const atEnd = rail.scrollLeft >= maxScroll - 0.5;
  const canScrollInDirection = delta < 0 ? !atStart : !atEnd;
  if (!canScrollInDirection) return;

  const nextScroll = clampNumber(rail.scrollLeft + delta, 0, maxScroll);
  if (Math.abs(nextScroll - rail.scrollLeft) < 0.5) return;
  event.preventDefault();
  event.stopPropagation();
  rail.scrollLeft = nextScroll;
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
  const [autoPlayNextEpisode, setAutoPlayNextEpisode] = useState(() => loadDesktopAutoPlayNextEpisode());
  const [audioMode, setAudioMode] = useState<AudioMode>(() => {
    const requestedType = searchParams.get('type');
    if (requestedType === 'dub' || requestedType === 'sub') return requestedType;
    return watchTypeForAudioPreference(loadDesktopAudioPreference());
  });
  const [sortBy, setSortBy] = useState<SourceSort>('best');
  const [sourceMode, setSourceMode] = useState<SourceFilterMode>('balanced');
  const [sourceQuality, setSourceQuality] = useState<SourceQualityFilter>('auto');
  const [episodeSearch, setEpisodeSearch] = useState('');
  const [episodeViewMode, setEpisodeViewMode] = useState<EpisodeViewMode>('cards');
  const [episodeJumpValue, setEpisodeJumpValue] = useState('');
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [episodeRailDragging, setEpisodeRailDragging] = useState(false);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [playback, setPlayback] = useState<{ torrentId: string; title: string; source: LocalPlaybackSource } | null>(null);
  const [playerControlBusy, setPlayerControlBusy] = useState<string | null>(null);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null);
  const [playbackNotice, setPlaybackNotice] = useState<PlaybackNotice | null>(null);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<string>>(() => new Set());
  const [failedSourceVersion, setFailedSourceVersion] = useState(0);
  const routeAniListId = searchParams.get('aid') || '';
  const routeMalId = searchParams.get('mid') || '';
  const seasonRailRef = useRef<HTMLDivElement | null>(null);
  const episodesRailRef = useRef<HTMLDivElement | null>(null);
  const episodeDragRef = useRef({ dragging: false, moved: false, pointerId: 0, startX: 0, startY: 0, scrollLeft: 0 });
  const suppressEpisodeClickRef = useRef(false);
  const sourceSectionRef = useRef<HTMLElement | null>(null);
  const selectedSeasonRef = useRef<HTMLButtonElement | null>(null);
  const selectedEpisodeRef = useRef<HTMLDivElement | null>(null);
  const playActionLockRef = useRef(false);
  const playbackRequestIdRef = useRef(0);
  const [pendingAutoPlayEpisode, setPendingAutoPlayEpisode] = useState<number | null>(null);
  const requestedType = searchParams.get('type');
  const routeMarkedUpcoming = searchParams.get('upcoming') === '1';
  const autoPlayNextEpisodeRef = useRef(autoPlayNextEpisode);
  const lastNextEpisodeRequestRef = useRef<{ episode: number; reason: string; at: number } | null>(null);
  const selectedEpisodeNumberRef = useRef(1);
  const maxEpisodeRef = useRef(1);
  const activeSourceIdValueRef = useRef<string | null>(null);
  const sourcesBusyRef = useRef(false);
  const playableSourcesRef = useRef<RankedNyaaItem[]>([]);
  const playableSourcesEpisodeRef = useRef(0);
  const playSourceRef = useRef<(source: RankedNyaaItem, resumeOverride?: number) => void | Promise<void>>(() => {});
  const playNextEpisodeRef = useRef<(reason?: 'manual' | 'ended' | string) => void>(() => {});
  const playbackValueRef = useRef(playback);
  const pendingAutoPlayEpisodeRef = useRef<number | null>(null);
  const preferenceSyncRetryRef = useRef<number | null>(null);

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

  useEffect(() => subscribeDesktopAutoPlayNextEpisode(() => {
    const preferences = loadDesktopPlayerPreferences();
    setAutoPlayNextEpisode(preferences.autoNextEpisode);
  }), []);

  useEffect(() => subscribeDesktopPlayerPreferences(() => {
    const preferences = loadDesktopPlayerPreferences();
    setAutoPlayNextEpisode(preferences.autoNextEpisode);
  }), []);

  useEffect(() => {
    autoPlayNextEpisodeRef.current = autoPlayNextEpisode;
  }, [autoPlayNextEpisode]);

  const syncPlayerPreferences = useCallback((reason: string, retry = true) => {
    const preferences = loadDesktopPlayerPreferences();
    setAutoPlayNextEpisode(preferences.autoNextEpisode);
    autoPlayNextEpisodeRef.current = preferences.autoNextEpisode;
    void syncDesktopPlayerPreferencesToPlayer(preferences).then((result) => {
      if (!result.ok && retry) {
        if (preferenceSyncRetryRef.current !== null) {
          window.clearTimeout(preferenceSyncRetryRef.current);
        }
        preferenceSyncRetryRef.current = window.setTimeout(() => {
          preferenceSyncRetryRef.current = null;
          syncPlayerPreferences(`${reason}:retry`, false);
        }, 650);
      }
      if (result.ok) {
        console.info(`[StreamNyaa Watch] Synced desktop player settings to MPV reason=${reason}`);
      } else {
        console.info(`[StreamNyaa Watch] Desktop player settings sync incomplete reason=${reason} failed=${result.failed.join(',')}`);
      }
    }).catch(() => {
      if (!retry) return;
      if (preferenceSyncRetryRef.current !== null) {
        window.clearTimeout(preferenceSyncRetryRef.current);
      }
      preferenceSyncRetryRef.current = window.setTimeout(() => {
        preferenceSyncRetryRef.current = null;
        syncPlayerPreferences(`${reason}:retry`, false);
      }, 650);
    });
  }, []);

  useEffect(() => () => {
    if (preferenceSyncRetryRef.current !== null) {
      window.clearTimeout(preferenceSyncRetryRef.current);
      preferenceSyncRetryRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!playback?.torrentId) return;
    syncPlayerPreferences('playback-state');
  }, [playback?.torrentId, syncPlayerPreferences]);

  useEffect(() => {
    setSynopsisExpanded(false);
  }, [id]);

  useEffect(() => {
    const nextPreference = loadDesktopAudioPreference();
    setAudioPreference(nextPreference);
    const nextMode = requestedType === 'dub' || requestedType === 'sub'
      ? requestedType
      : watchTypeForAudioPreference(nextPreference);
    setAudioMode((current) => (current === nextMode ? current : nextMode));
  }, [requestedType, id]);

  const setSourceAudioPreference = useCallback((preference: DesktopAudioPreference) => {
    setAudioPreference(preference);
    saveDesktopAudioPreference(preference);
    const nextMode = watchTypeForAudioPreference(preference);
    setAudioMode(nextMode);
    const next = new URLSearchParams(searchParams);
    next.set('type', nextMode);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

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
  const usingPlaceholderDetails = Boolean((detailsQuery as { isPlaceholderData?: boolean }).isPlaceholderData);
  const resolvedAnime = usingPlaceholderDetails ? null : detailsQuery.data?.data;
  const anime = resolvedAnime || fallbackAnime;
  const animeNotYetAired = routeMarkedUpcoming || isUpcomingAnime(anime);
  const hasFullMetadata = Boolean(resolvedAnime);
  const metadataFailed = detailsQuery.isError && !usingPlaceholderDetails;
  const metadataLoading = Boolean(id)
    && !metadataFailed
    && (detailsQuery.isLoading || usingPlaceholderDetails || (detailsQuery.isFetching && !hasFullMetadata));
  const episodeLookupId = String(routeMalId || anime?.mal_id || id || '').trim();
  const canFetchEpisodeMetadata = /\d/.test(episodeLookupId);
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
  const timelineCacheKey = useMemo(
    () => String(
      anime?.mal_id
        || routeMalId
        || anime?.anilist_id
        || routeAniListId
        || anime?.id
        || id
        || '',
    ).trim(),
    [anime?.anilist_id, anime?.id, anime?.mal_id, id, routeAniListId, routeMalId],
  );

  const installmentGraphQuery = useQuery({
    queryKey: ['desktop-watch-installments-graph', timelineCacheKey, currentInstallmentKind],
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
      const maxNodes = 36;
      const batchSize = 6;
      let depth = 0;

      while ((preferredQueue.length || secondaryQueue.length) && discovered.length < maxNodes && depth < 8) {
        const batch: GraphQueueEntry[] = [];
        while (batch.length < batchSize && (preferredQueue.length || secondaryQueue.length) && discovered.length + batch.length < maxNodes) {
          const nextEntry = preferredQueue.shift() || secondaryQueue.shift();
          if (!nextEntry) continue;
          const nextIdentity = identityFor(nextEntry);
          if (seen.has(nextIdentity)) continue;
          seen.add(nextIdentity);
          batch.push(nextEntry);
        }
        if (!batch.length) break;

        const details = await Promise.allSettled(batch.map((nextEntry) => fetchAnimeDetails(nextEntry.routeId, {
          anilistId: nextEntry.anilistId,
          malId: nextEntry.malId,
          routeTitle: nextEntry.title,
        }).then((detail) => ({ detail, nextEntry }))));

        details.forEach((result) => {
          if (result.status !== 'fulfilled') return;
          const { detail, nextEntry } = result.value;
          const relatedAnime = detail?.data;
          if (!relatedAnime) return;
          discovered.push({ ...relatedAnime, relation: nextEntry.relation });

          relationEntriesForGraph(relatedAnime)
            .filter(graphEntryAllowed)
            .forEach(enqueue);
        });
        depth += 1;
      }

      return discovered;
    },
    enabled: Boolean(timelineCacheKey) && hasFullMetadata,
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });
  const installmentGraphData = installmentGraphQuery.data;
  const installmentGraphInitialLoading = Boolean(hasFullMetadata && !metadataFailed && installmentGraphQuery.isLoading);

  const { data: episodeData } = useQuery({
    queryKey: ['episodes', episodeLookupId, episodePage],
    queryFn: async () => {
      if (!canFetchEpisodeMetadata) {
        return { data: [], pagination: { last_visible_page: 1 } };
      }
      return fetchAnimeEpisodes(episodeLookupId, episodePage);
    },
    enabled: canFetchEpisodeMetadata,
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
  const showTimelineSkeletons = installmentGraphInitialLoading;
  const leftPanelInfo = useMemo(() => {
    const animeInfo: any = anime;
    const year = Number(animeInfo?.year || animeInfo?.seasonYear || 0);
    const type = compactAnimeType(animeInfo?.type || animeInfo?.format || '');
    const episodeCount = airedCount || Number(animeInfo?.episodes || animeInfo?.episodeCount || 0) || 0;
    const score = Number(animeInfo?.score || 0);
    const rawStatus = String(animeInfo?.status || '').trim();
    const rawSeason = String(animeInfo?.season || '').trim();
    const status = rawStatus && rawStatus.toUpperCase() !== 'UNKNOWN' ? formatCompactLabel(rawStatus) : '';
    const season = rawSeason && rawSeason.toUpperCase() !== 'UNKNOWN' ? formatCompactLabel(rawSeason) : '';
    const duration = String(animeInfo?.duration || '').replace(/\s+per\s+ep(?:isode)?\.?/i, '').trim();
    const studios = animeStudiosFor(animeInfo);
    const synopsis = String(animeInfo?.synopsis || '').trim();
    const maxSynopsisChars = 430;
    const canExpandSynopsis = synopsis.length > maxSynopsisChars;
    const visibleSynopsis = canExpandSynopsis && !synopsisExpanded
      ? `${synopsis.slice(0, maxSynopsisChars).trim()}...`
      : synopsis;
    const genres = (animeInfo?.genres || [])
      .map((genre: any) => ({ name: String(genre?.name || genre || '').trim() }))
      .filter((genre: any) => genre.name)
      .slice(0, 6);
    const totalGenres = Array.isArray(animeInfo?.genres) ? animeInfo.genres.length : genres.length;

    return {
      trailerUrl: trailerUrlFor(animeInfo),
      trailerYear: year ? String(year) : '',
      genres,
      extraGenreCount: Math.max(0, totalGenres - genres.length),
      primaryMeta: [
        year ? String(year) : '',
        type,
        episodeCount ? `${episodeCount} ${episodeCount === 1 ? 'episode' : 'episodes'}` : '',
      ].filter(Boolean),
      secondaryMeta: [
        score ? `Rating ${score.toFixed(1)}` : '',
        status,
        season,
      ].filter(Boolean),
      detailMeta: [
        duration,
        studios.length ? `Studio ${studios.slice(0, 2).join(', ')}${studios.length > 2 ? ` +${studios.length - 2}` : ''}` : '',
      ].filter(Boolean),
      visibleSynopsis,
      canExpandSynopsis,
    };
  }, [airedCount, anime, synopsisExpanded]);
  const trailerEmbedUrl = useMemo(() => youtubeEmbedUrlFor(leftPanelInfo.trailerUrl), [leftPanelInfo.trailerUrl]);
  const trailerPreviewImages = useMemo(
    () => {
      const animeInfo: any = anime;
      return uniqueImageCandidates([
        animeInfo?.trailer?.images?.maximum_image_url,
        animeInfo?.trailer?.images?.large_image_url,
        wideImageFor(animeInfo),
        posterFor(animeInfo),
      ]);
    },
    [anime],
  );

  useEffect(() => {
    setTrailerOpen(false);
  }, [anime?.mal_id, anime?.id, leftPanelInfo.trailerUrl]);

  const sourceSearchReady = useMemo(() => {
    if (animeNotYetAired) return false;
    if (selectedEpisode <= 0) return false;
    return sourceSearchTitleVariants(anime, id, selectedInstallment).some((title) => {
      const cleaned = cleanTitle(title).trim().toLowerCase();
      return Boolean(cleaned && isSafeSourceQueryTitle(cleaned));
    });
  }, [anime, animeNotYetAired, id, selectedEpisode, selectedInstallment]);

  const { data: sources, isLoading: sourcesLoading, isFetching: sourcesFetching, refetch: refetchSources } = useQuery({
    queryKey: ['desktop-watch-sources', anime?.title, anime?.title_english, anime?.title_romaji, selectedInstallment?.mal_id, selectedInstallment?.label, selectedEpisode, audioMode, audioPreference, sourceMode],
    queryFn: async ({ signal }) => {
      const epPadded = String(selectedEpisode).padStart(2, '0');
      const titleCandidates = sourceSearchTitleVariants(anime, id, selectedInstallment)
        .filter(isSafeSourceQueryTitle)
        .slice(0, 6);
      const seasonHints = sourceSearchSeasonHints(anime, id, selectedInstallment);
      const partHints = sourceSearchPartHints(anime, id, selectedInstallment);
      const audioSuffix = audioMode === 'dub' ? ' dub' : '';
      const requestId = `${Date.now().toString(36)}-${selectedEpisode}-${sourceMode}`;
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsedMs = () => Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt);
      const isAborted = () => Boolean(signal?.aborted);
      const finish = (items: RankedNyaaItem[], stage: string) => {
        debugSourceLoading('done', {
          request: requestId,
          stage,
          anime: anime?.title || anime?.title_english || anime?.title_romaji || id,
          episode: selectedEpisode,
          mode: sourceMode,
          count: items.length,
          totalMs: elapsedMs(),
          aborted: isAborted(),
        });
        return items;
      };

      debugSourceLoading('start', {
        request: requestId,
        anime: anime?.title || anime?.title_english || anime?.title_romaji || id,
        episode: selectedEpisode,
        mode: sourceMode,
        audioMode,
        titleCandidates: titleCandidates.length,
      });

      const normalizeSourcePool = (items: NyaaItem[]) => {
        const deduped = dedupeNyaaItems(items)
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

      const combineSources = (items: RankedNyaaItem[]) => dedupeNyaaItems(items) as RankedNyaaItem[];

      const runQuery = async (query: string, options: { pages?: number; wide?: boolean; deep?: boolean }) => {
        if (isAborted()) return [];
        const queryStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const result = await searchNyaa(query, '1_2', '0', '1', options);
        const queryMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - queryStartedAt);
        if (isAborted()) {
          debugSourceLoading('stale-query', { request: requestId, query, ms: queryMs });
          return [];
        }
        const normalized = normalizeSourcePool(result);
        debugSourceLoading('provider', { request: requestId, query, raw: result.length, usable: normalized.length, ms: queryMs });
        return normalized;
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
          if (isAborted()) return [];
          const batch = pending.slice(index, index + SOURCE_QUERY_BATCH_SIZE);
          const results = await Promise.all(batch.map(async (query) => ({ query, items: await runQuery(query, options) })));
          if (isAborted()) return [];
          const hitItems = combineSources(results.flatMap((result) => result.items));
          if (hitItems.length) return hitItems;
        }
        return [];
      };

      const seasonCodeEpisodeQueries = seasonHints.flatMap((seasonNumber) => titleCandidates.flatMap((title) => {
        const stripped = stripSeasonDecorators(title) || cleanTitle(title);
        const seasonPadded = String(seasonNumber).padStart(2, '0');
        const queries = [`${stripped} s${seasonPadded}e${epPadded}${audioSuffix}`];
        partHints.forEach((partNumber) => {
          queries.push(`${stripped} s${seasonPadded} part ${partNumber} e${epPadded}${audioSuffix}`);
          queries.push(`${stripped} season ${seasonNumber} part ${partNumber} episode ${selectedEpisode}${audioSuffix}`);
        });
        return queries;
      }));
      const exactEpisodeQueries = titleCandidates.flatMap((title) => {
        const cleanedTitle = cleanTitle(title);
        return [
          `${cleanedTitle} ${epPadded}${audioSuffix}`,
          `${cleanedTitle} episode ${selectedEpisode}${audioSuffix}`,
          `${cleanedTitle} ep ${selectedEpisode}${audioSuffix}`,
        ];
      });
      const exact = await tryQueries([...seasonCodeEpisodeQueries, ...exactEpisodeQueries], { pages: 2, wide: false, deep: false });
      if (isAborted()) return finish([], 'aborted-after-exact');
      if (exact.some((source) => source.matchTier === 'exact')) return finish(exact, 'exact');

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
      if (isAborted()) return finish([], 'aborted-after-season');
      const combinedSeason = combineSources([...exact, ...seasonEpisode]);
      if (sourceMode === 'strict') return finish(combinedSeason, 'strict-season');
      if (combinedSeason.some((source) => source.matchTier === 'exact' || source.matchTier === 'likely')) return finish(combinedSeason, 'exact-or-likely');

      const broadEpisodeQueries = titleCandidates.flatMap((title) => {
        const cleanedTitle = cleanTitle(title);
        return [
          `${cleanedTitle} ${selectedEpisode}${audioSuffix}`,
          `${cleanedTitle} ${epPadded}`,
          `${cleanedTitle} ${selectedEpisode}`,
        ];
      });
      const broad = await tryQueries(broadEpisodeQueries, { pages: 5, wide: true, deep: true });
      const combinedEpisode = combineSources([...exact, ...seasonEpisode, ...broad]);
      if (isAborted()) return finish([], 'aborted-after-broad');
      if (combinedEpisode.some((source) => source.matchTier === 'exact' || source.matchTier === 'likely') || (sourceMode === 'balanced' && combinedEpisode.length)) return finish(combinedEpisode, 'broad-needed');

      const fallback = await tryQueries(titleCandidates.map((title) => cleanTitle(title)), { pages: 5, wide: true, deep: true });
      if (isAborted()) return finish([], 'aborted-after-fallback');
      if (fallback.length) return finish(combineSources([...combinedEpisode, ...fallback]), 'fallback');

      return finish([], 'empty');
    },
    enabled: sourceSearchReady,
    staleTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
  });

  const failedSourceRecords = useMemo(() => loadSourceFailureRecords(), [failedSourceVersion]);
  const allRankedSources = useMemo<RankedNyaaItem[]>(() => {
    const items = [...((sources || []) as RankedNyaaItem[])];
    return items.sort((a, b) => {
      if (sortBy === 'seeders') return b.rawSeeders - a.rawSeeders;
      if (sortBy === 'size') return a.rawSize - b.rawSize;
      const confidenceDelta = sourceConfidenceScore(b, failedSourceRecords, audioPreference, audioMode) - sourceConfidenceScore(a, failedSourceRecords, audioPreference, audioMode);
      if (confidenceDelta !== 0) return confidenceDelta;
      const tierDifference = sourceTierWeight(a.matchTier) - sourceTierWeight(b.matchTier);
      if (tierDifference !== 0) return tierDifference;
      return sourceScore(b, audioPreference, audioMode) - sourceScore(a, audioPreference, audioMode);
    });
  }, [audioMode, audioPreference, failedSourceRecords, sortBy, sources]);
  const exactSources = useMemo(() => allRankedSources.filter((source) => source.matchTier === 'exact'), [allRankedSources]);
  const likelySources = useMemo(() => allRankedSources.filter((source) => source.matchTier === 'likely'), [allRankedSources]);
  const broadSources = useMemo(() => allRankedSources.filter((source) => source.matchTier === 'broad'), [allRankedSources]);
  const modeFilteredSources = useMemo(() => {
    const shouldUseBroadFallback = sourceMode === 'balanced' && !exactSources.length && !likelySources.length;
    const eligible = sourceMode === 'strict'
      ? exactSources
      : sourceMode === 'balanced'
        ? [...exactSources, ...likelySources, ...(shouldUseBroadFallback ? broadSources : [])]
        : [...exactSources, ...likelySources, ...broadSources];
    return eligible
      .filter((source) => sourceMeetsConfidenceMode(source, sourceMode, shouldUseBroadFallback, failedSourceRecords, audioPreference, audioMode))
      .sort((a, b) => sourceConfidenceScore(b, failedSourceRecords, audioPreference, audioMode) - sourceConfidenceScore(a, failedSourceRecords, audioPreference, audioMode));
  }, [audioMode, audioPreference, broadSources, exactSources, failedSourceRecords, likelySources, sourceMode]);
  const modeSortedSources = useMemo(() => {
    const shouldUseBroadFallback = sourceMode === 'balanced' && !exactSources.length && !likelySources.length;
    if (sourceMode === 'strict') {
      return exactSources.filter((source) => sourceMeetsConfidenceMode(source, sourceMode, false, failedSourceRecords, audioPreference, audioMode));
    }
    if (sourceMode === 'balanced') {
      const primary = [...exactSources, ...likelySources]
        .filter((source) => sourceMeetsConfidenceMode(source, sourceMode, shouldUseBroadFallback, failedSourceRecords, audioPreference, audioMode));
      const fallback = broadSources
        .filter((source) => sourceMeetsConfidenceMode(source, sourceMode, true, failedSourceRecords, audioPreference, audioMode));
      return primary.length ? primary : fallback;
    }
    return [...exactSources, ...likelySources, ...broadSources]
      .filter((source) => sourceMeetsConfidenceMode(source, sourceMode, true, failedSourceRecords, audioPreference, audioMode));
  }, [audioMode, audioPreference, broadSources, exactSources, failedSourceRecords, likelySources, sourceMode]);
  const qualityCounts = useMemo(() => {
    const counts = new Map<SourceQualityFilter, number>();
    modeSortedSources.forEach((source) => {
      const quality = sourceQualityBucket(source.title);
      counts.set(quality, (counts.get(quality) || 0) + 1);
    });
    return counts;
  }, [modeSortedSources]);
  const sourceQualityOptions = useMemo<SourceQualityFilter[]>(() => {
    const options: SourceQualityFilter[] = ['auto'];
    if (qualityCounts.has('2160p')) options.push('2160p');
    options.push('1080p', '720p', '480p');
    if (qualityCounts.has('other')) options.push('other');
    return options;
  }, [qualityCounts]);
  const playableSources = useMemo(() => (
    sourceQuality === 'auto'
      ? modeFilteredSources
      : modeFilteredSources.filter((source) => sourceQualityBucket(source.title) === sourceQuality)
  ), [modeFilteredSources, sourceQuality]);
  const sortedSources = useMemo(() => (
    sourceQuality === 'auto'
      ? modeSortedSources
      : modeSortedSources.filter((source) => sourceQualityBucket(source.title) === sourceQuality)
  ), [modeSortedSources, sourceQuality]);
  const visibleTierCounts = useMemo(() => ({
    exact: sortedSources.filter((source) => source.matchTier === 'exact').length,
    likely: sortedSources.filter((source) => source.matchTier === 'likely').length,
    broad: sortedSources.filter((source) => source.matchTier === 'broad').length,
  }), [sortedSources]);
  const sourceMatchSummary = useMemo(() => {
    const parts = [
      visibleTierCounts.exact > 0 ? sourceCountLabel(visibleTierCounts.exact, 'exact') : '',
      visibleTierCounts.likely > 0 ? sourceCountLabel(visibleTierCounts.likely, 'likely') : '',
      sourceMode === 'broad' || visibleTierCounts.broad > 0 ? sourceCountLabel(visibleTierCounts.broad, 'broad') : '',
    ].filter(Boolean);
    return parts.length ? parts.join(' • ') : 'No matches in this view';
  }, [sourceMode, visibleTierCounts]);
  const sourceSectionTitle = animeNotYetAired
    ? 'Still not aired'
    : sourcesLoading || (sourcesFetching && !sources?.length)
    ? `Finding sources for Episode ${selectedEpisode}...`
    : sortedSources.length
      ? `Sources for Episode ${selectedEpisode}`
      : `No reliable sources found for Episode ${selectedEpisode}`;
  const sourceSectionSubtitle = animeNotYetAired
    ? 'This title is listed as upcoming. StreamNyaa will enable source search after episodes are released.'
    : sortedSources.length
    ? 'Ranked by episode accuracy, quality, seeds, and subtitle preference.'
    : sourcesLoading || (sourcesFetching && !sources?.length)
      ? 'Checking episode match, seed health, audio preference, and release quality.'
    : sourceMode === 'broad'
      ? 'Try another episode, audio preference, or refresh the source list.'
      : 'Try Broad mode to include less certain matches.';
  const sourcesBusy = sourcesLoading || sourcesFetching;
  const nextPlayableSource = useMemo(
    () => playableSources.find((source) => !sourceFailureFor(source, failedSourceRecords)) || playableSources[0] || null,
    [failedSourceRecords, playableSources],
  );

  useEffect(() => {
    selectedEpisodeNumberRef.current = selectedEpisode;
    maxEpisodeRef.current = Math.max(airedCount || 0, allEpisodes.length || 0, selectedEpisode || 1);
  }, [airedCount, allEpisodes.length, selectedEpisode]);

  useEffect(() => {
    activeSourceIdValueRef.current = activeSourceId;
  }, [activeSourceId]);

  useEffect(() => {
    playbackValueRef.current = playback;
  }, [playback]);

  useEffect(() => {
    sourcesBusyRef.current = sourcesBusy;
  }, [sourcesBusy]);

  useEffect(() => {
    if (sourcesBusy) return;
    playableSourcesRef.current = playableSources;
    playableSourcesEpisodeRef.current = selectedEpisode;
  }, [playableSources, selectedEpisode, sourcesBusy]);

  useEffect(() => {
    pendingAutoPlayEpisodeRef.current = pendingAutoPlayEpisode;
  }, [pendingAutoPlayEpisode]);

  const { data: playbackProgress } = useQuery<DesktopPlaybackProgress>({
    queryKey: ['desktop-playback-progress', playback?.torrentId],
    queryFn: () => getLocalPlaybackProgress(playback!.torrentId),
    enabled: Boolean(playback?.torrentId),
    refetchInterval: (query) => {
      const progress = query.state.data;
      if (progress?.state === 'stopped') return false;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return 5_000;
      return progress?.state === 'playing' || progress?.state === 'ready' ? 2_500 : 1_200;
    },
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
    saveDesktopWatchProgress({
      animeId: playback.source.animeId || playback.source.animeTitle || playback.source.title,
      title: playback.source.animeTitle || playback.source.title,
      poster: playback.source.poster || playback.source.image || playback.source.banner,
      episode: playback.source.episode || selectedEpisode || 1,
      positionSeconds: Number(playbackProgress.current_seconds || 0),
      durationSeconds: playbackProgress.duration_seconds || undefined,
      progressPercent: playbackProgress.progress || undefined,
      updatedAt: Date.now(),
    });
  }, [
    playback,
    playbackProgress?.current_seconds,
    playbackProgress?.duration_seconds,
    playbackProgress?.ok,
    playbackProgress?.progress,
    playbackProgress?.state,
    selectedEpisode,
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

  const sourcePayloadFor = useCallback((source: NyaaItem, resumeOverride?: number): LocalPlaybackSource => {
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
      resumeSeconds: Number.isFinite(resumeOverride) ? Math.max(0, Number(resumeOverride)) : (historyEntry?.resumeSeconds ?? 0),
      durationSeconds: historyEntry?.durationSeconds ?? 0,
    };
  }, [anime, selectedEpisode]);

  const openOneSource = useCallback(async (source: NyaaItem, resumeOverride?: number) => {
    const playbackSource = sourcePayloadFor(source, resumeOverride);
    const result = await openLocalSourceNow(playbackSource);
    if (!result.ok) throw new Error(result.message || 'Source link could not open.');
    if (!result.torrent_id) throw new Error('The local engine did not return a stream id.');
    return { result, playbackSource };
  }, [sourcePayloadFor]);

  const playSource = useCallback(async (source: RankedNyaaItem, resumeOverride?: number) => {
    const initialSourceId = source.infoHash || source.magnet || source.title;
    if (playActionLockRef.current && activeSourceId === initialSourceId) {
      setPlaybackNotice({ tone: 'loading', text: 'This source is already opening.' });
      return;
    }
    if (!source.playable) {
      setPlaybackNotice({ tone: 'error', text: `${source.playableLabel} source. StreamNyaa will only play sources that pass the same-anime, same-installment, same-episode checks.` });
      return;
    }
    const requestId = playbackRequestIdRef.current + 1;
    playbackRequestIdRef.current = requestId;
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
    setPlaybackNotice({
      tone: 'loading',
      text: activeSourceId && activeSourceId !== initialSourceId
        ? 'Switching to selected source...'
        : `Opening best source${retryPool.length > 1 ? ' with backups ready' : ''}...`,
    });
    try {
      for (let index = 0; index < retryPool.length; index += 1) {
        if (playbackRequestIdRef.current !== requestId) return;
        const candidate = retryPool[index];
        const sourceId = candidate.infoHash || candidate.magnet;
        setActiveSourceId(sourceId);
        if (index > 0) {
          setPlaybackNotice({
            tone: 'loading',
            text: `Opening backup source ${index + 1} of ${retryPool.length}...`,
          });
        }

        try {
          const { result, playbackSource } = await openOneSource(candidate, resumeOverride);
          if (playbackRequestIdRef.current !== requestId) return;
          rememberSourceSuccess(candidate);
          setFailedSourceVersion((value) => value + 1);
          setPlayback({ torrentId: result.torrent_id!, title: result.title || candidate.title, source: playbackSource });
          syncPlayerPreferences('player-opened');
          setPlaybackNotice({
            tone: 'success',
            text: index === 0
              ? 'Player opened. StreamNyaa keeps the same window active while playback starts.'
              : `Backup source ${index + 1} opened.`,
          });
          return;
        } catch (error) {
          if (playbackRequestIdRef.current !== requestId) return;
          const message = errorMessage(error, 'Source link could not open.');
          if (/playback source switch was superseded|playback request was superseded/i.test(message)) {
            return;
          }
          if (/playback shutdown is busy|cleanup is busy/i.test(message)) {
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
      if (playbackRequestIdRef.current !== requestId) return;
      const fallbackHint = retryPool.length > 1
        ? ` StreamNyaa also tried ${Math.min(retryPool.length - 1, SOURCE_RETRY_LIMIT - 1)} backup source${retryPool.length > 2 ? 's' : ''}.`
        : '';
      setPlaybackNotice({ tone: 'error', text: `${errorMessage(error, 'Source link could not open.')}${fallbackHint}` });
    } finally {
      if (playbackRequestIdRef.current === requestId) {
        setActiveSourceId(null);
        playActionLockRef.current = false;
      }
    }
  }, [activeSourceId, anime?.id, anime?.mal_id, exactSources.length, likelySources.length, openOneSource, playableSources, selectedEpisode, sourceMode, syncPlayerPreferences]);

  useEffect(() => {
    playSourceRef.current = playSource;
  }, [playSource]);

  const playNextPlayableSource = useCallback(() => {
    if (!nextPlayableSource) return;
    void playSource(nextPlayableSource);
  }, [nextPlayableSource, playSource]);

  const runPlayerControl = useCallback(async (action: DesktopPlayerControlAction, value?: number) => {
    if (!playback) return;
    setPlayerControlBusy(action);
    try {
      await controlLocalPlayer(action, value);
    } catch (error) {
      setPlaybackNotice({ tone: 'error', text: errorMessage(error, 'Player control could not be applied.') });
    } finally {
      setPlayerControlBusy(null);
    }
  }, [playback]);

  const commitSeek = useCallback((value: number) => {
    const duration = Number(playbackProgress?.duration_seconds || 0);
    if (!Number.isFinite(value) || value < 0 || duration <= 0) return;
    setSeekDraft(null);
    void runPlayerControl('seek_absolute', Math.min(value, duration));
  }, [playbackProgress?.duration_seconds, runPlayerControl]);

  const commitVolume = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    const nextVolume = Math.max(0, Math.min(130, value));
    setVolumeDraft(null);
    void runPlayerControl('volume', nextVolume);
  }, [runPlayerControl]);

  const playEpisodeNumber = useCallback((episodeNumber: number) => {
    const currentEpisode = selectedEpisodeNumberRef.current;
    const targetEpisode = clampNumber(Math.round(episodeNumber), 1, Math.max(1, maxEpisodeRef.current || currentEpisode || 1));
    sourceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (animeNotYetAired) {
      setPendingAutoPlayEpisode(null);
      setPlaybackNotice({ tone: 'error', text: 'This anime has not aired yet. Sources will appear after release.' });
      return;
    }
    if (targetEpisode !== currentEpisode) {
      playableSourcesRef.current = [];
      playableSourcesEpisodeRef.current = 0;
      setPendingAutoPlayEpisode(targetEpisode);
      console.info(`[StreamNyaa Watch] Waiting for next episode sources episode=${targetEpisode}`);
      selectEpisode(targetEpisode);
      return;
    }
    if (activeSourceIdValueRef.current || playActionLockRef.current) {
      setPendingAutoPlayEpisode(targetEpisode);
      console.info(`[StreamNyaa Watch] Waiting for next episode sources episode=${targetEpisode}`);
      setPlaybackNotice({ tone: 'loading', text: `Finding a verified source for episode ${targetEpisode}...` });
      return;
    }
    if (sourcesBusyRef.current) {
      setPendingAutoPlayEpisode(targetEpisode);
      console.info(`[StreamNyaa Watch] Waiting for next episode sources episode=${targetEpisode}`);
      setPlaybackNotice({ tone: 'loading', text: `Finding a verified source for episode ${targetEpisode}...` });
      return;
    }
    const bestSource = playableSourcesEpisodeRef.current === targetEpisode
      ? playableSourcesRef.current[0]
      : undefined;
    if (bestSource) {
      void playSourceRef.current(bestSource);
      return;
    }
    setPendingAutoPlayEpisode(targetEpisode);
    console.info(`[StreamNyaa Watch] Waiting for next episode sources episode=${targetEpisode}`);
  }, [animeNotYetAired, selectEpisode]);

  const playNextEpisode = useCallback((reason: 'manual' | 'ended' | string = 'manual') => {
    const normalizedReason = reason === 'ended' ? 'ended' : 'manual';
    const currentEpisode = selectedEpisodeNumberRef.current;
    const maxEpisode = Math.max(maxEpisodeRef.current || 0, currentEpisode || 1);
    const nextEpisode = currentEpisode + 1;
    console.info(`[StreamNyaa Watch] Received next episode event reason=${normalizedReason} autoNext=${autoPlayNextEpisodeRef.current}`);
    if (nextEpisode > maxEpisode) {
      setPlaybackNotice({ tone: 'error', text: 'No next aired episode is available yet.' });
      return;
    }
    if (normalizedReason === 'ended' && !autoPlayNextEpisodeRef.current) {
      console.info('[StreamNyaa Watch] Ignored ended request because autoNext=false');
      setPlaybackNotice({ tone: 'success', text: 'Episode finished. Use the next-episode button or enable Auto-play next episode in Settings.' });
      return;
    }
    if (normalizedReason === 'ended') {
      const now = Date.now();
      const lastRequest = lastNextEpisodeRequestRef.current;
      if (lastRequest && lastRequest.episode === nextEpisode && lastRequest.reason === normalizedReason && now - lastRequest.at < 3500) {
        return;
      }
      lastNextEpisodeRequestRef.current = { episode: nextEpisode, reason: normalizedReason, at: now };
    } else {
      console.info('[StreamNyaa Watch] Manual next requested');
      lastNextEpisodeRequestRef.current = { episode: nextEpisode, reason: normalizedReason, at: Date.now() };
    }
    console.info(`[StreamNyaa Watch] Resolved next episode current=${currentEpisode} next=${nextEpisode}`);
    setPlaybackNotice({
      tone: 'loading',
      text: normalizedReason === 'ended'
        ? `Auto-opening episode ${nextEpisode}...`
        : `Opening episode ${nextEpisode}...`,
    });
    playbackRequestIdRef.current += 1;
    playActionLockRef.current = false;
    activeSourceIdValueRef.current = null;
    setActiveSourceId(null);
    setPlayback(null);
    playEpisodeNumber(nextEpisode);
  }, [playEpisodeNumber]);

  useEffect(() => {
    playNextEpisodeRef.current = playNextEpisode;
  }, [playNextEpisode]);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;
    void listenDesktopPlayerNextEpisode((event) => {
      if (!mounted) return;
      playNextEpisodeRef.current(event.reason || 'manual');
    }).then((cleanup) => {
      if (!mounted) {
        cleanup();
        return;
      }
      unlisten = cleanup;
    });
    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;
    void listenDesktopPlayerRecoveryRequest((event) => {
      if (!mounted || event.action !== 'backup') return;
      const episode = selectedEpisodeNumberRef.current;
      if (playableSourcesEpisodeRef.current !== episode) {
        setPlaybackNotice({ tone: 'error', text: 'Backup sources are still being verified for this episode.' });
        return;
      }

      const pool = playableSourcesRef.current;
      const currentSource = playbackValueRef.current?.source;
      const currentId = currentSource?.infoHash || currentSource?.magnet || currentSource?.title || '';
      const currentIndex = pool.findIndex((candidate) => (
        (candidate.infoHash || candidate.magnet || candidate.title) === currentId
      ));
      const candidates = currentIndex >= 0
        ? [...pool.slice(currentIndex + 1), ...pool.slice(0, currentIndex)]
        : pool;
      const backup = candidates.find((candidate) => candidate.playable !== false);
      if (!backup) {
        setPlaybackNotice({ tone: 'error', text: 'No other verified source is available for this episode.' });
        return;
      }

      const position = Number(event.position_seconds || 0);
      playbackRequestIdRef.current += 1;
      playActionLockRef.current = false;
      activeSourceIdValueRef.current = null;
      setActiveSourceId(null);
      console.info(`[StreamNyaa Watch] Player requested backup recovery episode=${episode} position=${position.toFixed(1)}`);
      setPlaybackNotice({ tone: 'loading', text: 'Current stream stalled. Opening the next verified source...' });
      void playSourceRef.current(backup, Number.isFinite(position) ? Math.max(0, position) : 0);
    }).then((cleanup) => {
      if (!mounted) {
        cleanup();
        return;
      }
      unlisten = cleanup;
    });
    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  const watchEpisodeFromCard = useCallback((episodeNumber: number) => {
    if (suppressEpisodeClickRef.current) return;
    playEpisodeNumber(episodeNumber);
  }, [playEpisodeNumber]);

  const startEpisodeRailDrag = useCallback((event: any) => {
    if (event.button !== 0) return;
    const rail = episodesRailRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth) return;
    episodeDragRef.current = {
      dragging: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: rail.scrollLeft,
    };
    setEpisodeRailDragging(true);
    try {
      rail.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail on synthetic events; dragging still works while inside the rail.
    }
  }, []);

  const moveEpisodeRailDrag = useCallback((event: any) => {
    const rail = episodesRailRef.current;
    const drag = episodeDragRef.current;
    if (!rail || !drag.dragging || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) <= EPISODE_RAIL_DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      suppressEpisodeClickRef.current = true;
    }
    event.preventDefault();
    rail.scrollLeft = drag.scrollLeft - deltaX;
  }, []);

  const stopEpisodeRailDrag = useCallback((event: any) => {
    const rail = episodesRailRef.current;
    const drag = episodeDragRef.current;
    if (!drag.dragging || drag.pointerId !== event.pointerId) return;
    const didDrag = drag.moved;
    if (drag.moved) {
      event.preventDefault();
      suppressEpisodeClickRef.current = true;
      window.setTimeout(() => {
        suppressEpisodeClickRef.current = false;
      }, 0);
    } else {
      suppressEpisodeClickRef.current = false;
    }
    episodeDragRef.current = {
      dragging: false,
      moved: false,
      pointerId: 0,
      startX: 0,
      startY: 0,
      scrollLeft: rail?.scrollLeft ?? drag.scrollLeft,
    };
    setEpisodeRailDragging(false);
    try {
      rail?.releasePointerCapture(event.pointerId);
    } catch {
      // Safe no-op when the pointer was already released.
    }
    if (!didDrag) {
      suppressEpisodeClickRef.current = false;
    }
  }, []);

  const chooseEpisodeFromRail = useCallback((episodeNumber: number) => {
    watchEpisodeFromCard(episodeNumber);
  }, [watchEpisodeFromCard]);

  useEffect(() => {
    const rail = episodesRailRef.current;
    if (!rail || episodeViewMode === 'grid') return;

    const handleWheel = (event: WheelEvent) => {
      railWheelScroll(event, rail);
    };

    rail.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      rail.removeEventListener('wheel', handleWheel);
    };
  }, [displayedEpisodes.length, episodeViewMode]);

  useEffect(() => {
    if (pendingAutoPlayEpisode === null) return;
    if (pendingAutoPlayEpisode !== selectedEpisode) return;
    if (activeSourceId || playActionLockRef.current) return;
    if (sourcesBusy) return;
    if (playableSourcesEpisodeRef.current !== selectedEpisode) return;
    if (playableSources[0]) {
      const bestSource = playableSources[0];
      setPendingAutoPlayEpisode(null);
      console.info(`[StreamNyaa Watch] Starting pending next episode source=${bestSource.title || bestSource.infoHash || bestSource.magnet}`);
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
    <div className="relative min-h-screen overflow-x-hidden bg-[#06070A] text-white">
      <Seo title={`${anime.title} Watch | StreamNyaa Desktop`} description="Desktop watch source screen." canonicalPath={`/watch/${id}`} robots="noindex, nofollow" />
      <SafeImage candidates={imageCandidatesFor(anime, true)} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.11] blur-2xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_14%,rgba(14,165,233,0.12),transparent_28%),radial-gradient(circle_at_64%_38%,rgba(244,63,94,0.14),transparent_36%),linear-gradient(90deg,#050507_0%,rgba(5,5,8,0.97)_29%,rgba(6,7,10,0.90)_100%)]" />

      <div className="sn-page relative grid min-h-screen grid-cols-[360px_1fr] gap-7 py-6">
        <aside className="sn-glass-panel rounded-[24px] p-5">
          <Link to="/" className="sn-icon-action mb-6 h-11 w-11 rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="relative">
            <div className="pointer-events-none absolute -inset-4 overflow-hidden rounded-[2rem] opacity-30 blur-2xl">
              <SafeImage candidates={imageCandidatesFor(anime)} alt="" className="h-full w-full object-cover" fallbackClassName="h-full w-full" />
            </div>
            <div className="sn-poster-card relative rounded-[22px] shadow-2xl shadow-black/50">
              <SafeImage candidates={imageCandidatesFor(anime)} alt={anime.title} className="aspect-[2/3] w-full object-cover" />
            </div>
          </div>
          <>
            {selectedInstallment?.label && selectedInstallment.label !== 'Season 1' ? (
              <p className="mt-7 text-[11px] font-black uppercase tracking-[0.22em] text-primary">{selectedInstallment.label}</p>
            ) : null}
            <h1 className={`${selectedInstallment?.label && selectedInstallment.label !== 'Season 1' ? 'mt-2' : 'mt-7'} break-words text-[31px] font-black leading-[1.05] tracking-[-0.04em] text-white drop-shadow-[0_10px_28px_rgba(0,0,0,0.45)]`}>{anime.title}</h1>
            {metadataLoading && !leftPanelInfo.primaryMeta.length && !leftPanelInfo.secondaryMeta.length && !leftPanelInfo.detailMeta.length ? (
              <div className="mt-3 h-4 w-36 animate-pulse rounded bg-white/8" />
            ) : null}
            <div className="mt-3 space-y-1.5 text-sm font-bold text-white/64">
              {leftPanelInfo.primaryMeta.length ? (
                <p>{leftPanelInfo.primaryMeta.join(' - ')}</p>
              ) : null}
              {leftPanelInfo.secondaryMeta.length ? (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {leftPanelInfo.secondaryMeta.map((item, index) => (
                    <Fragment key={item}>
                      {index > 0 ? <span className="text-white/24">-</span> : null}
                      <span className={item.startsWith('Rating') ? 'inline-flex items-center gap-1 text-yellow-400' : ''}>
                        {item.startsWith('Rating') ? <Star className="h-4 w-4 fill-current" /> : null}
                        {item}
                      </span>
                    </Fragment>
                  ))}
                </p>
              ) : null}
              {leftPanelInfo.detailMeta.length ? (
                <p className="line-clamp-2 text-xs font-semibold leading-5 text-white/44">{leftPanelInfo.detailMeta.join(' - ')}</p>
              ) : null}
            </div>
            {leftPanelInfo.genres.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {leftPanelInfo.genres.map((genre: any) => (
                  <span key={genre.name} className="rounded-full bg-white/[0.07] px-3 py-1.5 text-xs font-bold text-white/82 shadow-sm shadow-black/20">{genre.name}</span>
                ))}
                {leftPanelInfo.extraGenreCount > 0 ? (
                  <span className="rounded-full bg-white/[0.045] px-3 py-1.5 text-xs font-bold text-white/46">+{leftPanelInfo.extraGenreCount} more</span>
                ) : null}
              </div>
            ) : null}
            {leftPanelInfo.visibleSynopsis ? (
              <div className="mt-7">
                <p className="text-[15px] leading-7 text-white/68">
                  {leftPanelInfo.visibleSynopsis}
                </p>
                {leftPanelInfo.canExpandSynopsis ? (
                  <button
                    type="button"
                    onClick={() => setSynopsisExpanded((value) => !value)}
                    className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-primary transition-colors hover:text-primary/80"
                  >
                    {synopsisExpanded ? 'Show less' : 'Read more'}
                  </button>
                ) : null}
              </div>
            ) : null}
            {leftPanelInfo.trailerUrl ? (
              <div className="sn-glass-card mt-5 overflow-hidden rounded-[18px]">
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-3.5 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary/16 text-primary">
                      <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.20em] text-primary">Trailer</p>
                      <p className="mt-0.5 line-clamp-1 text-xs font-bold text-white/48">{anime.title}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {leftPanelInfo.trailerYear ? (
                      <span className="rounded-full border border-white/[0.10] bg-black/30 px-2 py-1 text-[10px] font-black text-white/56">
                        {leftPanelInfo.trailerYear}
                      </span>
                    ) : null}
                    {trailerOpen ? (
                      <button
                        type="button"
                        onClick={() => setTrailerOpen(false)}
                        className="rounded-full border border-white/[0.10] bg-white/[0.045] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/58 transition-colors hover:border-white/18 hover:text-white"
                      >
                        Close
                      </button>
                    ) : null}
                  </div>
                </div>
                {trailerOpen && trailerEmbedUrl ? (
                  <iframe
                    title={`${anime.title} trailer`}
                    src={trailerEmbedUrl}
                    className="aspect-video w-full bg-black"
                    loading="lazy"
                    allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (trailerEmbedUrl) {
                        setTrailerOpen(true);
                        return;
                      }
                      window.open(leftPanelInfo.trailerUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="group relative block h-28 w-full overflow-hidden text-left"
                  >
                    <SafeImage candidates={trailerPreviewImages} alt={`${anime.title} trailer`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" />
                    <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.76),rgba(0,0,0,0.22)_62%),radial-gradient(circle_at_50%_50%,rgba(244,63,94,0.22),transparent_36%)]" />
                    <span className="absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/16 bg-black/48 text-white shadow-lg shadow-black/30 transition-all group-hover:border-primary/45 group-hover:bg-primary group-hover:shadow-primary/24">
                      <Play className="ml-0.5 h-4 w-4 fill-current" />
                    </span>
                    <span className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block line-clamp-1 text-xs font-black text-white">{anime.title}</span>
                        <span className="mt-0.5 block text-[10px] font-black uppercase tracking-[0.16em] text-white/48">
                          {trailerEmbedUrl ? 'Play trailer' : 'Open trailer'}
                        </span>
                      </span>
                    </span>
                  </button>
                )}
              </div>
            ) : null}
          </>
        </aside>

        <main className="min-w-0 py-8">
          <section>
            <div className="sn-glass-panel mb-5 overflow-hidden rounded-[28px] p-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-primary">
                    <SlidersHorizontal className="h-4 w-4" />
                    Series Timeline
                  </p>
                  <p className="mt-2 text-xs font-semibold text-white/38">
                    Chronological related entries for this anime line.
                    <span className="ml-2 text-white/24">- {seasonItems.length} {installmentTitle.toLowerCase()}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                <div className="sn-glass-card hidden rounded-full p-1 md:inline-flex">
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
                      className={`rounded-full px-5 py-2 text-sm font-black transition-all active:scale-[0.98] ${audioMode === mode ? 'bg-primary text-white shadow-lg shadow-primary/24' : 'text-white/62 hover:bg-white/[0.06] hover:text-white'}`}
                    >
                      {mode === 'dub' ? 'Dual / Dub' : 'Sub'}
                    </button>
                  ))}
                </div>
                <div className="hidden items-center gap-2 md:flex">
                  <button
                    type="button"
                    onClick={() => railScroll(seasonRailRef, 'left', 520)}
                    className="sn-icon-action h-11 w-11 rounded-full"
                    aria-label="Scroll related entries left"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => railScroll(seasonRailRef, 'right', 520)}
                    className="sn-icon-action h-11 w-11 rounded-full"
                    aria-label="Scroll related entries right"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              </div>
              <div
                ref={seasonRailRef}
                onWheel={(event) => railWheelScroll(event, seasonRailRef.current)}
                className="grid max-h-[274px] grid-cols-[repeat(auto-fill,minmax(278px,1fr))] gap-3 overflow-y-auto pr-1 custom-scrollbar"
              >
                {seasonItems.map((season) => {
                  const sharedClassName = `group relative h-[118px] overflow-hidden rounded-2xl border text-left shadow-lg transition-all duration-200 hover:-translate-y-0.5 ${
                    season.current
                      ? 'border-primary/72 bg-primary/[0.13] shadow-primary/22 ring-1 ring-primary/35'
                      : 'border-white/[0.095] bg-white/[0.035] shadow-black/20 hover:border-primary/45 hover:bg-primary/[0.065] hover:ring-1 hover:ring-primary/20'
                  }`;
                  const content = (
                    <>
                      <SafeImage
                        candidates={installmentCardImageCandidates(season, anime)}
                        alt={season.name}
                        className="absolute inset-0 h-full w-full object-cover object-center opacity-60 transition-transform duration-500 group-hover:scale-[1.035]"
                        fallbackClassName="absolute inset-0 h-full w-full"
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,8,0.95),rgba(5,5,8,0.70)_49%,rgba(5,5,8,0.36)),radial-gradient(circle_at_86%_0%,rgba(244,63,94,0.22),transparent_46%)]" />
                      <div className="relative flex h-full gap-4 p-4">
                        <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl border text-sm font-black uppercase tracking-[-0.02em] ${
                          season.current
                            ? 'border-primary/45 bg-primary text-white shadow-lg shadow-primary/32'
                            : 'border-white/[0.13] bg-black/46 text-white/86 group-hover:border-primary/45 group-hover:text-white'
                        }`}>
                          {installmentSequenceBadge(season)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="line-clamp-1 text-lg font-black tracking-[-0.025em] text-white drop-shadow">{installmentPrimaryLabel(season)}</p>
                            {season.current ? (
                              <span className="rounded-full bg-primary/18 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-primary">Now</span>
                            ) : null}
                          </div>
                          <p className="mt-1 line-clamp-1 text-xs font-bold text-white/62">{season.name}</p>
                          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/50">
                            {installmentMetaParts(season).map((part, index) => (
                              <Fragment key={`${season.mal_id}-${part}`}>
                                {index > 0 ? <span className="text-white/20">-</span> : null}
                                <span className={index === 0 && season.current ? 'text-primary' : ''}>{part}</span>
                              </Fragment>
                            ))}
                          </div>
                        </div>
                      </div>
                      {season.current ? <span className="absolute inset-x-0 bottom-0 h-1 bg-primary" /> : null}
                    </>
                  );
                  return season.current ? (
                    <button
                      key={`current-${season.mal_id}`}
                      ref={selectedSeasonRef}
                      type="button"
                      className={sharedClassName}
                    >
                      {content}
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
                      {content}
                    </Link>
                  );
                })}
                {showTimelineSkeletons ? (
                  Array.from({ length: TIMELINE_SKELETON_CARD_COUNT }, (_, index) => (
                    <TimelineSkeletonCard key={`timeline-skeleton-${index}`} />
                  ))
                ) : null}
              </div>
            </div>

            <div className="sn-glass-card sticky top-3 z-10 -mx-2 mb-4 flex items-center justify-between gap-4 rounded-2xl px-3 py-3">
              <div className="flex items-center gap-2 text-lg font-black">
                <Download className="h-4 w-4 text-primary" />
                <span>{selectedInstallment?.kind === 'movie' ? 'Movie' : selectedInstallment?.kind === 'ova' ? 'OVA Episodes' : selectedInstallment?.kind === 'ona' ? 'ONA Episodes' : 'Episodes'} ({airedCount || allEpisodes.length || 0})</span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <div className="hidden items-center gap-2 rounded-xl border border-white/[0.12] bg-black/38 px-3 py-2 shadow-inner shadow-black/20 md:flex">
                  <Search className="h-4 w-4 text-white/46" />
                  <input
                    value={episodeSearch}
                    onChange={(event) => setEpisodeSearch(event.target.value.slice(0, 48))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        submitEpisodeSearch();
                      }
                    }}
                    className="w-48 bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/36"
                    placeholder="Search episode number or title"
                  />
                </div>
                {longEpisodeRun ? (
                  <div className="hidden rounded-xl border border-white/[0.10] bg-black/34 p-1 md:flex">
                    {(['cards', 'grid'] as EpisodeViewMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setEpisodeViewMode(mode)}
                        className={`rounded-lg px-3 py-2 text-xs font-black uppercase tracking-[0.16em] ${
                          episodeViewMode === mode
                            ? 'bg-primary text-white shadow-md shadow-primary/18'
                            : 'text-white/58 hover:bg-white/[0.06] hover:text-white'
                        }`}
                      >
                        {mode === 'grid' ? 'Compact' : 'Cards'}
                      </button>
                    ))}
                  </div>
                ) : null}
                {longEpisodeRun && episodeViewMode === 'grid' && !episodeSearchTerm && episodeRanges.length > 1 ? (
                  <div className="hidden items-center gap-2 rounded-xl border border-white/[0.12] bg-black/38 p-1 md:flex">
                    <button
                      type="button"
                      disabled={currentEpisodeRangeIndex <= 0}
                      onClick={() => goEpisodeRange(-1)}
                      className="sn-icon-action h-10 w-10 rounded-lg disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Previous episode range"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <select
                      value={String(episodeGridStart)}
                      onChange={(event) => setEpisodeGridStart(Number(event.target.value) || 1)}
                      className="rounded-xl border border-white/[0.12] bg-black/48 px-4 py-3 text-sm font-black text-white outline-none"
                    >
                      {episodeRanges.map((range) => (
                        <option key={range.start} value={range.start}>{range.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={currentEpisodeRangeIndex >= episodeRanges.length - 1}
                      onClick={() => goEpisodeRange(1)}
                      className="sn-icon-action h-10 w-10 rounded-lg disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Next episode range"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
                {longEpisodeRun ? (
                  <div className="hidden items-center gap-2 rounded-xl border border-white/[0.12] bg-black/38 px-3 py-2 md:flex">
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
                      className="w-20 rounded-lg border border-white/[0.10] bg-white/[0.055] px-3 py-2 text-sm font-black text-white outline-none"
                      placeholder="Episode"
                    />
                    <button
                      type="button"
                      onClick={submitEpisodeJump}
                      className="sn-primary-action min-h-0 rounded-lg px-3 py-2 text-xs"
                    >
                      Go
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={animeNotYetAired || Boolean(activeSourceId) || sourcesBusy}
                  onClick={() => playEpisodeNumber(selectedEpisode)}
                  className="hidden rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-primary/24 transition-all hover:bg-[#ff3345] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 md:inline-flex"
                  aria-label={`Play best source for episode ${selectedEpisode}`}
                >
                  {animeNotYetAired ? 'Not aired yet' : Boolean(activeSourceId) || pendingAutoPlayEpisode === selectedEpisode ? 'Opening...' : 'Play Best Source'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !autoOpenBestSource;
                    setAutoOpenBestSource(next);
                    saveDesktopAutoOpenBestSource(next);
                  }}
                  className={`hidden rounded-xl border px-4 py-3 text-xs font-black uppercase tracking-[0.16em] transition-all active:scale-[0.98] md:inline-flex ${
                    autoOpenBestSource
                      ? 'border-primary/45 bg-primary text-white shadow-md shadow-primary/18'
                      : 'border-white/[0.12] bg-black/38 text-white/56 hover:border-white/20 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  Auto-play {autoOpenBestSource ? 'On' : 'Off'}
                </button>
                <div className={`hidden items-center gap-2 md:flex ${longEpisodeRun && episodeViewMode === 'grid' ? 'opacity-40 pointer-events-none' : ''}`}>
                  <button
                    type="button"
                    onClick={() => railScroll(episodesRailRef, 'left', 520)}
                    className="sn-icon-action h-11 w-11 rounded-full"
                    aria-label="Scroll episodes left"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => railScroll(episodesRailRef, 'right', 520)}
                    className="sn-icon-action h-11 w-11 rounded-full"
                    aria-label="Scroll episodes right"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            {episodeSearchTerm && !displayedEpisodes.length ? (
              <div className="rounded-xl border border-white/[0.10] bg-white/[0.04] p-6 text-sm font-bold text-white/58">
                No episodes matched that search. Try a title keyword or an episode number.
              </div>
            ) : episodeViewMode === 'grid' && longEpisodeRun ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(94px,1fr))] gap-3">
                {displayedEpisodes.map((episode) => (
                  <div
                    key={episode.number}
                    ref={episode.number === selectedEpisode ? selectedEpisodeRef : null}
                    className={`group rounded-xl border px-3 py-3 text-left transition-all focus-within:ring-1 focus-within:ring-primary/40 ${
                      episode.number === selectedEpisode
                        ? 'border-primary/55 bg-primary/[0.11] shadow-lg shadow-primary/14 ring-1 ring-primary/30'
                        : 'border-white/[0.10] bg-white/[0.035] hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/[0.045]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        watchEpisodeFromCard(episode.number);
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        watchEpisodeFromCard(episode.number);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        watchEpisodeFromCard(episode.number);
                      }}
                      className="min-h-[72px] w-full cursor-pointer rounded-lg text-left outline-none transition-transform focus-visible:ring-1 focus-visible:ring-primary/45 active:scale-[0.99]"
                      aria-label={`Watch episode ${episode.number}`}
                    >
                      <p className={`text-base font-black ${episode.number === selectedEpisode ? 'text-white' : 'text-white/86'}`}>Ep {episode.number}</p>
                      <p className="mt-1 line-clamp-2 text-[11px] font-bold leading-5 text-white/48">{episode.title}</p>
                    </button>
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        playEpisodeNumber(episode.number);
                      }}
                      className="mt-3 inline-flex h-8 items-center gap-2 rounded-lg bg-white/[0.08] px-3 text-[11px] font-black uppercase tracking-[0.16em] text-white transition-all hover:bg-primary hover:text-white active:scale-[0.98] group-focus-within:bg-primary/90"
                      aria-label={`Play episode ${episode.number}`}
                    >
                      <Play className="h-3 w-3 fill-current" />
                      Play
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                ref={episodesRailRef}
                onPointerDown={startEpisodeRailDrag}
                onPointerMove={moveEpisodeRailDrag}
                onPointerUp={stopEpisodeRailDrag}
                onPointerCancel={stopEpisodeRailDrag}
                onPointerLeave={stopEpisodeRailDrag}
                className={`flex gap-3 overflow-x-auto overscroll-x-contain pb-3 hide-scrollbar ${episodeRailDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
              >
                {displayedEpisodes.map((episode) => (
                  <div
                    key={episode.number}
                    ref={episode.number === selectedEpisode ? selectedEpisodeRef : null}
                    className={`group relative h-[156px] w-[230px] shrink-0 overflow-hidden rounded-xl border text-left shadow-lg shadow-black/18 transition-all focus-within:ring-1 focus-within:ring-primary/42 ${
                      episode.number === selectedEpisode
                        ? 'border-primary/70 bg-primary/[0.10] ring-1 ring-primary/32'
                        : 'border-white/[0.10] hover:-translate-y-0.5 hover:border-primary/42'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        chooseEpisodeFromRail(episode.number);
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        chooseEpisodeFromRail(episode.number);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        chooseEpisodeFromRail(episode.number);
                      }}
                      className="absolute inset-0 cursor-pointer text-left outline-none focus-visible:ring-1 focus-visible:ring-primary/45"
                      aria-label={`Watch episode ${episode.number}`}
                    >
                      <SafeImage candidates={uniqueImageCandidates([episode.image, wideImageFor(anime), posterFor(anime)])} alt={episode.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                      <div className={`absolute inset-0 ${episode.number === selectedEpisode ? 'bg-[linear-gradient(0deg,rgba(48,8,16,0.90),rgba(0,0,0,0.06)_62%)]' : 'bg-[linear-gradient(0deg,rgba(0,0,0,0.80),rgba(0,0,0,0.08)_62%)]'}`} />
                      <span className={`absolute left-2 top-2 rounded-md px-2 py-1 text-xs font-black shadow-md shadow-black/25 ${episode.number === selectedEpisode ? 'bg-primary text-white' : 'bg-black/72 text-white'}`}>{episode.number}</span>
                      <p className="absolute bottom-3 left-3 right-14 line-clamp-1 text-sm font-black">{episode.title}</p>
                    </button>
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        playEpisodeNumber(episode.number);
                      }}
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      className="absolute bottom-2.5 right-2.5 grid h-9 w-9 place-items-center rounded-full border border-white/[0.14] bg-black/62 text-white shadow-lg shadow-black/30 backdrop-blur transition-all hover:border-primary/55 hover:bg-primary hover:shadow-primary/24 active:scale-[0.94]"
                      aria-label={`Play episode ${episode.number}`}
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs font-semibold text-white/26">
              {episodeSearchTerm
                ? `Found ${displayedEpisodes.length} matching episode${displayedEpisodes.length === 1 ? '' : 's'}. Press Enter to open the first match quickly.`
                : episodeViewMode === 'grid' && longEpisodeRun
                  ? `Compact view shows episodes ${currentEpisodeRange?.start || displayedEpisodes[0]?.number || 1}-${currentEpisodeRange?.end || displayedEpisodes[displayedEpisodes.length - 1]?.number || displayedEpisodes.length} of ${airedCount}. Click an episode to select it. Use Play or double-click to start the best source.`
                  : airedCount > displayedEpisodes.length
                    ? `Showing episodes ${displayedEpisodes[0]?.number || 1}-${displayedEpisodes[displayedEpisodes.length - 1]?.number || displayedEpisodes.length} of ${airedCount}. Click an episode to select it. Use Play or double-click to start the best source.`
                    : 'Click an episode to select it. Use Play or double-click to start the best source.'}
            </p>
          </section>

          <section ref={sourceSectionRef} className="mt-8 pb-24">
            <div className="sn-glass-panel mb-5 rounded-[28px] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Source List</p>
                  <h2 className="mt-1 text-2xl font-black tracking-[-0.03em] text-white">{sourceSectionTitle}</h2>
                  <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/52">{sourceSectionSubtitle}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  {animeNotYetAired ? (
                    <Link
                      to="/calendar"
                      className="sn-secondary-action h-12 rounded-2xl bg-white px-5 text-sm text-black shadow-lg shadow-white/10 hover:bg-white/90"
                    >
                      View airing schedule
                    </Link>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={!playableSources[0] || Boolean(activeSourceId) || sourcesBusy}
                        onClick={() => playableSources[0] && void playSource(playableSources[0])}
                        className="sn-primary-action h-12 rounded-2xl px-5 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                        aria-label={`Play best source for episode ${selectedEpisode}`}
                      >
                        <Play className="mr-2 h-4 w-4 fill-current" />
                        {Boolean(activeSourceId) || pendingAutoPlayEpisode === selectedEpisode ? 'Opening...' : sourcesBusy ? 'Finding...' : 'Play Best Source'}
                      </button>
                      <button
                        type="button"
                        onClick={() => sourceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        className="sn-secondary-action h-12 rounded-2xl px-5 text-sm"
                        aria-label={`View source list for episode ${selectedEpisode}`}
                      >
                        <SlidersHorizontal className="mr-2 h-4 w-4" />
                        Source List
                      </button>
                    </>
                  )}
                </div>
              </div>

              {animeNotYetAired ? (
                <div className="mt-5 rounded-2xl bg-black/28 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] ring-1 ring-white/[0.06]">
                  <p className="text-sm font-black text-white">Episodes are not available yet.</p>
                  <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/48">
                    This listing can be bookmarked and reviewed, but StreamNyaa will not search torrent sources until the anime has aired.
                  </p>
                </div>
              ) : (
                <>
              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr_auto]">
                <div className="rounded-2xl border border-white/[0.08] bg-black/28 p-2">
                  <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/36">Match</p>
                  <div className="flex rounded-xl bg-black/34 p-1">
                    {(['strict', 'balanced', 'broad'] as SourceFilterMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSourceMode(mode)}
                        aria-pressed={sourceMode === mode}
                        className={`flex-1 rounded-lg px-3 py-2 text-xs font-black capitalize transition-all active:scale-[0.98] ${
                          sourceMode === mode
                            ? 'bg-primary text-white shadow-md shadow-primary/24'
                            : 'text-white/58 hover:bg-white/[0.07] hover:text-white'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-black/28 p-2">
                  <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/36">Audio</p>
                  <div className="flex rounded-xl bg-black/34 p-1">
                    {([
                      { label: 'Sub', preference: 'sub-preferred' },
                      { label: 'Dub', preference: 'dub-only' },
                      { label: 'Any', preference: 'dual-preferred' },
                    ] as const).map((option) => (
                      <button
                        key={option.preference}
                        type="button"
                        onClick={() => setSourceAudioPreference(option.preference)}
                        aria-pressed={audioPreference === option.preference}
                        className={`flex-1 rounded-lg px-3 py-2 text-xs font-black transition-all active:scale-[0.98] ${
                          audioPreference === option.preference
                            ? 'bg-primary text-white shadow-md shadow-primary/24'
                            : 'text-white/58 hover:bg-white/[0.07] hover:text-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-black/28 p-2">
                  <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/36">Quality</p>
                  <div className="flex flex-wrap gap-1 rounded-xl bg-black/34 p-1">
                    {sourceQualityOptions.map((quality) => {
                      const active = sourceQuality === quality;
                      const count = quality === 'auto' ? modeSortedSources.length : qualityCounts.get(quality) || 0;
                      return (
                        <button
                          key={quality}
                          type="button"
                          onClick={() => setSourceQuality(quality)}
                          aria-pressed={active}
                          className={`rounded-lg px-3 py-2 text-xs font-black transition-all active:scale-[0.98] ${
                            active
                              ? 'bg-primary text-white shadow-md shadow-primary/24'
                              : 'text-white/58 hover:bg-white/[0.07] hover:text-white'
                          }`}
                        >
                          {sourceQualityLabel(quality)}
                          {count > 0 ? <span className={active ? 'ml-1 text-white/70' : 'ml-1 text-white/34'}>{count}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="rounded-2xl border border-white/[0.08] bg-black/28 p-2">
                  <span className="mb-2 block px-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/36">Order</span>
                  <span className="flex h-[42px] items-center rounded-xl bg-black/34 px-3">
                    <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SourceSort)} className="w-full bg-transparent text-sm font-black text-white outline-none">
                      <option value="best">Best Match</option>
                      <option value="seeders">Seeders</option>
                      <option value="size">Smaller Files</option>
                    </select>
                    <ChevronDown className="pointer-events-none ml-2 h-4 w-4 text-white/42" />
                  </span>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4 text-sm">
                <p className="font-bold text-white/56">{sourceMatchSummary}</p>
                <p className="text-xs font-semibold text-white/36">Best source uses the same ranking and fallback logic as before.</p>
              </div>
                </>
              )}
            </div>

            {playbackNotice ? (
              <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-bold shadow-lg shadow-black/14 ${
                playbackNotice.tone === 'error'
                  ? 'border-red-400/25 bg-red-500/10 text-red-100'
                  : playbackNotice.tone === 'success'
                    ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
                    : 'border-amber-300/18 bg-amber-300/[0.08] text-amber-50/86'
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

            {playback ? (() => {
              const durationSeconds = Number(playbackProgress?.duration_seconds || 0);
              const currentSeconds = Math.max(0, Number(seekDraft ?? playbackProgress?.current_seconds ?? 0));
              const volumeValue = Math.max(0, Math.min(130, Number(volumeDraft ?? playbackProgress?.volume ?? 100)));
              const watchedPercent = durationSeconds > 0
                ? Math.max(0, Math.min(100, (currentSeconds / durationSeconds) * 100))
                : Math.max(0, Math.min(100, playbackStage.progress));
              const isPaused = playbackProgress?.paused ?? false;
              const playerBusy = Boolean(playerControlBusy);
              const artworkCandidates = uniqueImageCandidates([
                playback.source.banner,
                playback.source.poster,
                playback.source.image,
                wideImageFor(anime),
                posterFor(anime),
              ]);
              return (
                <div className="mb-5 overflow-hidden rounded-[28px] border border-white/10 bg-[#07070A] shadow-2xl shadow-black/35 ring-1 ring-white/[0.025]">
                  <div className="relative min-h-[320px]">
                    <SafeImage
                      candidates={artworkCandidates}
                      alt={playback.title}
                      className="absolute inset-0 h-full w-full object-cover opacity-40"
                      fallbackClassName="absolute inset-0 h-full w-full"
                    />
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,3,6,0.96),rgba(3,3,6,0.62)_48%,rgba(3,3,6,0.24)),linear-gradient(0deg,rgba(3,3,6,0.96),rgba(3,3,6,0.18)_54%,rgba(3,3,6,0.50)),radial-gradient(circle_at_18%_18%,rgba(244,63,94,0.22),transparent_32%)]" />
                    <div className="relative flex min-h-[320px] flex-col justify-between p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-primary">Now Playing</p>
                          <h3 className="mt-2 line-clamp-2 max-w-3xl text-3xl font-black leading-tight tracking-[-0.035em] text-white">{playback.title}</h3>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/58">
                            <span className="rounded-full border border-white/12 bg-white/[0.075] px-3 py-1">{playbackStage.headline}</span>
                            <span className="rounded-full border border-white/12 bg-white/[0.075] px-3 py-1">Peers {playbackProgress?.peers ?? '...'}</span>
                            <span className="rounded-full border border-white/12 bg-white/[0.075] px-3 py-1">{playbackProgress?.state || playbackStage.status}</span>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/36 px-4 py-3 text-right backdrop-blur-xl">
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Session</p>
                          <p className="mt-1 text-lg font-black text-white">{Math.round(watchedPercent)}%</p>
                        </div>
                      </div>

                      <div>
                        <div className="mb-4">
                          <div className="mb-2 flex items-center justify-between text-xs font-bold text-white/58">
                            <span>{durationSeconds > 0 ? formatPlaybackTime(currentSeconds) : '--:--'}</span>
                            <span>{durationSeconds > 0 ? formatPlaybackTime(durationSeconds) : playbackStage.status}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(1, Math.round(durationSeconds || 1))}
                            value={Math.round(durationSeconds > 0 ? currentSeconds : 0)}
                            disabled={durationSeconds <= 0 || playerBusy}
                            onChange={(event) => setSeekDraft(Number(event.currentTarget.value))}
                            onPointerUp={(event) => commitSeek(Number(event.currentTarget.value))}
                            onBlur={(event) => seekDraft != null && commitSeek(Number(event.currentTarget.value))}
                            aria-label="Playback timeline"
                            style={{ '--range-fill': `${watchedPercent}%` } as React.CSSProperties}
                            className="desktop-player-range h-1.5 w-full cursor-pointer disabled:cursor-not-allowed"
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-black/46 p-3 shadow-xl shadow-black/30 backdrop-blur-xl">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={playerBusy}
                              onClick={() => void runPlayerControl('seek_relative', -10)}
                              className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white/78 transition-colors hover:border-white/20 hover:bg-white/[0.10] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label="Rewind 10 seconds"
                            >
                              <RotateCcw className="h-5 w-5" />
                            </button>
                            <button
                              type="button"
                              disabled={playerBusy}
                              onClick={() => void runPlayerControl(isPaused ? 'play' : 'toggle_pause')}
                              className="grid h-16 w-16 place-items-center rounded-full bg-white text-black shadow-xl shadow-white/10 transition-transform hover:scale-[1.04] disabled:cursor-not-allowed disabled:opacity-60"
                              aria-label={isPaused ? 'Play' : 'Pause'}
                            >
                              {playerControlBusy === 'toggle_pause' || playerControlBusy === 'play' ? (
                                <Loader2 className="h-7 w-7 animate-spin" />
                              ) : isPaused ? (
                                <Play className="ml-1 h-7 w-7 fill-current" />
                              ) : (
                                <Pause className="h-7 w-7 fill-current" />
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={playerBusy}
                              onClick={() => void runPlayerControl('seek_relative', 10)}
                              className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white/78 transition-colors hover:border-white/20 hover:bg-white/[0.10] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label="Forward 10 seconds"
                            >
                              <RotateCw className="h-5 w-5" />
                            </button>
                          </div>

                          <div className="flex min-w-[230px] items-center gap-3 rounded-full border border-white/10 bg-white/[0.055] px-4 py-3">
                            <Volume2 className="h-4 w-4 text-white/70" />
                            <input
                              type="range"
                              min={0}
                              max={130}
                              value={Math.round(volumeValue)}
                              disabled={playerBusy}
                              onChange={(event) => setVolumeDraft(Number(event.currentTarget.value))}
                              onPointerUp={(event) => commitVolume(Number(event.currentTarget.value))}
                              onBlur={(event) => volumeDraft != null && commitVolume(Number(event.currentTarget.value))}
                              aria-label="Volume"
                              style={{ '--range-fill': `${Math.max(0, Math.min(100, (volumeValue / 130) * 100))}%` } as React.CSSProperties}
                              className="desktop-player-range h-1.5 w-28 cursor-pointer disabled:cursor-not-allowed"
                            />
                            <span className="min-w-9 text-right text-xs font-black text-white/58">{Math.round(volumeValue)}%</span>
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={playerBusy}
                              onClick={() => void runPlayerControl('subtitle')}
                              className="h-11 rounded-full border border-white/10 bg-white/[0.055] px-4 text-xs font-black uppercase tracking-[0.14em] text-white/72 transition-colors hover:border-white/20 hover:bg-white/[0.10] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Subs
                            </button>
                            <button
                              type="button"
                              disabled={playerBusy}
                              onClick={() => void runPlayerControl('audio')}
                              className="h-11 rounded-full border border-white/10 bg-white/[0.055] px-4 text-xs font-black uppercase tracking-[0.14em] text-white/72 transition-colors hover:border-white/20 hover:bg-white/[0.10] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Audio
                            </button>
                            <select
                              defaultValue="1"
                              disabled={playerBusy}
                              onChange={(event) => void runPlayerControl('speed', Number(event.currentTarget.value))}
                              className="h-11 rounded-full border border-white/10 bg-white/[0.055] px-4 text-xs font-black uppercase tracking-[0.14em] text-white outline-none transition-colors hover:border-white/20 hover:bg-white/[0.10] disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label="Playback speed"
                            >
                              <option value="0.75">0.75x</option>
                              <option value="1">1x</option>
                              <option value="1.25">1.25x</option>
                              <option value="1.5">1.5x</option>
                            </select>
                            <button
                              type="button"
                              disabled={playerBusy}
                              onClick={() => void runPlayerControl('fullscreen')}
                              className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/[0.055] text-white/72 transition-colors hover:border-white/20 hover:bg-white/[0.10] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label="Fullscreen"
                            >
                              <Maximize2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void stopPlayback()}
                              className="h-11 rounded-full border border-white/12 bg-black/35 px-4 text-xs font-black uppercase tracking-[0.14em] text-white/78 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                            >
                              Stop
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {playbackSteps.map((label, index) => {
                            const activeStep = index + 1 <= playbackStage.step;
                            return (
                              <span
                                key={label}
                                className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                                  activeStep
                                    ? 'border-primary/30 bg-primary/14 text-primary'
                                    : 'border-white/10 bg-white/[0.04] text-white/34'
                                }`}
                              >
                                {label}
                              </span>
                            );
                          })}
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/42">
                            {playbackProgress?.downloaded_bytes ? `${Math.round(playbackProgress.downloaded_bytes / 1024 / 1024)} MB cached` : 'Cache pending'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })() : null}

            {animeNotYetAired ? null : sourcesBusy ? (
              <div className="grid gap-3">
                <div className="rounded-2xl border border-white/[0.08] bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025)_48%,rgba(244,63,94,0.065))] p-4 shadow-lg shadow-black/20">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Finding best source</p>
                      <p className="mt-1 text-sm font-black text-white">Searching sources for Episode {selectedEpisode}...</p>
                      <p className="mt-1 text-xs font-bold text-white/50">Checking episode match, seed health, audio preference, and release quality.</p>
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
                  const confidence = sourceConfidenceMeta(source, failedSourceRecords, audioPreference, audioMode);
                  const score = confidence.score;
                  const visibleReasons = [
                    ...sourceConfidenceBadges(source, failedSourceRecords, audioPreference, audioMode),
                    ...reasons,
                  ].filter((reason, reasonIndex, list) => list.indexOf(reason) === reasonIndex).slice(0, 4);
                  const expanded = expandedSourceIds.has(sourceId);
                  const quality = sourceQualityLabel(sourceQualityBucket(source.title));
                  const codec = /\b(hevc|h\.?265|x265)\b/i.test(source.title) ? 'HEVC' : /\b(avc|h\.?264|x264)\b/i.test(source.title) ? 'H.264' : 'Video';
                  const audioLabel = isDualAudioSource(source.title) ? 'Dual Audio' : isDubOnlySource(source.title) ? 'Dub' : 'Sub';
                  const failure = sourceFailureFor(source, failedSourceRecords);
                  const previousTier = sortedSources[index - 1]?.matchTier;
                  return (
                    <Fragment key={sourceId}>
                    {index === 0 || source.matchTier !== previousTier ? (
                      <div className={`${index === 0 ? '' : 'mt-2'} flex items-center justify-between border-t border-white/[0.08] pt-4`}>
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/58">{sourceTierLabel(source.matchTier)}</p>
                          <p className="mt-1 text-xs font-bold text-white/38">{sourceTierDescription(source.matchTier)}</p>
                        </div>
                        <p className="text-xs font-bold text-white/42">
                          {source.matchTier === 'exact' ? visibleTierCounts.exact : source.matchTier === 'likely' ? visibleTierCounts.likely : visibleTierCounts.broad} source
                          {(source.matchTier === 'exact' ? visibleTierCounts.exact : source.matchTier === 'likely' ? visibleTierCounts.likely : visibleTierCounts.broad) === 1 ? '' : 's'}
                        </p>
                      </div>
                    ) : null}
                    <div
                      className={`relative overflow-hidden rounded-2xl border bg-[#101116]/82 p-4 shadow-lg shadow-black/20 transition-all hover:-translate-y-0.5 hover:border-primary/24 hover:bg-[#171923]/82 ${
                        index === 0 && source.matchTier === 'exact' ? 'border-primary/42 bg-[linear-gradient(135deg,rgba(244,63,94,0.10),rgba(255,255,255,0.040)_52%,rgba(255,255,255,0.030))] shadow-primary/8' : 'border-white/[0.085]'
                      }`}
                    >
                      {index === 0 && source.matchTier === 'exact' ? <div className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-primary shadow-lg shadow-primary/40" /> : null}
                      <div className="flex items-center gap-4">
                        <span className="grid h-[58px] min-w-[70px] shrink-0 place-items-center rounded-xl border border-white/[0.10] bg-white/[0.065] px-3 text-xs font-black text-white shadow-inner shadow-black/20">{quality}</span>
                        <div className="min-w-0 flex-1">
                          {index === 0 && source.matchTier === 'exact' ? <p className="mb-1 text-[10px] font-black uppercase tracking-[0.22em] text-primary">Recommended source</p> : null}
                          <p className="line-clamp-1 text-sm font-black text-white">{source.title}</p>
                          <p className="mt-1 text-xs font-semibold text-white/52">
                            {quality} <span className="text-white/24">-</span> {codec} <span className="text-white/24">-</span> {audioLabel} <span className="text-white/24">-</span> {source.size}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-white/45">
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${source.playable ? sourceConfidenceClassName(confidence.band) : playableStatusClassName(source.playableStatus)}`}>
                              {source.playable ? confidence.label : source.playableLabel}
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
                            className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 text-xs font-black text-white/62 transition-all hover:border-white/18 hover:bg-white/[0.08] hover:text-white active:scale-[0.98]"
                          >
                            Details
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                          </button>
                          <button type="button" onClick={() => navigator.clipboard?.writeText(source.magnet || torrentUrlFor(source))} className="grid h-10 w-10 place-items-center rounded-lg border border-white/[0.10] bg-white/[0.05] text-white/62 transition-all hover:border-white/18 hover:bg-white/[0.08] hover:text-white active:scale-[0.98]" aria-label="Copy source link">
                            <Copy className="h-4 w-4" />
                          </button>
                          <button type="button" disabled={Boolean(active) || !source.playable} onClick={() => void playSource(source)} className="inline-flex h-10 min-w-[86px] items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-primary/24 transition-all hover:bg-[#ff3345] hover:shadow-primary/34 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60">
                            {active ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                            {active ? 'Opening' : source.playable ? 'Play' : 'Blocked'}
                          </button>
                        </div>
                      </div>
                      {expanded ? (
                        <div className="mt-4 rounded-xl border border-white/8 bg-black/24 p-3">
                          <div className="flex flex-wrap gap-2">
                            {[...reasons, `Confidence ${score}`, `Rank ${Math.round(sourceScore(source, audioPreference, audioMode))}`, source.category, source.pubDate ? `Updated ${new Date(source.pubDate).toLocaleDateString()}` : '', source.infoHash ? `Hash ${source.infoHash.slice(0, 10)}` : '']
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
                <p className="text-lg font-black text-white">{sourceQuality === 'auto' ? 'No playable source found' : `No ${sourceQualityLabel(sourceQuality)} source found`}</p>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/50">
                  {sourceQuality === 'auto'
                    ? 'No confident title-compatible sources were found for this anime and episode. Try switching audio mode, using Broad, or opening manual source search.'
                    : 'This episode has title-compatible sources in other qualities. Switch back to Auto or pick another quality to keep browsing.'}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  {sourceQuality !== 'auto' ? (
                    <button
                      type="button"
                      onClick={() => setSourceQuality('auto')}
                      className="inline-flex h-11 items-center rounded-xl bg-white px-5 text-sm font-black text-black shadow-lg shadow-white/8 transition-colors hover:bg-white/90"
                    >
                      Show Auto
                    </button>
                  ) : null}
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
  if (tier === 'exact') return 'High-confidence same anime, installment, and episode matches.';
  if (tier === 'likely') return 'Recommended candidates with one weaker filename or source signal.';
  if (tier === 'broad') return 'More possible sources with lower confidence, kept separate for manual inspection.';
  return '';
}

function sourceConfidenceClassName(band: SourceConfidenceBand) {
  if (band === 'high') return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300';
  if (band === 'medium') return 'border-sky-400/20 bg-sky-500/10 text-sky-300';
  if (band === 'low') return 'border-amber-400/20 bg-amber-500/10 text-amber-300';
  return 'border-red-400/20 bg-red-500/10 text-red-200';
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
