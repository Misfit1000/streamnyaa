const SITE_URL = process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'https://www.streamnyaa.xyz';
const BLOG_SLUGS = ['anime-trending-news-today', 'anime-viral-topic-today'];

function siteOrigin() {
  const value = SITE_URL.startsWith('http') ? SITE_URL : `https://${SITE_URL}`;
  return value.replace(/\/+$/, '');
}

export default async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const origin = siteOrigin();
  const warmed = [];

  for (const slug of BLOG_SLUGS) {
    const url = `${origin}/api/blog?slug=${encodeURIComponent(slug)}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'StreamNyaa-Cron/1.0',
      },
    });

    warmed.push({
      slug,
      status: response.status,
      ok: response.ok,
    });
  }

  return res.status(warmed.every((item) => item.ok) ? 200 : 502).json({
    ok: warmed.every((item) => item.ok),
    warmed,
  });
}
