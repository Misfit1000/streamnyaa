function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
}

export default function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !publishableKey) {
    return res.status(500).json({ error: 'Authentication is not configured' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  return res.status(200).json({ supabaseUrl, publishableKey });
}
