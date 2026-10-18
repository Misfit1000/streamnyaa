import DesktopBrand from './DesktopBrand';
import { Bookmark, Home, Play, SlidersHorizontal, Download, ChevronDown, FileVideo, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import DesktopActionMenu from './DesktopActionMenu';
import { formatPlaybackTime, type DesktopEpisodeWatchState } from '../lib/desktop';

export function DesktopWatchNavigation() {
  return <nav className="sn-watch-nav" aria-label="Watch page navigation"><Link to="/" aria-label="StreamNyaa" className="sn-watch-brand"><DesktopBrand compact /></Link><Link to="/"><Home className="h-4 w-4" />Home</Link><Link to="/search"><Play className="h-4 w-4" />Browse</Link><Link to="/my-list"><Bookmark className="h-4 w-4" />My List</Link></nav>;
}
export function DesktopWatchPlaybackCard({ episode, progress, duration, disabled, busy, sourceSummary, onPlay, onOptions, onDownloadRelease, onChooseFiles }: {
  episode: number; progress: DesktopEpisodeWatchState; duration?: number; disabled: boolean; busy: string;
  sourceSummary: string; onPlay: () => void; onOptions: () => void; onDownloadRelease?: () => void; onChooseFiles?: () => void;
}) {
  const resume = progress.positionSeconds > 0 && !progress.completed;
  return <div className="sn-watch-playback-card">
    <div className="sn-watch-playback-main"><div className="min-w-0"><p className="sn-watch-eyebrow">Selected episode</p><h2>Episode {episode}</h2><p className="sn-watch-progress-copy">{resume ? `Resume at ${formatPlaybackTime(progress.positionSeconds)}` : progress.completed ? 'Watched' : 'Ready when you are'}{duration && duration > 0 ? `${resume ? ' of ' : ' · Duration '}${formatPlaybackTime(duration)}` : ''}{progress.started ? <span> · {Math.round(progress.progressPercent)}% watched</span> : null}</p>{progress.started && <div className="sn-watch-coverage" aria-label={`${Math.round(progress.progressPercent)}% watched`}><span style={{width:`${Math.max(0,Math.min(100,progress.progressPercent))}%`}} /></div>}</div>
      <div className="sn-watch-main-actions"><button type="button" disabled={disabled} onClick={onPlay} className="sn-primary-action" aria-label={`${resume ? 'Resume' : progress.completed ? 'Watch again' : 'Play'} episode ${episode}`}><Play className="h-4 w-4 fill-current" />{busy || `${resume ? 'Resume' : progress.completed ? 'Watch again' : 'Play'} episode ${episode}`}</button>
        <DesktopActionMenu label={`Download episode ${episode} options`} actions={[{label:'Download release',action:()=>onDownloadRelease?.(),disabled:!onDownloadRelease,title:'Downloads all files in the release, including batch episodes'},{label:'Choose files',action:()=>onChooseFiles?.(),disabled:!onChooseFiles}]}><Download className="h-4 w-4" />Download<ChevronDown className="h-3 w-3" /></DesktopActionMenu>
        <button type="button" className="sn-secondary-action" onClick={onOptions} aria-label="Open playback options"><SlidersHorizontal className="h-4 w-4" />Options</button>
      </div>
    </div>
    <div className="sn-watch-source-summary"><span><FileVideo size={18} />{sourceSummary}</span><button type="button" onClick={onOptions}>Change source<ChevronRight size={16} /></button></div>
  </div>;
}
