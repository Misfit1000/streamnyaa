const ANILIST_URL = 'https://graphql.anilist.co';

export const BLOG_POSTS = [
  {
    slug: 'trending-anime-this-week',
    title: 'Trending Anime This Week',
    seoTitle: 'Trending Anime This Week - Current Top Airing Shows | StreamNyaa',
    category: 'Trending',
    description: 'Find trending anime this week with current top airing shows, scores, genres, episode context, and StreamNyaa anime pages.',
    summary: 'A useful weekly article for finding anime with the strongest current momentum.',
    intro: 'These are the anime titles getting the most attention right now. Use this guide when you want something active, talked about, and easy to follow from the current season.',
    angle: 'current momentum',
    readerPromise: 'Use this article to quickly compare the shows that are moving fastest this week, then jump into the StreamNyaa title page for more details.',
  },
  {
    slug: 'popular-anime-right-now',
    title: 'Popular Anime Right Now',
    seoTitle: 'Popular Anime Right Now - Most Watched Airing Shows | StreamNyaa',
    category: 'Popular',
    description: 'Browse popular anime right now with current airing titles, popularity signals, scores, genres, and StreamNyaa discovery links.',
    summary: 'A practical article for finding anime with large current viewer interest.',
    intro: 'Popular anime lists are useful when you want familiar titles with strong audience activity. This article focuses on widely watched anime that are currently relevant.',
    angle: 'viewer interest',
    readerPromise: 'Use this article to find safe picks with broad appeal, then compare scores, genres, episodes, and title pages before choosing what to watch.',
  },
  {
    slug: 'upcoming-anime-this-season',
    title: 'Upcoming Anime This Season',
    seoTitle: 'Upcoming Anime This Season - New Anime Release Guide | StreamNyaa',
    category: 'Upcoming',
    description: 'Find upcoming anime this season with new release context, genres, expected formats, metadata, and StreamNyaa title links.',
    summary: 'A forward-looking article for spotting anime before they start airing.',
    intro: 'Upcoming anime are worth tracking early, especially when sequels, studio projects, and high-interest adaptations are close to release. This guide keeps the next wave easy to scan.',
    angle: 'season preview',
    readerPromise: 'Use this article to build a watchlist before the season gets crowded, with quick context for each title and direct StreamNyaa discovery links.',
  },
  {
    slug: 'todays-anime-release-schedule',
    title: "Today's Anime Release Schedule",
    seoTitle: "Today's Anime Release Schedule - New Episodes Airing Today | StreamNyaa",
    category: 'Schedule',
    description: 'See today\'s anime release schedule with new episodes airing today, episode numbers, timing, genres, and StreamNyaa anime detail links.',
    summary: 'A daily article for checking which anime episodes are expected today.',
    intro: 'This daily schedule helps you see what is airing today without digging through multiple pages. It is best for quickly spotting new episodes and choosing what to follow next.',
    angle: 'daily releases',
    readerPromise: 'Use this article as a simple daily checklist for new anime episodes, release times, episode numbers, and follow-up title pages.',
  },
  {
    slug: 'recent-anime-episode-updates',
    title: 'Recent Anime Episode Updates',
    seoTitle: 'Recent Anime Episode Updates - Latest Airing Anime | StreamNyaa',
    category: 'Episodes',
    description: 'Track recent anime episode updates with latest airing anime, episode numbers, scores, genres, schedule data, and StreamNyaa links.',
    summary: 'A recent-update article for finding anime that just aired or moved forward.',
    intro: 'Recent episode updates are the fastest way to catch active shows after they air. This guide highlights fresh activity so you can decide what to continue, start, or revisit.',
    angle: 'fresh episode activity',
    readerPromise: 'Use this article to catch up on newly updated anime and open the StreamNyaa title pages for more context.',
  },
] as const;
export type BlogSlug = typeof BLOG_POSTS[number]['slug'];
export type BlogPostDefinition = typeof BLOG_POSTS[number];
export interface BlogMediaItem {
  id: number;
  mal_id: number;
  title: string;
  description: string;
  image: string;
  genres: string[];
  studios: string[];
  format?: string;
  status?: string;
  score?: number;
  episodes?: number;
  episode?: number;
  airingAt?: number;
  nextEpisode?: number;
  nextAiringAt?: number;
  season?: string;
  seasonYear?: number;
  popularity?: number;
  trending?: number;
}
export type BlogPostData = BlogPostDefinition & { updatedAt: string; items: BlogMediaItem[]; };
const MEDIA_FIELDS = 'id idMal title { romaji english native } description format status episodes genres averageScore popularity trending season seasonYear coverImage { extraLarge large } studios(isMain: true) { nodes { name } } nextAiringEpisode { episode airingAt }';
function cleanText(value = '') { return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }
function mediaTitle(media: any) { return media.title?.english || media.title?.romaji || media.title?.native || 'Untitled Anime'; }
function mapMedia(media: any, extra: Partial<BlogMediaItem> = {}): BlogMediaItem | null {
  const image = media.coverImage?.extraLarge || media.coverImage?.large || '';
  const id = media.idMal || media.id;
  const title = mediaTitle(media);
  if (!id || !title || !image) return null;
  return {
    id: media.id,
    mal_id: id,
    title,
    description: cleanText(media.description).slice(0, 360),
    image,
    genres: media.genres || [],
    studios: media.studios?.nodes?.map((studio: any) => studio.name).filter(Boolean).slice(0, 2) || [],
    format: media.format,
    status: media.status,
    score: media.averageScore,
    episodes: media.episodes,
    season: media.season,
    seasonYear: media.seasonYear,
    popularity: media.popularity,
    trending: media.trending,
    nextEpisode: media.nextAiringEpisode?.episode,
    nextAiringAt: media.nextAiringEpisode?.airingAt,
    ...extra,
  };
}
function onlyRealItems(items: Array<BlogMediaItem | null>) { return items.filter((item): item is BlogMediaItem => Boolean(item && item.mal_id && item.title && item.image)); }
async function aniListRequest(query: string, variables: Record<string, unknown>) {
  const response = await fetch(ANILIST_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  if (!response.ok) throw new Error('AniList request failed');
  const json = await response.json();
  if (json.errors) throw new Error('AniList returned an error');
  return json.data;
}
async function fetchMediaList(sort: string, status: string = 'RELEASING') {
  const query = 'query BlogMedia($sort: [MediaSort], $status: MediaStatus) { Page(page: 1, perPage: 12) { media(type: ANIME, sort: $sort, status: $status, isAdult: false) { ' + MEDIA_FIELDS + ' } } }';
  const data = await aniListRequest(query, { sort: [sort], status });
  return onlyRealItems((data.Page.media || []).map((media: any) => mapMedia(media)));
}
async function fetchTodaysSchedule() {
  const now = new Date(); const start = new Date(now); start.setHours(0, 0, 0, 0); const end = new Date(now); end.setHours(23, 59, 59, 999);
  const query = 'query BlogToday($start: Int, $end: Int) { Page(page: 1, perPage: 24) { airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) { episode airingAt media { ' + MEDIA_FIELDS + ' isAdult } } } }';
  const data = await aniListRequest(query, { start: Math.floor(start.getTime() / 1000), end: Math.floor(end.getTime() / 1000) });
  const seen = new Set<number>();
  return onlyRealItems((data.Page.airingSchedules || []).filter((schedule: any) => !schedule.media?.isAdult).filter((schedule: any) => { const id = schedule.media.idMal || schedule.media.id; if (seen.has(id)) return false; seen.add(id); return true; }).slice(0, 12).map((schedule: any) => mapMedia(schedule.media, { episode: schedule.episode, airingAt: schedule.airingAt })));
}
async function fetchRecentEpisodes() {
  const query = 'query BlogRecent($now: Int) { Page(page: 1, perPage: 24) { airingSchedules(airingAt_lesser: $now, sort: TIME_DESC) { episode airingAt media { ' + MEDIA_FIELDS + ' isAdult } } } }';
  const data = await aniListRequest(query, { now: Math.floor(Date.now() / 1000) });
  const seen = new Set<number>();
  return onlyRealItems((data.Page.airingSchedules || []).filter((schedule: any) => !schedule.media?.isAdult).filter((schedule: any) => { const id = schedule.media.idMal || schedule.media.id; if (seen.has(id)) return false; seen.add(id); return true; }).slice(0, 12).map((schedule: any) => mapMedia(schedule.media, { episode: schedule.episode, airingAt: schedule.airingAt })));
}
export function getBlogPost(slug: string | undefined) { return BLOG_POSTS.find((post) => post.slug === slug); }
export async function fetchBlogPost(slug: string): Promise<BlogPostData> {
  const definition = getBlogPost(slug); if (!definition) throw new Error('Blog post not found');
  let items: BlogMediaItem[];
  if (slug === 'trending-anime-this-week') items = await fetchMediaList('TRENDING_DESC', 'RELEASING');
  else if (slug === 'popular-anime-right-now') items = await fetchMediaList('POPULARITY_DESC', 'RELEASING');
  else if (slug === 'upcoming-anime-this-season') items = await fetchMediaList('POPULARITY_DESC', 'NOT_YET_RELEASED');
  else if (slug === 'todays-anime-release-schedule') items = await fetchTodaysSchedule();
  else items = await fetchRecentEpisodes();
  return { ...definition, updatedAt: new Date().toISOString(), items };
}
