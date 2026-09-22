/** Canonical schedule validation shared by Home and Explore. */
export function validRecentSchedules(items: unknown[], before: number) {
    const seen = new Set<string>();
    return items.filter((entry: any) => {
        const id = Number(entry?.media?.id), episode = Number(entry?.episode), airingAt = Number(entry?.airingAt);
        if (!Number.isSafeInteger(id) || id <= 0 || !entry.media.title || !Number.isSafeInteger(episode) || episode <= 0 || !Number.isSafeInteger(airingAt) || airingAt <= 0 || airingAt > before)
            return false;
        const key = `${id}:${episode}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}

/** Airing time belongs to AiringSchedule, never its nested Media object. */
export function recentHomeQuery(limit: number, before: number) {
  return `
    query {
      Page(page: 1, perPage: ${Math.max(12, Math.min(50, Math.ceil(limit)))}) {
        airingSchedules(airingAt_lesser: ${before}, sort: TIME_DESC) {
          airingAt
          episode
          media {
            id
            idMal
            title { romaji english native }
            description
            episodes
            status
            format
            coverImage { extraLarge large color } bannerImage
            genres
            averageScore
            isAdult
          }
        }
      }
    }
  `;
}
