import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { scheduleArtworkCandidates } from '../lib/desktopSchedulePresentation';
export default function DesktopScheduleArtwork({ anime, delayLabel }: { anime: any; delayLabel?: string }) {
  const candidates = scheduleArtworkCandidates(anime);
  const [failed, setFailed] = useState<string[]>([]);
  const source = candidates.find(candidate => !failed.includes(candidate));
  return <span className="sn-schedule-artwork">{source ? <img src={source} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(previous => [...previous, source])} />
    : <span role="img" aria-label={`Artwork unavailable for ${anime.title || 'this anime'}`}><ImageOff size={20} /></span>}
    {delayLabel && <span className="sn-schedule-artwork-delay"><span>{delayLabel}</span></span>}
  </span>;
}
