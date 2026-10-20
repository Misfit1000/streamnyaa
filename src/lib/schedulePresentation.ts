function desktopCanonicalAnimeId(anime: any): string {
 const aid=Number(anime?.anilist_id||anime?.anilistId),mid=Number(anime?.mal_id||anime?.malId);
 return Number.isSafeInteger(aid)&&aid>0?'anilist:'+aid:Number.isSafeInteger(mid)&&mid>0?'mal:'+mid:anime?.scheduleProvider==='animeschedule'&&/^[a-z0-9-]+$/.test(anime?.sourceRoute||'')?'animeschedule:'+anime.sourceRoute:'';
}

import { desktopPosterCandidates } from './desktopArtwork';

export const scheduleTrackLabel = (row: any) => row.releaseTrack === 'dub' ? 'Dub' : row.releaseTrack === 'sub' ? 'Sub' : 'Original';
export function sameScheduleAnime(a: any, b: any) {
  if (a.anilist_id && b.anilist_id && String(a.anilist_id) !== String(b.anilist_id)) return false;
  if (a.mal_id && b.mal_id && String(a.mal_id) !== String(b.mal_id)) return false;
  return Boolean(!a.anilist_id && !a.mal_id && !b.anilist_id && !b.mal_id && a.scheduleProvider === 'animeschedule' && b.scheduleProvider === 'animeschedule' && a.sourceRoute && a.sourceRoute === b.sourceRoute
    || a.anilist_id && String(a.anilist_id) === String(b.anilist_id)
    || a.mal_id && String(a.mal_id) === String(b.mal_id));
}
export function scheduleArtworkCandidates(row: any) { return desktopPosterCandidates(row).filter(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}); }
export function groupScheduleEpisodes(rows: any[]) {
  const groups: { key: string; anime: any; tracks: any[] }[] = [];
  for (const row of rows) {
    let group = groups.find(group => sameScheduleAnime(group.anime, row) && Number(group.anime.airingEpisode) === Number(row.airingEpisode));
    if (!group) { group = { key: `${desktopCanonicalAnimeId(row)}:episode-${row.airingEpisode}`, anime: row, tracks: [] }; groups.push(group); }
    const previous = group.tracks.findIndex(track => (track.releaseTrack || 'original') === (row.releaseTrack || 'original'));
    if (previous < 0) group.tracks.push(row);
    else if (Number(row.scheduleFetchedAt || 0) >= Number(group.tracks[previous].scheduleFetchedAt || 0)) group.tracks[previous] = row;
    if (!scheduleArtworkCandidates(group.anime).length && scheduleArtworkCandidates(row).length) group.anime = row;
  }
  for (const group of groups) group.tracks.sort((a,b) => ['original','sub','dub'].indexOf(a.releaseTrack || 'original') - ['original','sub','dub'].indexOf(b.releaseTrack || 'original'));
  return groups;
}

export type ScheduleBroadcastState = {
  kind: 'normal' | 'delayed' | 'cancelled' | 'postponed' | 'rescheduled' | 'hiatus' | 'suspended' | 'tba';
  label: string;
  headline?: string;
  detail?: string;
  prominent: boolean;
  blocksReminder: boolean;
};

export function airingAtMs(anime: any) {
  const raw = Number(anime?.airingAt || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 1_000_000_000_000 ? raw : raw * 1000;
}

function scheduleStatusBlob(anime: any) {
  const candidates = [
    anime?.scheduleStatus,
    anime?.airingStatus,
    anime?.broadcastStatus,
    anime?.episodeStatus,
    anime?.releaseStatus,
    anime?.delayStatus,
    anime?.status,
    anime?.airingMessage,
    anime?.broadcastMessage,
    anime?.message,
    anime?.notice,
    anime?.notes,
  ];
  return candidates
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' ')
    .toLowerCase();
}

export function scheduleBroadcastState(anime: any, airingMs = airingAtMs(anime)): ScheduleBroadcastState {
  const statusText = scheduleStatusBlob(anime);
  const explicitCancelled = anime?.cancelled || anime?.canceled || anime?.isCancelled || anime?.isCanceled;
  const explicitDelayed = anime?.delayed || anime?.isDelayed;
  const explicitPostponed = anime?.postponed || anime?.isPostponed;
  const explicitRescheduled = anime?.rescheduled || anime?.isRescheduled;

  if (explicitCancelled || /\b(cancelled|canceled|cancelation|cancellation)\b/.test(statusText)) {
    return {
      kind: 'cancelled',
      label: 'Cancelled',
      headline: 'CANCELLED',
      detail: 'This airing is not expected to release as scheduled.',
      prominent: true,
      blocksReminder: true,
    };
  }

  if (/\b(hiatus|on hiatus|on break|break)\b/.test(statusText)) {
    return {
      kind: 'hiatus',
      label: /break/.test(statusText) ? 'On break' : 'On hiatus',
      headline: 'ON HIATUS',
      detail: 'Broadcast is paused until a new date is announced.',
      prominent: true,
      blocksReminder: true,
    };
  }

  if (/\b(suspended|suspension)\b/.test(statusText)) {
    return {
      kind: 'suspended',
      label: 'Suspended',
      headline: 'SUSPENDED',
      detail: 'Broadcast is temporarily suspended.',
      prominent: true,
      blocksReminder: true,
    };
  }

  if (explicitPostponed || /\b(postponed|postpone|pushed back)\b/.test(statusText)) {
    return {
      kind: 'postponed',
      label: 'Postponed',
      headline: 'POSTPONED',
      detail: airingMs ? 'A new airing time may replace this slot.' : 'Waiting for a new airing time.',
      prominent: true,
      blocksReminder: !airingMs,
    };
  }

  if (explicitRescheduled || /\b(rescheduled|reschedule|moved to|new time)\b/.test(statusText)) {
    const previousAiringMs = airingAtMs({ airingAt: anime?.previousAiringAt });
    return {
      kind: 'rescheduled',
      label: 'Rescheduled',
      headline: 'RESCHEDULED',
      detail: previousAiringMs && airingMs
        ? `Moved from ${formatAiringTime(previousAiringMs)} to ${formatAiringTime(airingMs)}.`
        : airingMs
          ? 'Airing time has changed.'
          : 'Waiting for an updated airing time.',
      prominent: true,
      blocksReminder: !airingMs,
    };
  }

  if (explicitDelayed || /\b(delayed|delay|late|pushed)\b/.test(statusText)) {
    return {
      kind: 'delayed',
      label: 'Delayed',
      headline: 'DELAYED',
      detail: airingMs ? 'This episode is marked delayed; check the updated time.' : 'No reliable airing time yet.',
      prominent: true,
      blocksReminder: !airingMs,
    };
  }

  if (!airingMs) {
    return {
      kind: 'tba',
      label: 'TBA',
      detail: 'Airing time has not been announced.',
      prominent: false,
      blocksReminder: true,
    };
  }

  return {
    kind: 'normal',
    label: new Date(airingMs).getTime() > Date.now() ? 'Airing soon' : 'Aired',
    prominent: false,
    blocksReminder: false,
  };
}

function formatAiringTime(ms: number) { return new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }); }

/** Both native milliseconds and provider seconds are accepted at this boundary. */
export function scheduleInRange(row: any, start: number, end: number) {
  const current = airingAtMs(row);
  const previous = airingAtMs({ airingAt: row.previousAiringAt });
  return current >= start && current < end
    || scheduleBroadcastState(row).prominent && previous >= start && previous < end;
}

export function scheduleNextRelease(tracks: any[], now: number) {
  const usable = tracks.filter(track => {
    const state = scheduleBroadcastState(track);
    // An explicit delay with only its old slot must not revive an airing alert.
    if (state.kind === 'normal') return airingAtMs(track) > 0;
    const previous = airingAtMs({ airingAt: track.previousAiringAt });
    return state.kind === 'rescheduled' && airingAtMs(track) > 0
      || ['delayed', 'postponed'].includes(state.kind) && previous > 0 && airingAtMs(track) > previous;
  }).map(airingAtMs).sort((a, b) => a - b);
  return usable.find(at => at >= now) || usable.at(-1) || 0;
}

export function scheduleDelayLabel(tracks: any[]) {
  const delayed = tracks.filter(track => scheduleBroadcastState(track).kind === 'delayed');
  if (!delayed.length) return '';
  return delayed.length === tracks.length ? 'Delayed' : `${delayed.map(scheduleTrackLabel).join(' + ')} delayed`;
}

export function scheduleTitleCount(rows: any[]) {
  const titles: any[] = [];
  for (const row of rows) {
    const index = titles.findIndex(title => sameScheduleAnime(title, row));
    if (index < 0) titles.push(row);
    else titles[index] = { ...titles[index], ...row,
      anilist_id: row.anilist_id || titles[index].anilist_id, mal_id: row.mal_id || titles[index].mal_id };
  }
  return titles.length;
}

export type ScheduleSectionWindow = {
  weekStart: number; weekEnd: number; dayStart: number; dayEnd: number;
  today: boolean; dayLabel: string; now: number;
};

/** Scope retained history for display without changing the scheduler's evidence. */
export function scheduleSections(rows: any[], window: ScheduleSectionWindow, matches: (anime: any) => boolean = () => true) {
  const changed: any[][] = [], upcoming: any[][] = [], aired: any[][] = [], day: any[][] = [];
  for (const group of groupScheduleEpisodes(rows)) {
    const tracks = group.tracks.filter(track => scheduleInRange(track, window.weekStart, window.weekEnd));
    if (!tracks.length || !matches(group.anime)) continue;
    if (window.today && tracks.some(track => scheduleBroadcastState(track).prominent)) {
      changed.push(tracks);
    } else if (tracks.some(track => scheduleInRange(track, window.dayStart, window.dayEnd))) {
      if (!window.today) day.push(tracks);
      else (scheduleNextRelease(tracks, window.now) > window.now ? upcoming : aired).push(tracks);
    }
  }
  const ordered = (groups: any[][]) => groups.sort((a, b) => {
    const time = (tracks: any[]) => scheduleNextRelease(tracks, window.now)
      || Math.min(...tracks.map(track => airingAtMs({ airingAt: track.previousAiringAt }) || Infinity));
    return time(a) - time(b);
  }).flat();
  return (window.today ? [
    { title: 'Schedule changes', items: ordered(changed) },
    { title: 'Airing Soon', items: ordered(upcoming) },
    { title: 'Already Aired', items: ordered(aired) },
  ] : [{ title: window.dayLabel, items: ordered(day) }]).filter(section => section.items.length);
}
