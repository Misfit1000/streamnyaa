import { useEffect, useState } from 'react';
import { BellPlus, BellRing, Loader2 } from 'lucide-react';
import {
  isDesktopUpcomingAnimeWatched,
  subscribeDesktopUpcomingAnimeWatches,
  toggleDesktopUpcomingAnimeWatch,
} from '../lib/desktopReminders';

export default function UpcomingNotifyButton({ anime, compact = false, fullWidth = false, className = '' }: { anime: any; compact?: boolean; fullWidth?: boolean; className?: string }) {
  const [saved, setSaved] = useState(() => isDesktopUpcomingAnimeWatched(anime));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => subscribeDesktopUpcomingAnimeWatches(() => {
    setSaved(isDesktopUpcomingAnimeWatched(anime));
  }), [anime]);

  const toggle = async () => {
    if (pending) return;
    setPending(true);
    setMessage('');
    try {
      const result = await toggleDesktopUpcomingAnimeWatch(anime);
      setSaved(result.saved ? true : result.removed ? false : saved);
      if (!result.saved && !result.removed) {
        setMessage(result.permission === 'denied' ? 'Enable notifications in Windows settings.' : 'Notifications are unavailable right now.');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <span className={`inline-flex flex-col ${fullWidth ? 'w-full' : ''} ${className}`}>
      <button
        type="button"
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); void toggle(); }}
        className={`${compact ? 'h-9 px-3 text-xs' : 'h-11 px-4 text-sm'} ${fullWidth ? 'w-full' : ''} inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition-colors ${saved ? 'border-primary/35 bg-primary/16 text-primary' : 'border-white/[0.1] bg-black/65 text-white/78 hover:bg-white/[0.09] hover:text-white'}`}
        aria-pressed={saved}
        aria-label={saved ? 'Cancel airing notification' : 'Notify me when this anime airs'}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <BellRing className="h-4 w-4" /> : <BellPlus className="h-4 w-4" />}
        {saved ? 'Notification set' : 'Notify me'}
      </button>
      {message ? <span className="mt-1 text-[11px] text-amber-200" role="status">{message}</span> : null}
    </span>
  );
}
