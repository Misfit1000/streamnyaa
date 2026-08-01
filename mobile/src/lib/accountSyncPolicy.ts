type FingerprintInput = {
  library: Array<{ animeId: string; bookmarked: boolean; liked: boolean; updatedAt: string }>;
  watchHistory: Array<{ key: string; updatedAt: string }>;
  preferences: { updatedAt: string };
};

export function accountPayloadFingerprint(payload: FingerprintInput) {
  const library = payload.library
    .map((item) => `${item.animeId}:${Number(item.bookmarked)}:${Number(item.liked)}:${item.updatedAt}`)
    .sort();
  const history = payload.watchHistory
    .map((item) => `${item.key}:${item.updatedAt}`)
    .sort();
  return JSON.stringify([library, history, payload.preferences.updatedAt]);
}

export function accountSyncDelayMs(options: {
  libraryChanged: boolean;
  preferencesChanged: boolean;
  batterySaver: boolean;
}) {
  if (options.libraryChanged || options.preferencesChanged) return 1_200;
  return options.batterySaver ? 45_000 : 30_000;
}
