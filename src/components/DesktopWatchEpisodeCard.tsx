import { Play } from 'lucide-react';
import DesktopEpisodeThumbnail from './DesktopEpisodeThumbnail';
import type { DesktopEpisodeWatchState } from '../lib/desktop';
export default function DesktopWatchEpisodeCard({ number, title, artwork, state, selected, onSelect, onPlay }: {
  number: number; title: string; artwork: Parameters<typeof DesktopEpisodeThumbnail>[0]['artwork'];
  state: DesktopEpisodeWatchState; selected: boolean; onSelect: () => void; onPlay: () => void;
}) {
  return <>
    <button type="button" className="sn-watch-episode-select" aria-label={`Watch episode ${number}`} aria-pressed={selected} onClick={event => {event.preventDefault();onSelect();}} onDoubleClick={event => {event.preventDefault();onSelect();}}>
      <span className="sn-watch-episode-image"><DesktopEpisodeThumbnail artwork={artwork} title={title} />
        {state.completed ? <span className="sn-watch-episode-tag">✓ Watched</span> : state.started && state.positionSeconds > 0 ? <span className="sn-watch-episode-tag">{selected ? 'Resume' : `${Math.round(state.progressPercent)}% watched`}</span> : null}
        {state.started && <span className="sn-watch-episode-progress"><span style={{width:`${Math.max(0,Math.min(100,state.progressPercent))}%`}} /></span>}
      </span>
      <span className="sn-watch-episode-caption" title={title}>{/^Episode\s+\d+$/i.test(title) ? `${number}. Episode ${number}` : `${number}. ${title}`}</span>
    </button>
    <button type="button" className="sn-watch-episode-play" aria-label={`Play episode ${number}`} onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.preventDefault();event.stopPropagation();onPlay();}} onDoubleClick={event=>{event.preventDefault();event.stopPropagation();}}><Play size={15} fill="currentColor" /></button>
  </>;
}
