const BLOG_SLUGS = ['anime-trending-news-today', 'anime-viral-topic-today'];

function requestOrigin(req: any) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
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

  const warmed = [];
  const origin = requestOrigin(req);

  for (const slug of BLOG_SLUGS) {
    try {
      const response = await fetch(`${origin}/api/blog?slug=${encodeURIComponent(slug)}&force=1&debug=1`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${secret}`,
          'User-Agent': 'StreamNyaa-Cron',
        },
      });
      const post = await response.json();
      if (!response.ok) throw new Error(post?.error || `Blog generation failed with ${response.status}`);
      warmed.push({
        slug,
        status: response.status,
        ok: true,
        skipped: post.articleStatus === 'not_crucial_topic_skipped',
        articleSlug: post.articleSlug,
        articleStatus: post.articleStatus,
        generatedAt: post.generatedAt,
      });
    } catch (error: any) {
      console.error('Cron blog generation failed', slug, error);
      warmed.push({
        slug,
        status: 500,
        ok: false,
      });
    }
  }

  return res.status(warmed.every((item) => item.ok) ? 200 : 502).json({
    ok: warmed.every((item) => item.ok),
    warmed,
  });
}
