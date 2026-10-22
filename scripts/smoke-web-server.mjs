import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

// Do not mistake a developer's already running fixture for this build.
const probe=createServer();
await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;
await new Promise(resolve=>probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const routes = [
  '/',
  '/search',
  '/schedule',
  '/anime/1',
  '/anime/season/summer-2026',
  '/season/summer-2026',
  '/nyaa',
  '/compare',
  '/blog',
  '/blog/smoke-published',
  '/login',
  '/reset-password',
  '/about',
];

const fixture=createServer((_req,res)=>{
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify([{content:{slug:'anime-trending-news-today',title:'Smoke article',articleKind:'gemini',articleSlug:'smoke-published',qualityVersion:2,items:[],updatedAt:'2026-10-20T00:00:00Z',article:{headline:'A durably published smoke article',excerpt:'A controlled fixture verifies complete article HTML without requesting any public provider.',paragraphs:['This article body must be present in the first HTML response.'],sections:[],faq:[],takeaways:[]}}}]));
});
await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
const server = spawn(process.execPath, ['dist/server.cjs'], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'production', PORT: String(port),SUPABASE_URL:`http://127.0.0.1:${fixture.address().port}`,SUPABASE_SECRET_KEY:'smoke-fixture' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
server.stdout.on('data', (chunk) => { output += chunk.toString(); });
server.stderr.on('data', (chunk) => { output += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if(server.exitCode!==null)throw Error(`Local production server exited.\n${output}`);
    try {
      if(output.includes(`Server running on http://localhost:${port}`)) {
        const response = await fetch(origin);
        if (response.ok) return;
      }
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local production server did not start.\n${output}`);
}

try {
  await waitForServer();
  for (const route of routes) {
    const response = await fetch(origin + route, { redirect: 'manual' });
    const body = await response.text();
    if (response.status !== 200 || !body.includes('id="root"')) {
      throw new Error(`Route smoke test failed for ${route}: HTTP ${response.status}`);
    }
    if(route==='/blog/smoke-published'&&!body.includes('This article body must be present'))throw Error('Article HTML was replaced by an empty shell.');
  }
  const absent=await fetch(origin+'/blog/invalid_slug');if(absent.status!==404)throw Error('Invalid articles must return a real 404.');
  console.log(`Verified ${routes.length} local production routes.`);
} finally {
  server.kill();
  fixture.close();
}
