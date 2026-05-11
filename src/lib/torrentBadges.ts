import type { NyaaItem } from '../api/nyaa';

export type TorrentBadgeTone = 'trusted' | 'seeders' | 'codec' | 'audio' | 'batch' | 'episode';

export interface TorrentBadge {
  label: string;
  tone: TorrentBadgeTone;
}

const trustedGroups = ['SubsPlease', 'Erai-raws', 'Judas', 'Ember', 'ASW', 'Cerberus', 'Yameii'];

const hasTrustedGroup = (title: string) => (
  trustedGroups.some((group) => new RegExp(`\\[?${group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]?`, 'i').test(title))
);

const hasTrustedSignal = (torrent: NyaaItem) => (
  hasTrustedGroup(torrent.title || '') || /^(yes|true|1)$/i.test(String(torrent.trusted || ''))
);

const isDualAudio = (title: string) => (
  /\b(dual[\s-]?audio|multi[\s-]?audio|eng(?:lish)?[\s-]?dub|dubbed)\b/i.test(title)
);

const isHevc = (title: string) => (
  /\b(hevc|h\.?265|x265)\b/i.test(title)
);

const isBatch = (title: string) => (
  /\b(batch|complete|season[\s-]?pack|complete[\s-]?season)\b/i.test(title)
);

const hasEpisodeNumber = (title: string) => {
  if (/\bs\d{1,2}e\d{1,4}\b/i.test(title)) return true;
  if (/\b(?:ep|episode)\.?\s*\d{1,4}\b/i.test(title)) return true;
  const matches = title.match(/(?:^|[\s._\-[({])(\d{1,4})(?:v\d+)?(?:[\s._\]))}-]|$)(?!\s*(?:bit|kb|mb|gb|p))/gi) || [];
  return matches.some((match) => {
    const number = Number((match.match(/\d{1,4}/) || [])[0]);
    return number > 0 && number < 3000 && ![480, 720, 1080, 2160].includes(number) && !(number >= 1900 && number <= 2099);
  });
};

const isEpisode = (title: string) => hasEpisodeNumber(title) && !isBatch(title);

const hasQuality = (title: string, quality: '1080p' | '720p') => (
  new RegExp(`\\b${quality}\\b`, 'i').test(title)
);

const isRaw = (torrent: NyaaItem) => (
  torrent.categoryId === '1_4' || /\b(raw|japanese audio|jp audio)\b/i.test(torrent.title || '')
);

export function getTorrentBadges(torrent: NyaaItem): TorrentBadge[] {
  const badges: TorrentBadge[] = [];
  const title = torrent.title || '';

  if (hasTrustedSignal(torrent)) badges.push({ label: 'Trusted', tone: 'trusted' });
  if (torrent.rawSeeders >= 50) badges.push({ label: 'High seeders', tone: 'seeders' });
  if (isHevc(title)) badges.push({ label: 'HEVC', tone: 'codec' });
  if (isDualAudio(title)) badges.push({ label: 'Dual Audio', tone: 'audio' });
  badges.push(isBatch(title) ? { label: 'Batch', tone: 'batch' } : { label: 'Episode', tone: 'episode' });

  return badges;
}

export type TorrentSourceFilter = '' | 'trusted' | 'high-seeders' | 'hevc' | 'dual-audio' | 'batch' | 'episode' | 'quality-1080p' | 'quality-720p' | 'raw';

export function torrentMatchesSourceFilter(torrent: NyaaItem, filter: TorrentSourceFilter) {
  if (!filter) return true;
  const title = torrent.title || '';
  if (filter === 'trusted') return hasTrustedSignal(torrent);
  if (filter === 'high-seeders') return torrent.rawSeeders >= 50;
  if (filter === 'hevc') return isHevc(title);
  if (filter === 'dual-audio') return isDualAudio(title);
  if (filter === 'batch') return isBatch(title);
  if (filter === 'episode') return isEpisode(title);
  if (filter === 'quality-1080p') return hasQuality(title, '1080p');
  if (filter === 'quality-720p') return hasQuality(title, '720p');
  if (filter === 'raw') return isRaw(torrent);
  return true;
}

export function torrentBadgeClassName(tone: TorrentBadgeTone) {
  const base = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-black uppercase tracking-wide';
  const styles: Record<TorrentBadgeTone, string> = {
    trusted: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
    seeders: 'border-green-500/20 bg-green-500/10 text-green-500',
    codec: 'border-violet-500/20 bg-violet-500/10 text-violet-500',
    audio: 'border-blue-500/20 bg-blue-500/10 text-blue-500',
    batch: 'border-amber-500/20 bg-amber-500/10 text-amber-500',
    episode: 'border-primary/20 bg-primary/10 text-primary',
  };

  return `${base} ${styles[tone]}`;
}
