const APP_CALLBACK = 'streamnyaa://auth';

export default function handler(req: any, res: any) {
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
