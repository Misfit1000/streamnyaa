import { desktopDataError } from './desktopData';

export function episodeMetadataStatus(input: {
  enabled: boolean; fetching: boolean; error?: unknown; errorAt?: number;
  hasTitles: boolean; hasEntries: boolean; stale?: boolean; upcoming?: boolean; now?: number;
}) {
  const now = input.now ?? Date.now();
  const error = input.error ? desktopDataError('jikan', input.error) : undefined;
  const delay = error?.retryAfterMs ?? (error?.code === 'access-denied' ? 300_000 : 30_000);
  const retryAt = error ? (input.errorAt || now) + delay : 0;
  let message = '';
  if (input.upcoming) message = 'Episode titles will appear when published.';
  else if (!input.enabled) message = input.hasTitles ? '' : 'Episode titles need a verified MyAnimeList identity. Numbered navigation remains available.';
  else if (input.fetching && !input.hasTitles) message = 'Loading episode titles…';
  else if (error) {
    const reason = error.statusCode && error.statusCode >= 500
      ? `The episode provider is temporarily unavailable (HTTP ${error.statusCode}).`
      : error.code === 'rate-limited' ? 'The episode provider has asked us to wait.'
      : error.code === 'access-denied' ? 'The episode provider declined this request.'
      : error.code === 'offline' ? 'Episode updates are offline.'
      : error.code === 'timeout' ? 'The episode provider took too long to respond.'
      : 'Episode titles could not be refreshed.';
    message = `${reason} ${input.hasTitles ? 'Available titles remain visible.' : 'You can still select an episode and find sources.'}`;
  } else if (input.stale) message = 'Saved episode titles are shown while live updates are unavailable.';
  else if (!input.hasTitles) message = input.hasEntries ? 'Titles have not been published for these episodes yet.' : 'The provider has not listed episode titles yet. Numbered navigation remains available.';
  return {
    message,
    canRetry: input.enabled && !input.upcoming && Boolean(error || input.stale),
    retryAt,
    waitingSeconds: Math.max(0, Math.ceil((retryAt - now) / 1000)),
  };
}
