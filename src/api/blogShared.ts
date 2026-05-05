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

export interface BlogArticleFaq {
  question: string;
  answer: string;
}

export interface BlogArticleTakeaway {
  label: string;
  value: string;
  detail: string;
}

export interface BlogArticleSection {
  heading: string;
  body: string;
}

export interface BlogArticleContent {
  seoTitle?: string;
  metaDescription?: string;
  headline: string;
  excerpt: string;
  heroCallout: string;
  paragraphs: string[];
  sections: BlogArticleSection[];
  takeaways: BlogArticleTakeaway[];
  faq: BlogArticleFaq[];
}

export type BlogPostData = BlogPostDefinition & {
  updatedAt: string;
  generatedAt?: string;
  articleSource?: 'gemini' | 'fallback';
  articleStatus?: string;
  items: BlogMediaItem[];
  article?: BlogArticleContent;
};

export function getBlogPost(slug: string | undefined) {
  return BLOG_POSTS.find((post) => post.slug === slug);
}
