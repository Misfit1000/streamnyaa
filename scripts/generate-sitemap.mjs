const SITE_URL = (process.env.VITE_SITE_URL || process.env.SITE_URL || 'https://www.streamnyaa.xyz').replace(/\/$/, '');
const ANILIST_URL = 'https://graphql.anilist.co';
const TODAY = new Date().toISOString().slice(0, 10);

const staticRoutes = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/schedule', changefreq: 'daily', priority: '0.8' },
  { path: '/search', changefreq: 'daily', priority: '0.8' },
  { path: '/nyaa', changefreq: 'daily', priority: '0.7' },
  { path: '/torrent', changefreq: 'weekly', priority: '0.6' },
  { path: '/about', changefreq: 'monthly', priority: '0.6' },
  { path: '/privacy-policy', changefreq: 'monthly', priority: '0.5' },
  { path: '/terms', changefreq: 'monthly', priority: '0.5' },
  { path: '/disclaimer', changefreq: 'monthly', priority: '0.5' },
];

const blogRoutes = [
  { path: '/blog', changefreq: 'daily', priority: '0.8' },
  { path: '/blog/anime-trending-news-today', changefreq: 'daily', priority: '0.8' },
  { path: '/blog/anime-viral-topic-today', changefreq: 'daily', priority: '0.8' },
  { path: '/blog/trending-anime-this-week', changefreq: 'daily', priority: '0.7' },
  { path: '/blog/popular-anime-right-now', changefreq: 'daily', priority: '0.7' },
  { path: '/blog/upcoming-anime-this-season', changefreq: 'daily', priority: '0.7' },
  { path: '/blog/todays-anime-release-schedule', changefreq: 'daily', priority: '0.7' },
  { path: '/blog/recent-anime-episode-updates', changefreq: 'daily', priority: '0.7' },
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      await sleep(350);
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

function uniqueUrls(urls) {
  const seen = new Set();
  return urls.filter((url) => {
    if (seen.has(url.loc)) return false;
    seen.add(url.loc);
    return true;
  });
}

function formatUrlset(urls) {
  const body = uniqueUrls(urls).map((url) => '  <url>\n' +
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

function formatSitemapIndex(entries) {
  const body = entries.map((entry) => '  <sitemap>\n' +
    '    <loc>' + escapeXml(SITE_URL + entry.path) + '</loc>\n' +
    '    <lastmod>' + entry.lastmod + '</lastmod>\n' +
    '  </sitemap>').join('\n');

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    body +
    '\n</sitemapindex>\n';
}

function parseUrlsetXml(xml) {
  const urls = [];
  const blocks = String(xml).match(/<url>[\s\S]*?<\/url>/g) || [];
  for (const block of blocks) {
    const loc = block.match(/<loc>([\s\S]*?)<\/loc>/)?.[1];
    if (!loc) continue;
    urls.push({
      loc: loc.replace(/&amp;/g, '&'),
      lastmod: block.match(/<lastmod>([\s\S]*?)<\/lastmod>/)?.[1] || TODAY,
      changefreq: block.match(/<changefreq>([\s\S]*?)<\/changefreq>/)?.[1] || 'weekly',
      priority: block.match(/<priority>([\s\S]*?)<\/priority>/)?.[1] || '0.6',
    });
  }
  return urls;
}

async function fetchExistingSitemapUrls(kind) {
  const urls = [];
  const splitUrl = SITE_URL + '/sitemap-' + kind + '.xml';
  const mainUrl = SITE_URL + '/sitemap.xml';

  for (const url of [splitUrl, mainUrl]) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'StreamNyaa-Sitemap-Fallback/1.0' },
      });
      if (!response.ok) continue;
      const parsed = parseUrlsetXml(await response.text());
      urls.push(...parsed);
      if (urls.length) break;
    } catch {
      // Keep generation best-effort; the build should not fail because a remote fallback was unavailable.
    }
  }

  if (kind === 'anime') {
    return urls.filter((url) => url.loc.includes('/anime/') || url.loc.includes('/watch/'));
  }
  if (kind === 'manga') {
    return urls.filter((url) => url.loc.includes('/manga/'));
  }
  return urls;
}

async function readBlogArchiveSlugs() {
  try {
    const { readFile } = await import('node:fs/promises');
    const archivePath = new URL('../public/generated-blog-archive/index.json', import.meta.url);
    const archive = JSON.parse(await readFile(archivePath, 'utf8'));
    return Array.isArray(archive.slugs) ? archive.slugs.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function buildSitemaps() {
  const staticUrls = [];
  for (const route of staticRoutes) {
    addUrl(staticUrls, route.path, route.changefreq, route.priority);
  }

  const blogUrls = [];
  for (const route of blogRoutes) {
    addUrl(blogUrls, route.path, route.changefreq, route.priority);
  }
  for (const slug of await readBlogArchiveSlugs()) {
    addUrl(blogUrls, '/blog/' + slug, 'daily', '0.8');
  }

  const anime = await fetchAniListMedia('ANIME', animeCollections);
  await sleep(750);
  const manga = await fetchAniListMedia('MANGA', mangaCollections);

  const animeUrls = [];
  for (const item of anime) {
    addUrl(animeUrls, '/anime/' + mediaSlug(item), 'weekly', '0.8', item.lastmod);
    addUrl(animeUrls, '/anime/' + mediaSlug(item) + '/downloads', 'weekly', '0.6', item.lastmod);
    addUrl(animeUrls, '/watch/' + mediaSlug(item), 'weekly', '0.6', item.lastmod);
  }

  const mangaUrls = [];
  for (const item of manga) {
    addUrl(mangaUrls, '/manga/' + mediaSlug(item), 'weekly', '0.7', item.lastmod);
  }

  if (!animeUrls.length) {
    animeUrls.push(...await fetchExistingSitemapUrls('anime'));
  }

  if (!mangaUrls.length) {
    mangaUrls.push(...await fetchExistingSitemapUrls('manga'));
  }

  const entries = [
    { path: '/sitemap-static.xml', lastmod: TODAY },
    { path: '/sitemap-anime.xml', lastmod: TODAY },
    { path: '/sitemap-manga.xml', lastmod: TODAY },
    { path: '/sitemap-blog.xml', lastmod: TODAY },
    { path: '/api/blog-sitemap', lastmod: TODAY },
  ];

  return {
    'sitemap.xml': formatSitemapIndex(entries),
    'sitemap-static.xml': formatUrlset(staticUrls),
    'sitemap-anime.xml': formatUrlset(animeUrls),
    'sitemap-manga.xml': formatUrlset(mangaUrls),
    'sitemap-blog.xml': formatUrlset(blogUrls),
  };
}

export async function buildSitemap() {
  const sitemaps = await buildSitemaps();
  return sitemaps['sitemap.xml'];
}

const { pathToFileURL } = await import('node:url');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const outputDir = new URL('../public/', import.meta.url);
  const sitemaps = await buildSitemaps();
  await mkdir(dirname(fileURLToPath(new URL('sitemap.xml', outputDir))), { recursive: true });
  for (const [filename, sitemap] of Object.entries(sitemaps)) {
    await writeFile(fileURLToPath(new URL(filename, outputDir)), sitemap, 'utf8');
    const urlCount = (sitemap.match(/<url>/g) || []).length;
    const sitemapCount = (sitemap.match(/<sitemap>/g) || []).length;
    console.log('Generated ' + filename + ' with ' + (urlCount || sitemapCount) + ' entries');
  }
}
