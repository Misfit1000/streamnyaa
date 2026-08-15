import { spawn } from 'node:child_process';

const port = 4179;
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
  '/blog/example',
  '/login',
  '/reset-password',
  '/about',
];

const server = spawn(process.execPath, ['dist/server.cjs'], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'production', PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
server.stdout.on('data', (chunk) => { output += chunk.toString(); });
server.stderr.on('data', (chunk) => { output += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
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
  }
  console.log(`Verified ${routes.length} local production routes.`);
} finally {
  server.kill();
}
