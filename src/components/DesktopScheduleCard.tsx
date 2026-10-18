import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import DesktopScheduleArtwork from './DesktopScheduleArtwork';
import { DesktopScheduleStatus } from './DesktopScheduleControls';
import { airingAtMs, scheduleBroadcastState, scheduleDelayLabel, scheduleNextRelease, scheduleTrackLabel } from '../lib/desktopSchedulePresentation';
import { scheduleRevisionKey } from '../lib/scheduleRevisions';
import { primeScheduleWatch, scheduleWatchPath } from '../lib/desktopScheduleWatch';

export default function DesktopScheduleCard({ anime, tracks, now, stale, children }: {
  anime: any; tracks: any[]; now: number; stale?: boolean; children?: ReactNode;
}) {
  const at = scheduleNextRelease(tracks, now);
  const title = String(anime.title_english || anime.title || anime.title_japanese || 'Anime');
  const delay = scheduleDelayLabel(tracks);
  const changed = tracks.map(track => scheduleBroadcastState(track)).find(state => state.prominent);
  const parts = at ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).formatToParts(at) : [];
  const period = parts.find(part => part.type === 'dayPeriod')?.value;
  const time = parts.filter(part => part.type !== 'dayPeriod').map(part => part.value).join('').trim();
  return <article className="broadcast-ticket sn-calendar-card" data-schedule-state={changed?.kind} aria-label={`${title}, episode ${anime.airingEpisode || 'TBA'}`}>
    <div className="broadcast-time">
      {at ? <><time dateTime={new Date(at).toISOString()}><strong>{time}</strong>{period && <span className="broadcast-period">{period}</span>}</time><span>{at > now ? 'Airing soon' : 'Aired'}</span></>
        : <span className="broadcast-awaiting">{changed && ['cancelled', 'suspended'].includes(changed.kind) ? changed.label : 'Awaiting new date'}</span>}
    </div>
    <Link className="broadcast-title" to={scheduleWatchPath(anime)} onClick={() => primeScheduleWatch(anime)}>
      <DesktopScheduleArtwork anime={anime} delayLabel={delay} />
      <span className="broadcast-copy"><small>EPISODE {anime.airingEpisode || 'TBA'}</small><strong>{title}</strong>
        <span>{at ? at > now ? 'Next confirmed release' : 'Confirmed broadcast time' : 'Release schedule updated'}</span></span>
      <ChevronRight className="broadcast-open h-5 w-5" aria-hidden="true" />
    </Link>
    <div className="sn-schedule-tracks" aria-label="Release tracks"><span className="sn-schedule-tracks-heading">Release times</span>
      {tracks.map(track => {
        const state = scheduleBroadcastState(track);
        return <div className="sn-schedule-track" key={scheduleRevisionKey(track)}>
          <span className="sn-schedule-track-label">{scheduleTrackLabel(track)}</span>
          {state.prominent ? <DesktopScheduleStatus kind={state.kind} label={state.label}
            previousAt={airingAtMs({ airingAt: track.previousAiringAt })} revisedAt={airingAtMs(track)}
            reason={track.scheduleReason || state.detail} fetchedAt={Number(track.scheduleFetchedAt) || undefined}
            stale={stale || Boolean(track.scheduleFetchedAt && now - Number(track.scheduleFetchedAt) > 30 * 60_000)} />
            : <span className="sn-schedule-track-time">{airingAtMs(track) ? <time dateTime={new Date(airingAtMs(track)).toISOString()}>{new Date(airingAtMs(track)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time> : 'Time to be announced'}<small>{state.label}</small></span>}
        </div>;
      })}
    </div>
    {children}
  </article>;
}
