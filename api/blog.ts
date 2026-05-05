import { getBlogPost } from '../src/api/blogShared';
import type { BlogArticleContent, BlogArticleFaq, BlogArticleSection, BlogArticleTakeaway, BlogMediaItem, BlogPostData, BlogPostDefinition } from '../src/api/blogShared';

const ANILIST_URL = 'https://graphql.anilist.co';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const CACHE_TTL_MS = 1000 * 60 * 60 * 7;
const STALE_TTL_MS = 1000 * 60 * 60 * 24;
const EDGE_CACHE_HEADER = 'public, s-maxage=25200, stale-while-revalidate=86400';

const memoryCache = new Map<string, { expiresAt: number; staleAt: number; data: BlogPostData }>();

const MEDIA_FIELDS = 'id idMal title { romaji english native } description format status episodes genres averageScore popularity trending season seasonYear coverImage { extraLarge large } studios(isMain: true) { nodes { name } } nextAiringEpisode { episode airingAt }';

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

async function fetchMediaList(sort: string, status: string = 'RELEASING') {
  const query = 'query BlogMedia($sort: [MediaSort], $status: MediaStatus) { Page(page: 1, perPage: 12) { media(type: ANIME, sort: $sort, status: $status, isAdult: false) { ' + MEDIA_FIELDS + ' } } }';
  const data = await aniListRequest(query, { sort: [sort], status });
  return onlyRealItems((data.Page.media || []).map((media: any) => mapMedia(media)));
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

function fallbackArticle(definition: BlogPostDefinition, items: BlogMediaItem[]): BlogArticleContent {
  const top = items[0];
  const genres = uniqueGenres(items);
  const score = averageScore(items);
  const topStudio = top?.studios?.[0];
  const paragraphs = top ? [
    `${definition.intro} The current lead title is ${top.title}${topStudio ? ` from ${topStudio}` : ''}, which gives this article a clear starting point for ${definition.angle}.`,
    `${items.length} titles are included with practical details like score, format, status, episode count, genres, and direct StreamNyaa pages.${score ? ` The average score across scored titles is about ${score}/100.` : ''}`,
    genres.length ? `Genre-wise, this update leans toward ${genres.slice(0, 3).join(', ')}. That makes it easier to pick based on mood instead of only following rank numbers.` : definition.readerPromise,
    definition.readerPromise,
  ] : [definition.intro, definition.readerPromise];

  return {
    seoTitle: definition.seoTitle,
    metaDescription: definition.description,
    headline: definition.title,
    excerpt: definition.summary,
    heroCallout: top ? `${top.title} is the main title to watch here.` : definition.summary,
    paragraphs,
    sections: [
      {
        heading: 'What stands out',
        body: top ? `${top.title} leads this article because it has the strongest current placement among the titles shown here.` : definition.summary,
      },
      {
        heading: 'How to use this list',
        body: 'Compare score, genre, episode status, studio, and season details before opening the StreamNyaa title page for a closer look.',
      },
    ],
    takeaways: [
      top ? { label: 'Top highlight', value: top.title, detail: top.score ? `Score signal: ${top.score}/100` : 'Strong current placement' } : null,
      genres.length ? { label: 'Common genres', value: genres.slice(0, 3).join(', '), detail: 'Useful for picking by mood' } : null,
      score ? { label: 'Average score', value: `${score}/100`, detail: 'Based on titles with score data' } : null,
    ].filter((item): item is BlogArticleTakeaway => Boolean(item)),
    faq: [
      { question: `What is the best pick from ${definition.title}?`, answer: `${top?.title || 'The first title'} is the first title to check, but the best choice depends on the genres and episode status you prefer.` },
      { question: 'How often is this article refreshed?', answer: 'This article is refreshed about every 7 hours so it stays useful without making unnecessary API requests.' },
      { question: 'Can I open anime pages from this article?', answer: 'Yes. Each anime card links to its StreamNyaa title page for more details.' },
    ],
  };
}

function buildGeminiPrompt(definition: BlogPostDefinition, items: BlogMediaItem[]) {
  const facts = items.slice(0, 10).map((item, index) => ({
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
  }));

  return `Write a factual, human-sounding anime blog article for StreamNyaa.

Article topic:
${JSON.stringify({
    title: definition.title,
    category: definition.category,
    description: definition.description,
    articleAngle: definition.angle,
    readerGoal: definition.readerPromise,
  }, null, 2)}

Current anime facts you may use:
${JSON.stringify(facts, null, 2)}

Rules:
- Use only the facts above. Do not invent announcements, staff, release dates, platform availability, awards, trailers, rumors, or production details.
- Do not mention APIs, AI, automation, AniList, Jikan, sources, scraping, or generated content.
- Keep it natural and editorial, like a manually updated anime blog.
- Avoid piracy language and avoid telling users where to watch copyrighted content.
- Make the writing useful for Google search: clear headings, direct wording, helpful comparisons, and natural keywords.
- Keep every sentence fact-safe. If a fact is missing, skip it.
- Return JSON only. No markdown, no code fences.

JSON shape:
{
  "seoTitle": "max 70 chars, include StreamNyaa",
  "metaDescription": "max 155 chars",
  "headline": "article headline",
  "excerpt": "2 sentence summary",
  "heroCallout": "one sentence focused on the top anime",
  "paragraphs": ["4-6 useful intro/body paragraphs"],
  "sections": [{"heading": "short heading", "body": "90-160 words"}],
  "takeaways": [{"label": "short label", "value": "short value", "detail": "short detail"}],
  "faq": [{"question": "question", "answer": "answer"}]
}`;
}

function extractGeminiText(json: any) {
  return json?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('\n').trim() || '';
}

function parseGeminiJson(text: string) {
  const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

function normalizeArray<T>(value: unknown, mapper: (item: any) => T | null, limit: number) {
  if (!Array.isArray(value)) return [];
  return value.map(mapper).filter((item): item is T => Boolean(item)).slice(0, limit);
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

async function generateArticle(definition: BlogPostDefinition, items: BlogMediaItem[]) {
  const fallback = fallbackArticle(definition, items);
  const key = process.env.GEMINI_API_KEY;
  if (!key || !items.length) return fallback;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildGeminiPrompt(definition, items) }] }],
        generationConfig: {
          temperature: 0.65,
          topP: 0.9,
          maxOutputTokens: 2200,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) throw new Error('Gemini article request failed');
    const json = await response.json();
    const rawArticle = parseGeminiJson(extractGeminiText(json));
    return sanitizeArticle(rawArticle, fallback);
  } catch (error) {
    console.error(error);
    return fallback;
  }
}

async function buildBlogPost(slug: string): Promise<BlogPostData> {
  const definition = getBlogPost(slug);
  if (!definition) throw new Error('Blog post not found');

  let items: BlogMediaItem[];
  if (slug === 'trending-anime-this-week') items = await fetchMediaList('TRENDING_DESC', 'RELEASING');
  else if (slug === 'popular-anime-right-now') items = await fetchMediaList('POPULARITY_DESC', 'RELEASING');
  else if (slug === 'upcoming-anime-this-season') items = await fetchMediaList('POPULARITY_DESC', 'NOT_YET_RELEASED');
  else if (slug === 'todays-anime-release-schedule') items = await fetchTodaysSchedule();
  else items = await fetchRecentEpisodes();

  const generatedAt = new Date().toISOString();
  const article = await generateArticle(definition, items);
  return { ...definition, updatedAt: generatedAt, generatedAt, items, article };
}

export async function getCachedBlogPost(slug: string) {
  const now = Date.now();
  const cached = memoryCache.get(slug);
  if (cached && cached.expiresAt > now) return cached.data;

  try {
    const data = await buildBlogPost(slug);
    memoryCache.set(slug, { data, expiresAt: now + CACHE_TTL_MS, staleAt: now + STALE_TTL_MS });
    return data;
  } catch (error) {
    if (cached && cached.staleAt > now) return cached.data;
    throw error;
  }
}

export default async function handler(req: any, res: any) {
  const slug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
  if (!slug || !getBlogPost(slug)) {
    return res.status(404).json({ error: 'Blog post not found' });
  }

  try {
    const data = await getCachedBlogPost(slug);
    res.setHeader('Cache-Control', EDGE_CACHE_HEADER);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json(data);
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Failed to load blog post' });
  }
}
