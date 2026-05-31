import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const distRoot = path.join(repoRoot, 'dist');
const host = process.env.STREAMNYAA_DESKTOP_HOST || '127.0.0.1';
const port = Number(process.env.STREAMNYAA_DESKTOP_PORT || 5173);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
]);

if (!existsSync(path.join(distRoot, 'index.html'))) {
  throw new Error(`Desktop dist is missing. Run build:desktop first. Expected ${path.join(distRoot, 'index.html')}`);
}

function resolveRequestPath(url = '/') {
  let pathname = '/';
  try {
    pathname = new URL(url, `http://${host}:${port}`).pathname;
  } catch {
    pathname = '/';
  }
  const decoded = decodeURIComponent(pathname);
  const requested = decoded === '/' || !path.extname(decoded) ? '/index.html' : decoded;
  const fullPath = path.resolve(distRoot, `.${requested}`);
  if (!fullPath.startsWith(distRoot)) return null;
  return fullPath;
}

const server = http.createServer((request, response) => {
  const fullPath = resolveRequestPath(request.url);
  if (!fullPath) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': contentTypes.get(path.extname(fullPath)) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(fullPath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`StreamNyaa desktop bundle server running at http://${host}:${port}/`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
