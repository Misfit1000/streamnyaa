import { useEffect, useState } from 'react';
import { episodeMetadataStatus } from '../lib/desktopEpisodeStatus';

type Props = Omit<Parameters<typeof episodeMetadataStatus>[0], 'now'> & { retry: () => void };
export default function DesktopEpisodeStatus({ retry, ...input }: Props) {
  const [now, setNow] = useState(Date.now);
  const status = episodeMetadataStatus({ ...input, now });
  useEffect(() => {
    if (!status.canRetry || status.retryAt <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status.canRetry, status.retryAt]);
  if (!status.message) return null;
  return <div role="status" className="mb-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
    <span>{status.message}</span>
    {status.canRetry && <button type="button" className="sn-secondary-action px-3 py-2 disabled:opacity-50"
      disabled={input.fetching || status.waitingSeconds > 0} onClick={retry}>
      {input.fetching ? 'Refreshing…' : status.waitingSeconds > 0 ? `Retry in ${status.waitingSeconds}s` : 'Refresh episode titles'}
    </button>}
  </div>;
}
