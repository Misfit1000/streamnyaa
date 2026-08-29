import { hasOnlyNativeRecoveryQueryParameters, nativeRecoveryRelayHtml, parseNativeRecoveryPlatform } from '../_shared/nativeAuthRelay.js';

export default function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const platform = parseNativeRecoveryPlatform(req.query?.platform);
  const action = String(Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action || '').trim().toLowerCase();
  if (!platform || action !== 'recovery' || !hasOnlyNativeRecoveryQueryParameters(req.query || {})) {
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
