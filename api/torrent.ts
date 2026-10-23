import { readBoundedResponse, HttpInputError } from './_shared/boundedHttp.js';
const MAX_TORRENT_BYTES = 5 * 1024 * 1024;

function setCommonHeaders(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export default async function handler(req: any, res: any) {
  setCommonHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const id = String(Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id || '').trim();
  if (!/^\d{1,12}$/.test(id)) return res.status(400).json({ error: 'A valid Nyaa torrent id is required' });

  try {
    const upstream = await fetch(`https://nyaa.si/download/${id}.torrent`, {
      headers: {
        Accept: 'application/x-bittorrent, application/octet-stream;q=0.9, */*;q=0.5',
        'User-Agent': 'StreamNyaa/1.0 (+https://www.streamnyaa.xyz)',
      },
      signal: AbortSignal.timeout(12_000),
      redirect: 'error',
    });
    if (!upstream.ok) return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'Torrent metadata is unavailable' });

    const declaredLength = Number(upstream.headers.get('content-length') || 0);
    if (declaredLength > MAX_TORRENT_BYTES) return res.status(413).json({ error: 'Torrent metadata is too large' });
    const body = Buffer.from(await readBoundedResponse(upstream, MAX_TORRENT_BYTES));
    if (!body.length || body.length > MAX_TORRENT_BYTES || body[0] !== 0x64) {
      return res.status(502).json({ error: 'Upstream returned invalid torrent metadata' });
    }

    res.setHeader('Content-Type', 'application/x-bittorrent');
    res.setHeader('Content-Length', String(body.length));
    res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('Content-Disposition', `inline; filename="streamnyaa-${id}.torrent"`);
    return res.status(200).send(body);
  } catch (error) {
    if (error instanceof HttpInputError) return res.status(502).json({ error: 'Torrent metadata is too large' });
    return res.status(504).json({ error: 'Torrent metadata request timed out' });
  }
}
