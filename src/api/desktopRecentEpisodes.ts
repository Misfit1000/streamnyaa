/** The replacement has no /watch endpoint. Never substitute catalog titles for episode broadcasts. */
export async function fetchRecentEpisodeListings(_signal?: AbortSignal): Promise<never> {
  throw new Error('Recent episode listings are unsupported; use the confirmed airing schedule.');
}
