export type NativeRecoveryPlatform = 'desktop' | 'android';

const RECOVERY_FIELDS = new Set([
  'access_token',
  'refresh_token',
  'expires_in',
  'expires_at',
  'token_type',
  'type',
  'error',
  'error_code',
  'error_description',
]);

// Supabase may append this opaque relay decoration after verifying an email
// action. It is not part of the recovery session and must never be forwarded
// into the native callback.
const IGNORED_RECOVERY_FIELDS = new Set(['sb']);

const NATIVE_TARGETS: Record<NativeRecoveryPlatform, string> = {
  desktop: 'streamnyaa://auth/callback?action=recovery&next=%2Freset-password',
  android: 'streamnyaa://auth/recovery?action=recovery',
};

export function parseNativeRecoveryPlatform(value: unknown): NativeRecoveryPlatform | null {
  const candidate = String(Array.isArray(value) ? value[0] : value || '').trim().toLowerCase();
  return candidate === 'desktop' || candidate === 'android' ? candidate : null;
}

export function hasOnlyNativeRecoveryQueryParameters(query: Record<string, unknown>, dynamicRoute = false) {
  const allowed = new Set(['platform', 'action', ...RECOVERY_FIELDS, ...IGNORED_RECOVERY_FIELDS]);
  if (dynamicRoute) allowed.add('route');
  return Object.keys(query || {}).every((key) => allowed.has(key));
}

export function nativeRecoveryRelayHtml(platform: NativeRecoveryPlatform) {
  const target = NATIVE_TARGETS[platform];
  const appName = platform === 'desktop' ? 'Windows app' : 'Android app';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="referrer" content="no-referrer">
    <title>Return to StreamNyaa</title>
    <style>
      html{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#030304;color:#f5edef;font:16px system-ui,sans-serif}.card{max-width:340px;padding:28px;text-align:center}a{display:inline-block;margin-top:18px;padding:12px 18px;border-radius:8px;background:#c81d35;color:white;text-decoration:none;font-weight:600}p{color:#bdb4b7;line-height:1.5}
    </style>
  </head>
  <body>
    <main class="card"><h1>Returning to StreamNyaa</h1><p>Finish setting your new password in the ${appName}.</p><a id="return" href="${target}">Open StreamNyaa</a></main>
    <script>
      (() => {
        const target = new URL(${JSON.stringify(target)});
        const query = new URLSearchParams(location.search);
        const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
        const allowed = ${JSON.stringify([...RECOVERY_FIELDS])};
        const ignored = ${JSON.stringify([...IGNORED_RECOVERY_FIELDS])};
        const known = new Set(['platform', 'action', ...allowed, ...ignored]);
        const unknown = [...new Set([...query.keys(), ...fragment.keys()])]
          .filter((key) => !known.has(key))
          .slice(0, 4)
          .map((key) => key.slice(0, 32));
        if (unknown.length) {
          target.searchParams.set('error_code', 'unsupported_callback_fields');
          target.searchParams.set('error_description', 'Unsupported recovery fields: ' + unknown.join(', ') + '.');
          location.replace(target.toString());
          return;
        }
        for (const key of allowed) {
          const value = fragment.get(key) || query.get(key);
          if (value) target.searchParams.set(key, value);
        }
        target.searchParams.set('action', 'recovery');
        if (!target.searchParams.get('type') && target.searchParams.get('access_token')) {
          target.searchParams.set('type', 'recovery');
        }
        const destination = target.toString();
        const link = document.getElementById('return');
        if (link) link.setAttribute('href', destination);
        location.replace(destination);
      })();
    </script>
  </body>
</html>`;
}
