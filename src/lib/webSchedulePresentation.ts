import { calendarIdentityCoverage, type CalendarRecord } from './calendarModel';
import { airingAtMs, scheduleBroadcastState, scheduleInRange, scheduleNextRelease, type ScheduleSectionWindow } from './schedulePresentation';
export type ScheduleTitle = { key: string; anime: CalendarRecord; tracks: CalendarRecord[] };
/** One installment per visible view; every row retains its actual episode/track. */
export function webScheduleSections(rows: CalendarRecord[], window: ScheduleSectionWindow, adult: boolean) {
  const titles = new Map<string, ScheduleTitle>();
  const {unresolved}=calendarIdentityCoverage(rows);
  for (const row of rows) {
    if (unresolved.has(row) || !adult && row.isAdult || !scheduleInRange(row, window.weekStart, window.weekEnd)) continue;
    const changed = scheduleBroadcastState(row).prominent;
    if (!(window.today && changed) && !scheduleInRange(row, window.dayStart, window.dayEnd)) continue;
    const key = row.canonicalId;
    const group = titles.get(key) || { key, anime: row, tracks: [] };
    group.tracks.push(row);
    if (!group.anime.images && row.images || !group.anime.score && row.score) group.anime = row;
    titles.set(key, group);
  }
  const sections = new Map<string, ScheduleTitle[]>(window.today
    ? [['Schedule changes', []], ['Airing Soon', []], ['Already Aired', []]] : [[window.dayLabel, []]]);
  for (const title of titles.values()) {
    title.tracks.sort((a,b) => (airingAtMs(a) || Number(a.previousAiringAt) || Infinity) - (airingAtMs(b) || Number(b.previousAiringAt) || Infinity)
      || a.airingEpisode - b.airingEpisode || ['original','sub','dub'].indexOf(a.releaseTrack) - ['original','sub','dub'].indexOf(b.releaseTrack));
    const section = !window.today ? window.dayLabel : title.tracks.some(row => scheduleBroadcastState(row).prominent)
      ? 'Schedule changes' : scheduleNextRelease(title.tracks, window.now) > window.now ? 'Airing Soon' : 'Already Aired';
    sections.get(section)!.push(title);
  }
  return [...sections].map(([title, groups]) => ({ title, groups: groups.sort((a,b) =>
    (scheduleNextRelease(a.tracks, window.now) || Infinity) - (scheduleNextRelease(b.tracks, window.now) || Infinity) || a.anime.title.localeCompare(b.anime.title)) })).filter(section => section.groups.length);
}
