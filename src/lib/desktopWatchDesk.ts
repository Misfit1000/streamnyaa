import type { LocalPlaybackSource } from './desktop';
import { desktopWatchPath } from './desktopAnimeRoute';
export interface WatchDeskRelease {
    id: string;
    title: string;
    episode: number;
    airingAt: number;
    path: string;
}
/** Use known schedules for explicitly tracked identities; never guess by title. */
export function watchDeskReleases(bookmarks: any[], history: LocalPlaybackSource[], catalog: any[], now = Date.now()): WatchDeskRelease[] {
    const tracked = new Set(bookmarks.map(a => String(a.mal_id ?? a.id ?? '')).filter(Boolean));
    for (const source of history)
        if (source.animeId)
            tracked.add(String(source.animeId));
    const releases = new Map<string, WatchDeskRelease>();
    for (const anime of [...bookmarks, ...catalog]) {
        const id = String(anime.mal_id ?? anime.id ?? '');
        const episode = Number(anime.nextAiringEpisode?.episode), airingAt = Number(anime.nextAiringEpisode?.airingAt);
        if (!tracked.has(id) || !id || !Number.isSafeInteger(episode) || episode <= 0 || !Number.isSafeInteger(airingAt) || airingAt <= now / 1000)
            continue;
        releases.set(id, { id, title: anime.title, episode, airingAt, path: desktopWatchPath(anime) });
    }
    return [...releases.values()].sort((a, b) => a.airingAt - b.airingAt).slice(0, 4);
}
