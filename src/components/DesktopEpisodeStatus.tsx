import { useMemo } from 'react';
import { episodeMetadataStatus } from '../lib/desktopEpisodeStatus';
import { useVisibleCountdown } from '../lib/useVisibleCountdown';

type Props = Omit<Parameters<typeof episodeMetadataStatus>[0], 'now'> & { retry: () => void };
export default function DesktopEpisodeStatus({ retry, ...input }: Props) {
  // Anchor legacy errors lacking an absolute deadline to their input revision,
  // rather than moving the cooldown forward on each cosmetic clock update.
  const retryStatus = useMemo(() => episodeMetadataStatus(input), [input.enabled, input.fetching, input.error, input.errorAt, input.hasTitles, input.hasEntries, input.stale, input.upcoming]);
  const now = useVisibleCountdown(retryStatus.retryAt, retryStatus.canRetry);
  const status = { ...retryStatus, waitingSeconds: Math.max(0, Math.ceil((retryStatus.retryAt - now) / 1000)) };
  if (!status.message) return null;
  return <div role="status" className="mb-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
    <span>{status.message}</span>
    {status.canRetry && <button type="button" className="sn-secondary-action px-3 py-2 disabled:opacity-50"
      disabled={input.fetching || status.waitingSeconds > 0} onClick={retry}>
      {input.fetching ? 'Refreshing…' : status.waitingSeconds > 0 ? `Retry in ${status.waitingSeconds}s` : 'Refresh episode titles'}
    </button>}
  </div>;
}
