const ANILIST_URL = 'https://graphql.anilist.co';
const JIKAN_URL = 'https://api.jikan.moe/v4';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const CACHE_TTL_MS = 1000 * 60 * 60 * 7;
const FALLBACK_CACHE_TTL_MS = 1000 * 60 * 15;
const STALE_TTL_MS = 1000 * 60 * 60 * 24;
const FALLBACK_STALE_TTL_MS = 1000 * 60 * 60;
const EDGE_CACHE_HEADER = 'public, s-maxage=25200, stale-while-revalidate=86400';

const memoryCache = new Map<string, { expiresAt: number; staleAt: number; data: BlogPostData }>();

const MEDIA_FIELDS = 'id idMal title { romaji english native } description format status episodes genres averageScore popularity trending season seasonYear coverImage { extraLarge large } studios(isMain: true) { nodes { name } } nextAiringEpisode { episode airingAt }';

const BLOG_POSTS = [
  {
    slug: 'anime-trending-news-today',
    title: 'Anime Trending News Today',
    seoTitle: 'Anime Trending News Today - Current Anime Buzz | StreamNyaa',
    category: 'News',
    description: 'Read one focused anime news article based on current trending anime, real anime headlines, episode activity, and popularity signals.',
    summary: 'One focused anime news-style article based on current anime buzz.',
    intro: 'This article follows one current anime topic at a time, using recent anime activity, headline signals, episode movement, and popularity data to explain why a title is getting attention.',
    angle: 'current anime news',
    readerPromise: 'Use this article for a quick, factual look at one anime topic that is worth paying attention to right now.',
    articleKind: 'gemini',
    sortRank: 100,
  },
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
    articleKind: 'non_ai',
    sortRank: 90,
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
    articleKind: 'non_ai',
    sortRank: 80,
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
    articleKind: 'non_ai',
    sortRank: 70,
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
    articleKind: 'non_ai',
    sortRank: 60,
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
    articleKind: 'non_ai',
    sortRank: 50,
  },
] as const;

type BlogPostDefinition = typeof BLOG_POSTS[number];

interface BlogMediaItem {
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
  news?: BlogNewsItem[];
}

interface BlogNewsItem {
  title: string;
  url?: string;
  date?: string;
  excerpt?: string;
  image?: string;
}

interface BlogTopic {
  type: string;
  title: string;
  animeTitle?: string;
  animeId?: number;
  malId?: number;
  image?: string;
  summary: string;
  confidence: 'headline' | 'trend';
  reason: string;
  evidence: string[];
  headlines?: BlogNewsItem[];
}

interface BlogArticleFaq {
  question: string;
  answer: string;
}

interface BlogArticleTakeaway {
  label: string;
  value: string;
  detail: string;
}

interface BlogArticleSection {
  heading: string;
  body: string;
}

interface BlogArticleContent {
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

type BlogPostData = BlogPostDefinition & {
  updatedAt: string;
  generatedAt?: string;
  articleSource?: 'gemini' | 'fallback';
  articleStatus?: string;
  topic?: BlogTopic;
  items: BlogMediaItem[];
  article?: BlogArticleContent;
};

function getBlogPost(slug: string | undefined) {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

function cleanText(value = '') {
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function mediaTitle(media: any) {
  return media.title?.english || media.title?.romaji || media.title?.native || 'Untitled Anime';
}

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

function onlyRealItems(items: Array<BlogMediaItem | null>) {
  return items.filter((item): item is BlogMediaItem => Boolean(item && item.mal_id && item.title && item.image));
}

function clampText(value: unknown, fallback = '', max = 800) {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, max);
}

function formatStatus(value?: string) {
  return value ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : '';
}

function formatTime(seconds?: number) {
  return seconds ? new Date(seconds * 1000).toISOString() : undefined;
}

function uniqueGenres(items: BlogMediaItem[]) {
  const genres = new Map<string, number>();
  for (const item of items) {
    for (const genre of item.genres.slice(0, 4)) genres.set(genre, (genres.get(genre) || 0) + 1);
  }
  return [...genres.entries()].sort((a, b) => b[1] - a[1]).map(([genre]) => genre).slice(0, 5);
}

function averageScore(items: BlogMediaItem[]) {
  const scores = items.map((item) => item.score).filter((score): score is number => typeof score === 'number' && score > 0);
  if (!scores.length) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

async function aniListRequest(query: string, variables: Record<string, unknown>) {
  const response = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) throw new Error('Anime data request failed');

  const json = await response.json();
  if (json.errors) throw new Error('Anime data returned an error');
  return json.data;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryGemini(status: number) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function fetchMediaList(sort: string, status: string = 'RELEASING') {
  const query = 'query BlogMedia($sort: [MediaSort], $status: MediaStatus) { Page(page: 1, perPage: 12) { media(type: ANIME, sort: $sort, status: $status, isAdult: false) { ' + MEDIA_FIELDS + ' } } }';
  const data = await aniListRequest(query, { sort: [sort], status });
  return onlyRealItems((data.Page.media || []).map((media: any) => mapMedia(media)));
}

function mapNewsItem(item: any): BlogNewsItem | null {
  const title = cleanText(item?.title || '');
  if (!title) return null;
  return {
    title,
    url: item?.url,
    date: item?.date,
    excerpt: cleanText(item?.excerpt || '').slice(0, 260),
    image: item?.images?.jpg?.image_url || '',
  };
}

async function fetchAnimeNews(malId: number) {
  try {
    const response = await fetch(`${JIKAN_URL}/anime/${malId}/news`, {
      headers: { Accept: 'application/json', 'User-Agent': 'StreamNyaa/1.0' },
    });
    if (!response.ok) return [];
    const json = await response.json();
    return (json.data || []).map(mapNewsItem).filter(Boolean).slice(0, 3) as BlogNewsItem[];
  } catch {
    return [];
  }
}

function classifyHeadline(news: BlogNewsItem) {
  const text = `${news.title} ${news.excerpt || ''}`.toLowerCase();
  if (/delay|delayed|postpone|postponed|hiatus|halt|suspend|production|broadcast/.test(text)) return 'delayed-or-paused-airing';
  if (/episode|viral|record|ranking|tops|trend|buzz|reaction/.test(text)) return 'viral-episode-or-ranking';
  if (/season|sequel|trailer|visual|cast|staff|premiere|release/.test(text)) return 'new-season-trailer-cast-update';
  return 'anime-headline';
}

function isGenericReleaseDigest(news: BlogNewsItem) {
  const text = `${news.title} ${news.excerpt || ''}`.toLowerCase();
  return /north american anime|anime & manga releases|anime and manga releases|manga releases|light novel releases|home video releases|blu-ray|dvd|release calendar|week \d|releases for (january|february|march|april|may|june|july|august|september|october|november|december)/.test(text);
}

function headlineMatchesAnime(news: BlogNewsItem, animeTitle: string) {
  const text = `${news.title} ${news.excerpt || ''}`.toLowerCase();
  const normalizedTitle = animeTitle.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalizedTitle) return false;
  if (text.includes(normalizedTitle)) return true;

  const titleWords = normalizedTitle.split(' ').filter((word) => word.length > 2 && !['the', 'season', 'part'].includes(word));
  if (!titleWords.length) return false;
  const matches = titleWords.filter((word) => text.includes(word)).length;
  return matches >= Math.min(2, titleWords.length);
}

function headlineScore(news: BlogNewsItem) {
  const text = `${news.title} ${news.excerpt || ''}`.toLowerCase();
  let score = 1;
  if (isGenericReleaseDigest(news)) score -= 10;
  if (/delay|delayed|postpone|postponed|hiatus|halt|suspend|production|broadcast/.test(text)) score += 8;
  if (/episode|viral|record|ranking|tops|trend|buzz|reaction/.test(text)) score += 5;
  if (/season|sequel|trailer|visual|cast|staff|premiere|release/.test(text)) score += 4;
  if (/opening|ending|theme|movie|film/.test(text)) score += 2;
  if (news.date) score += 1;
  return score;
}

function selectNewsTopic(items: BlogMediaItem[]): BlogTopic {
  const sorted = [...items].sort((a, b) => ((b.trending || 0) + (b.popularity || 0) / 100) - ((a.trending || 0) + (a.popularity || 0) / 100));
  const top = sorted[0];
  const candidates: Array<BlogTopic & { priority: number }> = [];

  for (const item of items) {
    for (const news of item.news || []) {
      if (isGenericReleaseDigest(news) || !headlineMatchesAnime(news, item.title)) continue;
      const type = classifyHeadline(news);
      const priority = headlineScore(news) + Math.floor((item.trending || 0) / 750) + Math.floor((item.popularity || 0) / 100000);
      candidates.push({
        type,
        title: news.title,
        animeTitle: item.title,
        animeId: item.id,
        malId: item.mal_id,
        image: item.image,
        summary: news.excerpt || `${item.title} has a current anime headline worth following.`,
        confidence: 'headline',
        reason: type === 'delayed-or-paused-airing'
          ? 'A real headline points to an airing, broadcast, delay, or production-related update.'
          : type === 'viral-episode-or-ranking'
            ? 'A real headline points to episode buzz, ranking movement, reactions, or trend activity.'
            : type === 'new-season-trailer-cast-update'
              ? 'A real headline points to a season, trailer, cast, staff, premiere, or release update.'
              : 'A real headline is available for a currently relevant anime.',
        evidence: [
          `Headline: ${news.title}`,
          item.trending ? `Current trend score: ${item.trending}` : '',
          item.popularity ? `Popularity: ${item.popularity}` : '',
        ].filter(Boolean),
        headlines: [news, ...(item.news || []).filter((other) => other.title !== news.title).slice(0, 2)],
        priority,
      });
    }
  }

  const weakButPopular = sorted.find((item) => (item.popularity || 0) > 80000 && (item.score || 100) < 72);
  if (weakButPopular) {
    candidates.push({
      type: 'popular-anime-with-mixed-reception',
      title: `${weakButPopular.title} is popular, but its score suggests mixed reception`,
      animeTitle: weakButPopular.title,
      animeId: weakButPopular.id,
      malId: weakButPopular.mal_id,
      image: weakButPopular.image,
      summary: `${weakButPopular.title} has strong popularity with a weaker score signal, making it a useful topic for why a widely watched anime may be dividing viewers.`,
      confidence: 'trend',
      reason: 'The title has high popularity but a lower average score than strong consensus picks.',
      evidence: [
        `Popularity: ${weakButPopular.popularity || 'available'}`,
        weakButPopular.score ? `Score signal: ${weakButPopular.score}/100` : '',
        weakButPopular.trending ? `Current trend score: ${weakButPopular.trending}` : '',
      ].filter(Boolean),
      priority: 8 + Math.floor((weakButPopular.popularity || 0) / 100000),
    });
  }

  if (top) {
    const doingWell = (top.score || 0) >= 80 && (top.trending || 0) > 0;
    candidates.push({
      type: doingWell ? 'why-this-anime-is-doing-well' : 'anime-trending-up-now',
      title: doingWell ? `Why ${top.title} is doing well right now` : `${top.title} is leading current anime trend signals`,
      animeTitle: top.title,
      animeId: top.id,
      malId: top.mal_id,
      image: top.image,
      summary: doingWell
        ? `${top.title} combines strong current trend placement with a healthy score signal, making it a good topic for why the anime is connecting right now.`
        : `${top.title} is currently strong in the trend data, with genre, score, studio, and episode context available for a focused update.`,
      confidence: 'trend',
      reason: doingWell
        ? 'The title has both strong trend placement and a strong score signal.'
        : 'The title is the strongest current trend signal available in the latest anime data.',
      evidence: [
        top.trending ? `Current trend score: ${top.trending}` : '',
        top.score ? `Score signal: ${top.score}/100` : '',
        top.popularity ? `Popularity: ${top.popularity}` : '',
        top.nextEpisode ? `Next episode listed: ${top.nextEpisode}` : '',
      ].filter(Boolean),
      priority: doingWell ? 7 : 6,
    });
  }

  candidates.sort((a, b) => b.priority - a.priority);
  if (!candidates.length) {
    return {
      type: 'current-anime-topic',
      title: 'Current anime trend signals are being checked',
      summary: 'Current anime trend data is available, but no single stronger topic could be selected yet.',
      confidence: 'trend',
      reason: 'No verified headline or strong trend outlier was available.',
      evidence: [],
    };
  }
  const { priority: _priority, ...topic } = candidates[0];
  return topic;
}

async function fetchTrendingNewsItems(preview = false) {
  const items = await fetchMediaList('TRENDING_DESC', 'RELEASING');
  if (preview) return { items, topic: selectNewsTopic(items) };

  const enriched: BlogMediaItem[] = [];
  for (const item of items.slice(0, 8)) {
    const news = item.mal_id ? await fetchAnimeNews(item.mal_id) : [];
    enriched.push({ ...item, news });
    await sleep(350);
  }

  return { items: [...enriched, ...items.slice(enriched.length)], topic: selectNewsTopic([...enriched, ...items.slice(enriched.length)]) };
}

async function fetchTodaysSchedule() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const query = 'query BlogToday($start: Int, $end: Int) { Page(page: 1, perPage: 24) { airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) { episode airingAt media { ' + MEDIA_FIELDS + ' isAdult } } } }';
  const data = await aniListRequest(query, { start: Math.floor(start.getTime() / 1000), end: Math.floor(end.getTime() / 1000) });
  const seen = new Set<number>();

  return onlyRealItems((data.Page.airingSchedules || [])
    .filter((schedule: any) => !schedule.media?.isAdult)
    .filter((schedule: any) => {
      const id = schedule.media.idMal || schedule.media.id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, 12)
    .map((schedule: any) => mapMedia(schedule.media, { episode: schedule.episode, airingAt: schedule.airingAt })));
}

async function fetchRecentEpisodes() {
  const query = 'query BlogRecent($now: Int) { Page(page: 1, perPage: 24) { airingSchedules(airingAt_lesser: $now, sort: TIME_DESC) { episode airingAt media { ' + MEDIA_FIELDS + ' isAdult } } } }';
  const data = await aniListRequest(query, { now: Math.floor(Date.now() / 1000) });
  const seen = new Set<number>();

  return onlyRealItems((data.Page.airingSchedules || [])
    .filter((schedule: any) => !schedule.media?.isAdult)
    .filter((schedule: any) => {
      const id = schedule.media.idMal || schedule.media.id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, 12)
    .map((schedule: any) => mapMedia(schedule.media, { episode: schedule.episode, airingAt: schedule.airingAt })));
}

function fallbackArticle(definition: BlogPostDefinition, items: BlogMediaItem[], topic?: BlogTopic): BlogArticleContent {
  const top = items[0];
  const genres = uniqueGenres(items);
  const score = averageScore(items);
  const topStudio = top?.studios?.[0];
  if (topic) {
    const focus = items.find((item) => item.title === topic.animeTitle) || top;
    const focusTitle = topic.animeTitle || focus?.title || 'This anime';
    const focusGenres = focus?.genres?.slice(0, 3).join(', ');
    const focusStudio = focus?.studios?.[0];
    const focusScore = focus?.score ? `${focus.score}/100` : null;
    const focusTrend = focus?.trending ? `trend score of ${focus.trending}` : null;
    const focusPopularity = focus?.popularity ? `${focus.popularity.toLocaleString()} popularity` : null;
    const headlineLine = topic.confidence === 'headline'
      ? `The latest headline around ${focusTitle} gives the article a clear news hook: ${topic.title}.`
      : `${focusTitle} stands out because its current trend, score, popularity, and episode signals are stronger than the surrounding titles.`;
    const contextLine = [
      focusScore ? `a ${focusScore} score signal` : '',
      focusTrend,
      focusPopularity,
      focusGenres ? `${focusGenres} genre tags` : '',
      focusStudio ? `${focusStudio} involvement` : '',
    ].filter(Boolean).join(', ');

    return {
      seoTitle: `${topic.animeTitle || 'Anime'} News Update | StreamNyaa`.slice(0, 70),
      metaDescription: topic.summary.slice(0, 155),
      headline: topic.title,
      excerpt: topic.summary,
      heroCallout: topic.summary,
      paragraphs: [
        `${focusTitle} is the focus of this update because it has the clearest signal among the current anime being tracked. ${headlineLine}`,
        contextLine
          ? `The useful part is the context around the title: ${contextLine}. Those signals help separate normal seasonal noise from a title that is actually worth checking more closely.`
          : `${focusTitle} has enough current activity to deserve a closer look, especially for viewers comparing active seasonal titles.`,
        topic.type === 'popular-anime-with-mixed-reception'
          ? `The main tension is simple: popularity does not always mean strong reception. When a widely followed anime carries a weaker score signal, it can mean the premise is pulling viewers in while the execution is creating mixed reactions.`
          : topic.type === 'why-this-anime-is-doing-well'
            ? `The reason ${focusTitle} is doing well appears to be a mix of visibility and audience response. A strong score signal matters because it suggests people are not just noticing the anime; they are responding positively after watching.`
            : `For readers, the best takeaway is to judge the headline alongside the anime's score, genre fit, studio context, and episode status. That gives a more useful picture than treating one headline as the whole story.`,
        `If you are deciding whether ${focusTitle} belongs on your watchlist, start with the genre fit and current reception, then use the StreamNyaa title page to compare the latest details before jumping in.`,
      ],
      sections: [
        {
          heading: `Why ${focusTitle} stands out`,
          body: `${topic.summary} ${contextLine ? `The strongest public signals around the title are ${contextLine}.` : 'The title has enough current activity to stand apart from the surrounding seasonal list.'} This makes it a better topic than a broad release roundup because the article can stay focused on one anime and one clear angle.`,
        },
        {
          heading: 'What to look at next',
          body: `A good next step is to compare the title's score, genre tags, episode movement, and studio information. ${focus?.nextEpisode ? `The listed next episode is episode ${focus.nextEpisode}, which gives viewers a practical reason to keep the title on their radar.` : 'If episode timing is not listed, the safer read is to treat this as a current-interest snapshot rather than a confirmed release update.'}`,
        },
      ],
      takeaways: [
        { label: 'Story angle', value: topic.type.replace(/-/g, ' '), detail: topic.confidence === 'headline' ? 'Built around a title-specific headline' : 'Built around current trend signals' },
        { label: 'Main anime', value: focusTitle, detail: focusGenres ? `Genre context: ${focusGenres}` : 'Primary title in this update' },
        focusScore ? { label: 'Reception signal', value: focusScore, detail: 'Useful for judging audience response' } : null,
        focusTrend ? { label: 'Trend signal', value: focusTrend.replace('trend score of ', ''), detail: 'Current momentum indicator' } : null,
      ].filter((item): item is BlogArticleTakeaway => Boolean(item)).slice(0, 4),
      faq: [
        { question: `Why is ${focusTitle} being discussed here?`, answer: topic.summary },
        { question: `Is ${focusTitle} worth watching right now?`, answer: focusScore ? `The ${focusScore} score signal is a useful starting point, but genre fit and episode status matter too.` : 'It is worth checking if the genre, premise, and current episode status match what you want to follow.' },
        { question: 'What should I compare before choosing it?', answer: 'Compare score, genres, studio context, popularity, trend movement, and the title page details before deciding.' },
      ],
    };
  }

  const topTitle = top?.title || 'the first title';
  const topGenre = top?.genres?.[0];
  const secondTitle = items[1]?.title;
  const thirdTitle = items[2]?.title;
  const genreLine = genres.length ? genres.slice(0, 3).join(', ') : 'several different genres';
  const scoreLine = score ? ` The scored titles average around ${score}/100, which is useful context but not the whole story.` : '';
  const leadLine = top ? `${topTitle}${topStudio ? ` from ${topStudio}` : ''}` : 'the lead title';

  const guideCopy: Record<string, Pick<BlogArticleContent, 'headline' | 'excerpt' | 'heroCallout' | 'paragraphs' | 'sections' | 'takeaways' | 'faq'>> = {
    'trending-anime-this-week': {
      headline: 'Trending Anime This Week',
      excerpt: `The weekly trend list is best read as a mood check: which shows people are actually talking about, returning to, and comparing right now.`,
      heroCallout: `${topTitle} is setting the pace this week, but the interesting part is how the rest of the list fills in around it.`,
      paragraphs: top ? [
        `Trending lists can get noisy, so the useful move is to look past the rank number and ask why a title is moving. This week starts with ${leadLine}, a title that gives the page its strongest current signal.`,
        secondTitle ? `${secondTitle}${thirdTitle ? ` and ${thirdTitle}` : ''} make the list feel less one-note. They give you a way to compare hype against genre, score, studio, and episode timing instead of simply following the biggest name.` : `The rest of the list is useful because it shows what else is moving in the same window, not just which title is sitting at the top.`,
        `The genre mix leans toward ${genreLine}. That matters because a trending romance, action title, comedy, or fantasy show can be trending for completely different reasons.${scoreLine}`,
        `Use this page like a quick conversation starter. Open the top titles, compare their tone, and pick the one that actually fits the kind of episode you want tonight.`,
      ] : [definition.intro, definition.readerPromise],
      sections: [
        { heading: 'Read the momentum, not just the rank', body: `A high placement tells you something is moving, but it does not explain whether the anime is strong, divisive, funny, dramatic, or simply being carried by a new episode. That is why the supporting details matter: score, genres, studio, status, and episode timing give the ranking some texture.` },
        { heading: 'How to choose from the list', body: `Start with the first few titles, then narrow by mood. If you want something safer, look for a stronger score signal. If you want to follow the conversation, check the titles with fresh episode movement. If you want a surprise, use the genre tags rather than the rank order.` },
      ],
      takeaways: [
        top ? { label: 'Current pace-setter', value: topTitle, detail: top.score ? `Score signal: ${top.score}/100` : 'Leading the current trend list' } : null,
        { label: 'Best use', value: 'Finding momentum', detail: 'Good when you want anime people are actively following' },
        genres.length ? { label: 'Mood range', value: genreLine, detail: 'Use genres to avoid picking only by rank' } : null,
      ].filter((item): item is BlogArticleTakeaway => Boolean(item)),
      faq: [
        { question: 'Is the top trending anime always the best anime?', answer: 'Not always. Trending means attention and momentum; score, genre, and episode quality still matter.' },
        { question: 'How should I pick from this page?', answer: 'Start with the top three, then choose based on the genre and tone you actually want to watch.' },
        { question: 'Why do lower-ranked titles still matter?', answer: 'A lower-ranked title can be a better personal fit if its genre, studio, or score signal matches your taste.' },
      ],
    },
    'popular-anime-right-now': {
      headline: 'Popular Anime Right Now',
      excerpt: `Popularity is useful because it shows where the crowd is gathering, but the best picks are the ones whose reception and genre fit match your taste.`,
      heroCallout: `${topTitle} is the big crowd signal here, which makes it the first title worth comparing against the rest.`,
      paragraphs: top ? [
        `Popular anime pages are good for finding safe starting points. ${leadLine} sits at the front here, which means it has enough audience pull to be worth a closer look.`,
        `The trick is not to treat popularity as a guarantee. A widely followed anime can be excellent, messy, comforting, overhyped, or just easy to recommend. That is why the score and genre context are doing real work on this page.`,
        `This group currently leans into ${genreLine}.${scoreLine} If those genres are already your lane, the list becomes much more useful than a plain popularity chart.`,
        `Use this article when you want anime with a larger audience behind it, then let the details help you avoid picking something only because everyone else clicked it first.`,
      ] : [definition.intro, definition.readerPromise],
      sections: [
        { heading: 'Why popular picks are useful', body: `A popular anime usually has enough conversation, clips, recommendations, or seasonal visibility to make it easy to follow. That makes these titles good starting points when you do not want to gamble on something obscure, but still want enough context to choose carefully.` },
        { heading: 'Where popularity can mislead you', body: `Popularity can hide mixed reception. A title may have a huge audience because of its source material, a famous studio, a recognizable premise, or a strong first episode. Before choosing, compare the score, genres, episode count, and status so the pick feels intentional.` },
      ],
      takeaways: [
        top ? { label: 'Crowd leader', value: topTitle, detail: top.popularity ? `${top.popularity.toLocaleString()} popularity` : 'Strong viewer interest' } : null,
        { label: 'Best use', value: 'Safe discovery', detail: 'Good for finding titles with broad awareness' },
        score ? { label: 'Reception check', value: `${score}/100 avg`, detail: 'Helps balance popularity against response' } : null,
      ].filter((item): item is BlogArticleTakeaway => Boolean(item)),
      faq: [
        { question: 'Does popular mean good?', answer: 'No. Popular means a lot of people are paying attention; the score and genre fit help you decide if it is good for you.' },
        { question: 'Who should use this article?', answer: 'Use it when you want anime that already has audience momentum and enough context to compare quickly.' },
        { question: 'What should I check first?', answer: 'Check the genre, score, status, and episode count before opening the title page.' },
      ],
    },
    'upcoming-anime-this-season': {
      headline: 'Upcoming Anime This Season',
      excerpt: `Upcoming anime are fun because the best picks are not always obvious yet. This guide helps you spot what deserves a place on your watchlist early.`,
      heroCallout: `${topTitle} is the first upcoming title to keep an eye on from this batch.`,
      paragraphs: top ? [
        `The best time to notice a new anime is often before the season gets crowded. ${leadLine} leads this preview, giving you a practical first title to check before release-week noise takes over.`,
        `Upcoming lists work differently from trending lists. There may not be a score yet, so the safer clues are format, genre, studio, source familiarity, and whether the premise sounds like something that can actually hold a season.`,
        `The current mix leans toward ${genreLine}. That gives the preview some personality: you can build a watchlist by mood instead of saving every title and sorting it out later.`,
        `Use this page as an early filter. Pick a few titles that sound genuinely interesting, then come back once episodes begin and the reception signal becomes clearer.`,
      ] : [definition.intro, definition.readerPromise],
      sections: [
        { heading: 'What makes an upcoming title worth saving', body: `A good upcoming pick usually has at least one strong hook: a genre you already like, a studio you trust, a sequel connection, a sharp premise, or enough early attention to suggest people will discuss it once it airs.` },
        { heading: 'How to avoid watchlist clutter', body: `Do not add everything. Start with the title that sounds most like your taste, then add one familiar pick and one wildcard. That keeps your watchlist useful when the season starts moving quickly.` },
      ],
      takeaways: [
        top ? { label: 'First watchlist pick', value: topTitle, detail: topGenre ? `Starts in ${topGenre}` : 'Lead upcoming title' } : null,
        { label: 'Best use', value: 'Early planning', detail: 'Good for building a cleaner seasonal watchlist' },
        genres.length ? { label: 'Genre direction', value: genreLine, detail: 'Helpful before scores are available' } : null,
      ].filter((item): item is BlogArticleTakeaway => Boolean(item)),
      faq: [
        { question: 'Should I add every upcoming anime?', answer: 'No. Pick a few strong fits so your watchlist stays useful once the season starts.' },
        { question: 'What matters before an anime airs?', answer: 'Genre, studio, format, premise, and sequel status matter more than score before episodes are available.' },
        { question: 'When should I check back?', answer: 'Check again after early episodes begin, because reception becomes much clearer once viewers have actually watched it.' },
      ],
    },
    'todays-anime-release-schedule': {
      headline: "Today's Anime Release Schedule",
      excerpt: `A daily schedule should help you decide what to check first, not bury you in times. Start with the episode that best matches your mood.`,
      heroCallout: top?.episode ? `${topTitle} episode ${top.episode} is one of today's useful starting points.` : `${topTitle} is one of today's useful starting points.`,
      paragraphs: top ? [
        `A release schedule is most useful when it feels like a shortlist, not a wall of dates. ${top.episode ? `${topTitle} episode ${top.episode}` : topTitle} gives today's page a clear first stop.`,
        `From there, compare what else is airing by mood. Some days are better for continuing a weekly favorite; other days are better for trying one episode of something new before the backlog grows again.`,
        `Today's mix leans toward ${genreLine}.${scoreLine} That gives you a quick way to choose between comfort, action, comedy, drama, or a title you have been meaning to test.`,
        `Use this page as a light daily check-in: scan the episode numbers, open the titles that matter, and leave the rest for later without feeling like you missed the whole day.`,
      ] : [definition.intro, definition.readerPromise],
      sections: [
        { heading: 'How to read today quickly', body: `Start with shows you are already following, then look for episode numbers that suggest a good checkpoint. Early episodes are good for sampling, middle episodes show whether the story has settled, and later episodes can tell you whether the season is worth catching up on.` },
        { heading: 'What to open first', body: `Open the title that best matches your current mood, not just the first item on the schedule. A strong score, a familiar studio, or a genre you enjoy is usually a better guide than time order alone.` },
      ],
      takeaways: [
        top ? { label: 'First check', value: top.episode ? `${topTitle} ep ${top.episode}` : topTitle, detail: 'Useful starting point for today' } : null,
        { label: 'Best use', value: 'Daily triage', detail: 'Good for deciding what deserves attention now' },
        genres.length ? { label: 'Today leans', value: genreLine, detail: 'Use mood to narrow the schedule' } : null,
      ].filter((item): item is BlogArticleTakeaway => Boolean(item)),
      faq: [
        { question: 'How should I use the daily schedule?', answer: 'Check continuing shows first, then sample one new title if the genre or score looks interesting.' },
        { question: 'Are all times exact?', answer: 'Schedule data can shift, so treat it as a helpful guide and refresh the title page if timing matters.' },
        { question: 'What if I am behind?', answer: 'Look for the title you already care about, then use episode numbers to decide whether to catch up now or later.' },
      ],
    },
    'recent-anime-episode-updates': {
      headline: 'Recent Anime Episode Updates',
      excerpt: `Recent episode updates are best for catching momentum after it happens: what moved forward, what is worth resuming, and what can wait.`,
      heroCallout: top?.episode ? `${topTitle} episode ${top.episode} is the first recent update to check.` : `${topTitle} is the first recent update to check.`,
      paragraphs: top ? [
        `Recent updates are useful when you do not want to dig through every seasonal page. ${top.episode ? `${topTitle} episode ${top.episode}` : topTitle} leads this batch and gives you a clean place to start.`,
        `This kind of page is less about hype and more about momentum. A show that just moved forward may be worth resuming, especially if the score, genre, or studio already made it a maybe for your list.`,
        `The update mix leans toward ${genreLine}.${scoreLine} That helps you decide whether to continue something familiar or open a title you ignored earlier in the season.`,
        `Use it like a catch-up board. Pick one title to continue, one to investigate, and let the rest wait until the next time you are actually looking for something to watch.`,
      ] : [definition.intro, definition.readerPromise],
      sections: [
        { heading: 'Why recent updates matter', body: `A fresh episode can change how a title feels. Slow shows can finally click, popular shows can wobble, and smaller titles can become easier to recommend once there is more than a premiere to judge.` },
        { heading: 'How to catch up without overthinking it', body: `Start with titles you already sampled. If one has a good score signal or a genre you like, open it first. If not, scan the descriptions and save only the titles that actually sound worth your time.` },
      ],
      takeaways: [
        top ? { label: 'Freshest lead', value: top.episode ? `${topTitle} ep ${top.episode}` : topTitle, detail: 'First recent update in this batch' } : null,
        { label: 'Best use', value: 'Catching up', detail: 'Good for deciding what to resume' },
        score ? { label: 'Quality check', value: `${score}/100 avg`, detail: 'Useful when choosing between updates' } : null,
      ].filter((item): item is BlogArticleTakeaway => Boolean(item)),
      faq: [
        { question: 'What is this page best for?', answer: 'Use it when you want to see which anime recently moved forward and decide what to resume.' },
        { question: 'Should I follow every recent update?', answer: 'No. Use score, genre, and your own interest to pick only the titles worth your time.' },
        { question: 'Why are episode numbers useful?', answer: 'They show whether a title is early enough to sample, far enough to judge, or close enough to catch up on.' },
      ],
    },
  };

  const article = guideCopy[definition.slug] || guideCopy['trending-anime-this-week'];

  return {
    seoTitle: definition.seoTitle,
    metaDescription: definition.description,
    headline: article.headline,
    excerpt: article.excerpt,
    heroCallout: article.heroCallout,
    paragraphs: article.paragraphs,
    sections: article.sections,
    takeaways: article.takeaways,
    faq: article.faq,
  };
}

function buildGeminiPrompt(definition: BlogPostDefinition, items: BlogMediaItem[], topic?: BlogTopic) {
  const focusItem = topic
    ? items.find((item) => item.mal_id === topic.malId || item.id === topic.animeId || item.title === topic.animeTitle)
    : null;
  const sourceItems = focusItem ? [focusItem] : items.slice(0, 10);
  const facts = sourceItems.map((item, index) => ({
    rank: index + 1,
    title: item.title,
    score: item.score,
    format: item.format,
    status: formatStatus(item.status),
    episodes: item.episodes,
    currentEpisode: item.episode,
    nextEpisode: item.nextEpisode,
    airingAtIso: formatTime(item.airingAt || item.nextAiringAt),
    genres: item.genres.slice(0, 5),
    studios: item.studios,
    season: [formatStatus(item.season), item.seasonYear].filter(Boolean).join(' '),
    popularity: item.popularity,
    trending: item.trending,
    description: item.description,
    newsHeadlines: item.news?.slice(0, 3).map((news) => ({ title: news.title, date: news.date, excerpt: news.excerpt })),
  }));
  const relatedContext = topic
    ? items
      .filter((item) => item.mal_id !== topic.malId && item.id !== topic.animeId)
      .slice(0, 5)
      .map((item) => ({ title: item.title, score: item.score, trending: item.trending, popularity: item.popularity, genres: item.genres.slice(0, 3) }))
    : [];

  return `Write a factual, human-sounding anime blog article for StreamNyaa.

Article topic:
${JSON.stringify({
    title: definition.title,
    category: definition.category,
    description: definition.description,
    articleAngle: definition.angle,
    readerGoal: definition.readerPromise,
    selectedTopic: topic || null,
  }, null, 2)}

Selected anime facts you may use:
${JSON.stringify(facts, null, 2)}

Other current anime context, for light comparison only:
${JSON.stringify(relatedContext, null, 2)}

Rules:
- Use only the facts above. Do not invent announcements, staff, release dates, platform availability, awards, trailers, rumors, or production details.
- Write about exactly one strongest topic: selectedTopic. Do not turn the article into a general list of many anime.
- The article must be about selectedTopic.animeTitle and selectedTopic.title. Do not switch to another anime, even if another anime appears in the facts list.
- Use the selected anime facts as the main body source. Other current anime context may be used only for one short comparison sentence, not as the subject.
- Set "headline" exactly to selectedTopic.title. Do not rewrite it, shorten it, translate it, or make a different headline.
- The heroCallout, excerpt, paragraphs, sections, takeaways, and FAQ must clearly match selectedTopic.animeTitle.
- Make this article clearly different from StreamNyaa's guide blogs: it should read like a focused current news/editorial story, not a schedule guide, ranking page, or generic recommendation list.
- Ignore broad industry release roundups if they are not directly about the selected anime. Do not write an article from generic headlines like North American releases, DVD/Blu-ray lists, manga release calendars, or weekly retail roundups.
- If selectedTopic.confidence is "headline", write one focused news article about that selected topic and explain only what the headline/facts support.
- If selectedTopic.confidence is "trend", write one focused trend-analysis article and do not present it as confirmed news.
- Match the selected topic type:
  - delayed-or-paused-airing: explain the verified airing/update context without adding unlisted causes.
  - new-season-trailer-cast-update: explain the announcement or preview angle only if the headline supports it.
  - viral-episode-or-ranking: explain the episode/ranking/buzz angle only if the headline supports it.
  - popular-anime-with-mixed-reception: explain the gap between popularity and weaker score/reception signals.
  - anime-trending-up-now or why-this-anime-is-doing-well: explain current momentum, score, genre, studio, and episode context.
- Only mention delays, halted airing, production issues, viral episodes, trailers, sequels, or announcements when the selected topic or newsHeadlines explicitly support that claim.
- Do not mention APIs, AI, automation, AniList, Jikan, sources, scraping, or generated content.
- Keep it natural and editorial.
- Never write meta-process phrases like "this topic was picked", "selected topic", "strongest visible signals", "available facts", or "current topic is tied to".
- Avoid piracy language and avoid telling users where to watch copyrighted content.
- Make the writing useful for Google search: clear headings, direct wording, helpful context, and natural keywords around the selected anime/topic.
- Keep every sentence fact-safe. If a fact is missing, skip it.
- The headline, excerpt, heroCallout, paragraphs, sections, takeaways, and FAQ must all stay on the same selected topic.
- Return JSON only. No markdown, no code fences.
- Keep the full JSON concise enough to complete in one response.

JSON shape:
{
  "seoTitle": "max 70 chars, include StreamNyaa",
  "metaDescription": "max 155 chars",
  "headline": "exactly selectedTopic.title",
  "excerpt": "2 sentence summary",
  "heroCallout": "one sentence focused on the top anime",
  "paragraphs": ["exactly 4 useful paragraphs, 45-75 words each"],
  "sections": [{"heading": "short heading", "body": "80-120 words"}],
  "takeaways": [{"label": "short label", "value": "short value", "detail": "short detail"}],
  "faq": [{"question": "question", "answer": "answer"}]
}

Use exactly 2 sections, exactly 4 takeaways, and exactly 3 FAQ items.`;
}

function extractGeminiText(json: any) {
  const candidate = json?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts.map((part: any) => {
    if (typeof part.text === 'string') return part.text;
    if (part.functionCall) return JSON.stringify(part.functionCall);
    if (part.inlineData?.data) return part.inlineData.data;
    return '';
  }).join('\n').trim();

  if (text) return text;
  if (typeof candidate?.content?.text === 'string') return candidate.content.text;
  if (typeof json?.text === 'string') return json.text;
  return '';
}

function parseGeminiJson(text: string) {
  if (!text) return null;
  const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

function statusSafe(value: unknown) {
  return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'unknown';
}

function normalizeArray<T>(value: unknown, mapper: (item: any) => T | null, limit: number) {
  if (!Array.isArray(value)) return [];
  return value.map(mapper).filter((item): item is T => Boolean(item)).slice(0, limit);
}

function normalizedContentWords(value = '') {
  return value.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 2 && !['the', 'and', 'for', 'with', 'anime', 'season', 'part'].includes(word));
}

function articleMentionsTopic(article: BlogArticleContent, topic?: BlogTopic) {
  if (!topic?.animeTitle) return true;
  const articleText = [
    article.headline,
    article.excerpt,
    article.heroCallout,
    ...article.paragraphs,
    ...article.sections.flatMap((section) => [section.heading, section.body]),
    ...article.takeaways.flatMap((item) => [item.value, item.detail]),
  ].join(' ').toLowerCase();
  const animeTitle = topic.animeTitle.toLowerCase();
  if (articleText.includes(animeTitle)) return true;

  const words = normalizedContentWords(topic.animeTitle);
  if (!words.length) return true;
  const matches = words.filter((word) => articleText.includes(word)).length;
  return matches >= Math.min(2, words.length);
}

function alignArticleToTopic(article: BlogArticleContent, fallback: BlogArticleContent, topic?: BlogTopic) {
  if (!topic) return article;
  const aligned = articleMentionsTopic(article, topic) ? article : fallback;
  const seoBase = `${topic.animeTitle || 'Anime'} News Update | StreamNyaa`;
  return {
    ...aligned,
    seoTitle: clampText(aligned.seoTitle || seoBase, seoBase, 70),
    metaDescription: clampText(aligned.metaDescription, topic.summary || fallback.metaDescription, 155),
    headline: clampText(topic.title, fallback.headline, 140),
    heroCallout: articleMentionsTopic(aligned, topic) ? aligned.heroCallout : fallback.heroCallout,
  };
}

function sanitizeArticle(raw: any, fallback: BlogArticleContent): BlogArticleContent {
  const paragraphs = normalizeArray(raw?.paragraphs, (item) => clampText(item, '', 900) || null, 6);
  const sections = normalizeArray<BlogArticleSection>(raw?.sections, (item) => {
    const heading = clampText(item?.heading, '', 90);
    const body = clampText(item?.body, '', 1200);
    return heading && body ? { heading, body } : null;
  }, 4);
  const takeaways = normalizeArray<BlogArticleTakeaway>(raw?.takeaways, (item) => {
    const label = clampText(item?.label, '', 50);
    const value = clampText(item?.value, '', 80);
    const detail = clampText(item?.detail, '', 140);
    return label && value && detail ? { label, value, detail } : null;
  }, 4);
  const faq = normalizeArray<BlogArticleFaq>(raw?.faq, (item) => {
    const question = clampText(item?.question, '', 120);
    const answer = clampText(item?.answer, '', 260);
    return question && answer ? { question, answer } : null;
  }, 4);

  return {
    seoTitle: clampText(raw?.seoTitle, fallback.seoTitle, 70),
    metaDescription: clampText(raw?.metaDescription, fallback.metaDescription, 155),
    headline: clampText(raw?.headline, fallback.headline, 110),
    excerpt: clampText(raw?.excerpt, fallback.excerpt, 320),
    heroCallout: clampText(raw?.heroCallout, fallback.heroCallout, 220),
    paragraphs: paragraphs.length >= 2 ? paragraphs : fallback.paragraphs,
    sections: sections.length ? sections : fallback.sections,
    takeaways: takeaways.length ? takeaways : fallback.takeaways,
    faq: faq.length ? faq : fallback.faq,
  };
}

async function generateArticle(definition: BlogPostDefinition, items: BlogMediaItem[], topic?: BlogTopic) {
  const fallback = fallbackArticle(definition, items, topic);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { article: fallback, source: 'fallback' as const, status: 'missing_gemini_key' };
  if (!items.length) return { article: fallback, source: 'fallback' as const, status: 'no_anime_items' };

  try {
    let lastStatus = 0;
    let lastErrorText = '';

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) await sleep(700 * attempt);

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildGeminiPrompt(definition, items, topic) }] }],
          generationConfig: {
            temperature: 0.65,
            topP: 0.9,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        lastStatus = response.status;
        lastErrorText = await response.text();
        if (attempt < 2 && shouldRetryGemini(response.status)) continue;
        console.error('Gemini article request failed', response.status, lastErrorText.slice(0, 500));
        return { article: fallback, source: 'fallback' as const, status: 'gemini_request_failed_' + response.status };
      }

      const json = await response.json();
      const geminiText = extractGeminiText(json);
      const rawArticle = parseGeminiJson(geminiText);
      if (!rawArticle) {
        const finishReason = json?.candidates?.[0]?.finishReason || 'unknown';
        const textState = geminiText ? 'non_json_text' : 'empty_text';
        console.error('Gemini JSON parse failed', JSON.stringify({
          finishReason,
          partKeys: json?.candidates?.[0]?.content?.parts?.map((part: any) => Object.keys(part)),
          textSample: geminiText.slice(0, 500),
        }));
        return { article: fallback, source: 'fallback' as const, status: 'gemini_json_parse_failed_' + statusSafe(finishReason) + '_' + textState };
      }

      const article = alignArticleToTopic(sanitizeArticle(rawArticle, fallback), fallback, topic);
      return { article, source: 'gemini' as const, status: article === fallback ? 'topic_mismatch_fallback' : 'ok' };
    }

    return { article: fallback, source: 'fallback' as const, status: 'gemini_request_failed_' + lastStatus };
  } catch (error) {
    console.error(error);
    return { article: fallback, source: 'fallback' as const, status: 'gemini_exception_' + statusSafe(error instanceof Error ? error.message : error) };
  }
}

async function buildBlogPost(slug: string, preview = false): Promise<BlogPostData> {
  const definition = getBlogPost(slug);
  if (!definition) throw new Error('Blog post not found');

  let items: BlogMediaItem[];
  let topic: BlogTopic | undefined;
  if (slug === 'anime-trending-news-today') {
    const result = await fetchTrendingNewsItems(preview);
    items = result.items;
    topic = result.topic;
  }
  else if (slug === 'trending-anime-this-week') items = await fetchMediaList('TRENDING_DESC', 'RELEASING');
  else if (slug === 'popular-anime-right-now') items = await fetchMediaList('POPULARITY_DESC', 'RELEASING');
  else if (slug === 'upcoming-anime-this-season') items = await fetchMediaList('POPULARITY_DESC', 'NOT_YET_RELEASED');
  else if (slug === 'todays-anime-release-schedule') items = await fetchTodaysSchedule();
  else items = await fetchRecentEpisodes();

  const generatedAt = new Date().toISOString();
  if (preview) return { ...definition, updatedAt: generatedAt, generatedAt, items, topic, articleSource: 'fallback', articleStatus: 'preview_no_gemini' };
  if (definition.articleKind !== 'gemini') {
    return { ...definition, updatedAt: generatedAt, generatedAt, items, article: fallbackArticle(definition, items), articleSource: 'fallback', articleStatus: 'guide_article' };
  }

  const generated = await generateArticle(definition, items, topic);
  return { ...definition, updatedAt: generatedAt, generatedAt, items, topic, article: generated.article, articleSource: generated.source, articleStatus: generated.status };
}

export async function getCachedBlogPost(slug: string, preview = false) {
  const now = Date.now();
  const cacheKey = preview ? slug + ':preview' : slug + ':article';
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data;

  try {
    const data = await buildBlogPost(slug, preview);
    const isGeminiArticle = data.articleSource === 'gemini';
    memoryCache.set(cacheKey, {
      data,
      expiresAt: now + (preview || isGeminiArticle ? CACHE_TTL_MS : FALLBACK_CACHE_TTL_MS),
      staleAt: now + (preview || isGeminiArticle ? STALE_TTL_MS : FALLBACK_STALE_TTL_MS),
    });
    return data;
  } catch (error) {
    if (cached && cached.staleAt > now) return cached.data;
    throw error;
  }
}

export default async function handler(req: any, res: any) {
  const slug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
  const preview = req.query.preview === '1' || req.query.preview === 'true';
  if (!slug || !getBlogPost(slug)) {
    return res.status(404).json({ error: 'Blog post not found' });
  }

  try {
    const data = await getCachedBlogPost(slug, preview);
    const { articleSource: _articleSource, articleStatus: _articleStatus, ...publicData } = data;
    res.setHeader('Cache-Control', EDGE_CACHE_HEADER);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json(publicData);
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Failed to load blog post' });
  }
}
