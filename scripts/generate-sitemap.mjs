const SITE_URL = (process.env.VITE_SITE_URL || process.env.SITE_URL || 'https://www.streamnyaa.xyz').replace(/\/$/, '');
const ANILIST_URL = 'https://graphql.anilist.co';
const TODAY = new Date().toISOString().slice(0, 10);

const staticRoutes = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/schedule', changefreq: 'daily', priority: '0.8' },
  { path: '/search', changefreq: 'daily', priority: '0.8' },
  { path: '/nyaa', changefreq: 'daily', priority: '0.7' },
  { path: '/torrent', changefreq: 'weekly', priority: '0.6' },
  { path: '/blog', changefreq: 'daily', priority: '0.8' },
  { path: '/blog/anime-trending-news-today', changefreq: 'daily', priority: '0.8' },
  { path: '/blog/trending-anime-this-week', changefreq: 'daily', priority: '0.7' },
  { path: '/blog/popular-anime-right-now', changefreq: 'daily', priority: '0.7' },
  { path: '/blog/upcoming-anime-this-season', changefreq: 'daily', priority: '0.7' },
  { path: '/blog/todays-anime-release-schedule', changefreq: 'daily', priority: '0.7' },
  { path: '/blog/recent-anime-episode-updates', changefreq: 'daily', priority: '0.7' },
  { path: '/about', changefreq: 'monthly', priority: '0.6' },
  { path: '/privacy-policy', changefreq: 'monthly', priority: '0.5' },
  { path: '/terms', changefreq: 'monthly', priority: '0.5' },
  { path: '/disclaimer', changefreq: 'monthly', priority: '0.5' },
];

const animeCollections = [
  { sort: 'POPULARITY_DESC', pages: 3 },
  { sort: 'TRENDING_DESC', pages: 2 },
  { sort: 'SCORE_DESC', pages: 2 },
  { sort: 'UPDATED_AT_DESC', pages: 2 },
  { sort: 'START_DATE_DESC', pages: 2 },
];

const mangaCollections = [
  { sort: 'POPULARITY_DESC', pages: 3 },
  { sort: 'TRENDING_DESC', pages: 2 },
  { sort: 'SCORE_DESC', pages: 2 },
  { sort: 'UPDATED_AT_DESC', pages: 2 },
];

const mediaQuery = 'query SitemapMedia($page: Int!, $type: MediaType!, $sort: [MediaSort]!) {' +
  ' Page(page: $page, perPage: 50) {' +
  ' media(type: $type, sort: $sort, isAdult: false) {' +
  ' id idMal updatedAt title { romaji english native }' +
  ' }' +
  ' }' +
  '}';

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeDate(updatedAt) {
  if (!updatedAt) return TODAY;
  return new Date(updatedAt * 1000).toISOString().slice(0, 10);
}

async function fetchAniListMedia(type, collections) {
  const items = new Map();

  for (const collection of collections) {
    for (let page = 1; page <= collection.pages; page += 1) {
      try {
        const response = await fetch(ANILIST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: mediaQuery, variables: { page, type, sort: [collection.sort] } }),
        });

        if (!response.ok) {
          console.warn('Sitemap warning: AniList returned ' + response.status + ' for ' + type + ' ' + collection.sort + ' page ' + page);
          continue;
        }

        const json = await response.json();
        if (json.errors) {
          console.warn('Sitemap warning: AniList GraphQL error for ' + type + ' ' + collection.sort + ' page ' + page);
          continue;
        }

        for (const media of json.data?.Page?.media || []) {
          const id = media.idMal || media.id;
          if (!id || items.has(id)) continue;
          items.set(id, { id, title: media.title?.english || media.title?.romaji || media.title?.native || String(id), lastmod: normalizeDate(media.updatedAt) });
        }
      } catch (error) {
        console.warn('Sitemap warning: failed to fetch ' + type + ' ' + collection.sort + ' page ' + page + ': ' + error.message);
      }
    }
  }

  return [...items.values()];
}

function slugifyTitle(title) {
  return String(title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'anime';
}

function mediaSlug(item) {
  return item.id + '-' + slugifyTitle(item.title);
}

function addUrl(urls, path, changefreq, priority, lastmod = TODAY) {
  urls.push({ loc: SITE_URL + path, changefreq, priority, lastmod });
}

export async function buildSitemap() {
  const urls = [];
  for (const route of staticRoutes) {
    addUrl(urls, route.path, route.changefreq, route.priority);
  }

  const [anime, manga] = await Promise.all([
    fetchAniListMedia('ANIME', animeCollections),
    fetchAniListMedia('MANGA', mangaCollections),
  ]);

  for (const item of anime) {
    addUrl(urls, '/anime/' + mediaSlug(item), 'weekly', '0.8', item.lastmod);
    addUrl(urls, '/anime/' + mediaSlug(item) + '/downloads', 'weekly', '0.6', item.lastmod);
    addUrl(urls, '/watch/' + mediaSlug(item), 'weekly', '0.6', item.lastmod);
  }

  for (const item of manga) {
    addUrl(urls, '/manga/' + mediaSlug(item), 'weekly', '0.7', item.lastmod);
  }

  const seen = new Set();
  const uniqueUrls = urls.filter((url) => {
    if (seen.has(url.loc)) return false;
    seen.add(url.loc);
    return true;
  });

  const body = uniqueUrls.map((url) => '  <url>\n' +
    '    <loc>' + escapeXml(url.loc) + '</loc>\n' +
    '    <lastmod>' + url.lastmod + '</lastmod>\n' +
    '    <changefreq>' + url.changefreq + '</changefreq>\n' +
    '    <priority>' + url.priority + '</priority>\n' +
    '  </url>').join('\n');

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    body +
    '\n</urlset>\n';
}

if (import.meta.url === 'file://' + process.argv[1].replace(/\\/g, '/')) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  const outputPath = new URL('../public/sitemap.xml', import.meta.url);
  const sitemap = await buildSitemap();
  await mkdir(dirname(outputPath.pathname), { recursive: true });
  await writeFile(outputPath, sitemap, 'utf8');
  const count = (sitemap.match(/<url>/g) || []).length;
  console.log('Generated sitemap.xml with ' + count + ' URLs');
}
