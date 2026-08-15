import { fetchSupabaseUser, isAdminEmail } from '../_shared/adminAuth.js';
import { hasOnlyNativeRecoveryQueryParameters, nativeRecoveryRelayHtml, parseNativeRecoveryPlatform } from '../_shared/nativeAuthRelay.js';

const APP_CALLBACK = 'streamnyaa://auth';

function routeName(req: any) {
  const route = req.query?.route;
  return String(Array.isArray(route) ? route[0] : route || '').trim().toLowerCase();
}

function setCors(res: any, methods = 'GET,OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
}

function authConfig(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !publishableKey) return res.status(500).json({ error: 'Authentication is not configured' });

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  return res.status(200).json({ supabaseUrl, publishableKey });
}

async function currentUser(req: any, res: any) {
  setCors(res);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  try {
    const user = await fetchSupabaseUser(token);
    if (!user?.email) return res.status(401).json({ error: 'Invalid session' });
    let isAdmin = false;
    try { isAdmin = await isAdminEmail(user.email); } catch (error) { console.error('Admin lookup failed', error); }
    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      },
      isAdmin,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to verify session' });
  }
}

function mobileCallback(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  return res.status(200).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Return to StreamNyaa</title>
    <style>
      html{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#030304;color:#f5edef;font:16px system-ui,sans-serif}.card{max-width:340px;padding:28px;text-align:center}a{display:inline-block;margin-top:18px;padding:12px 18px;border-radius:8px;background:#c81d35;color:white;text-decoration:none;font-weight:600}p{color:#bdb4b7;line-height:1.5}
    </style>
  </head>
  <body>
    <main class="card"><h1>Returning to StreamNyaa</h1><p>Your account will finish signing in inside the Android app.</p><a id="return" href="${APP_CALLBACK}">Open StreamNyaa</a></main>
    <script>
      const target = ${JSON.stringify(APP_CALLBACK)} + location.search + location.hash;
      document.getElementById('return').href = target;
      location.replace(target);
    </script>
  </body>
</html>`);
}

function nativeCallback(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const platform = parseNativeRecoveryPlatform(req.query?.platform);
  const action = String(Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action || '').trim().toLowerCase();
  if (!platform || action !== 'recovery' || !hasOnlyNativeRecoveryQueryParameters(req.query || {}, true)) {
    return res.status(400).send('Invalid native recovery callback');
  }
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  return res.status(200).send(nativeRecoveryRelayHtml(platform));
}

export default function handler(req: any, res: any) {
  switch (routeName(req)) {
    case 'config': return authConfig(req, res);
    case 'me': return currentUser(req, res);
    case 'mobile-callback': return mobileCallback(req, res);
    case 'native-callback': return nativeCallback(req, res);
    default: return res.status(404).json({ error: 'Authentication route not found' });
  }
}
