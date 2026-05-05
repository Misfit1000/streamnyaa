const ANILIST_URL = 'https://graphql.anilist.co';

export const BLOG_POSTS = [
  { slug: 'trending-anime-this-week', title: 'Trending Anime This Week', seoTitle: 'Trending Anime This Week | StreamNyaa Blog', category: 'Trending', description: 'Discover trending anime this week with current AniList popularity signals, genres, scores, and StreamNyaa anime links.', summary: 'A live snapshot of anime titles with strong current momentum.', intro: 'This auto-updated guide highlights anime with strong current momentum. It uses AniList trend data so the list can shift as seasonal shows, new episodes, and fan activity change.' },
  { slug: 'popular-anime-right-now', title: 'Popular Anime Right Now', seoTitle: 'Popular Anime Right Now | StreamNyaa Blog', category: 'Popular', description: 'Browse popular anime right now with current popularity data, anime details, genres, scores, and discovery links on StreamNyaa.', summary: 'A current popularity list for widely watched anime titles.', intro: 'Popularity rankings are useful when you want familiar, high-traffic anime with large viewer interest. This page refreshes from AniList data and links into StreamNyaa detail pages.' },
  { slug: 'upcoming-anime-this-season', title: 'Upcoming Anime This Season', seoTitle: 'Upcoming Anime This Season | StreamNyaa Blog', category: 'Upcoming', description: 'Find upcoming anime for the season with release context, genres, anime metadata, and StreamNyaa discovery links.', summary: 'Upcoming anime picks sourced from current seasonal metadata.', intro: 'Use this page to spot upcoming anime before they begin airing. The list is generated from AniList upcoming title data and designed for quick seasonal browsing.' },
  { slug: 'todays-anime-release-schedule', title: "Today's Anime Release Schedule", seoTitle: "Today's Anime Release Schedule | StreamNyaa Blog", category: 'Schedule', description: 'See anime episodes scheduled for today with episode numbers, release timing context, and anime detail links on StreamNyaa.', summary: 'A daily anime schedule article generated from airing data.', intro: 'This schedule article is built from current AniList airing schedule data. It focuses on shows with episodes expected today, making it easier to follow daily anime updates.' },
  { slug: 'recent-anime-episode-updates', title: 'Recent Anime Episode Updates', seoTitle: 'Recent Anime Episode Updates | StreamNyaa Blog', category: 'Episodes', description: 'Track recent anime episode updates with current airing data, episode numbers, anime metadata, and StreamNyaa watch links.', summary: 'Recently aired anime episode updates for active viewers.', intro: 'Recent episode activity helps you find shows that just aired or updated. This article uses AniList airing data and links into StreamNyaa pages for fast follow-up.' },
] as const;
export type BlogSlug = typeof BLOG_POSTS[number]['slug'];
export type BlogPostDefinition = typeof BLOG_POSTS[number];
export interface BlogMediaItem { id: number; mal_id: number; title: string; description: string; image: string; genres: string[]; format?: string; status?: string; score?: number; episodes?: number; episode?: number; airingAt?: number; }
export interface BlogPostData extends BlogPostDefinition { updatedAt: string; items: BlogMediaItem[]; }
const MEDIA_FIELDS = 'id idMal title { romaji english native } description format status episodes genres averageScore coverImage { extraLarge large }';
function cleanText(value = '') { return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }
function mediaTitle(media: any) { return media.title?.english || media.title?.romaji || media.title?.native || 'Untitled Anime'; }
function mapMedia(media: any, extra: Partial<BlogMediaItem> = {}): BlogMediaItem | null {
  const image = media.coverImage?.extraLarge || media.coverImage?.large || '';
  const id = media.idMal || media.id;
  const title = mediaTitle(media);
  if (!id || !title || !image) return null;
  return { id: media.id, mal_id: id, title, description: cleanText(media.description).slice(0, 220), image, genres: media.genres || [], format: media.format, status: media.status, score: media.averageScore, episodes: media.episodes, ...extra };
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
