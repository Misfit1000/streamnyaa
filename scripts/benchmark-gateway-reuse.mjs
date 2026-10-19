// Controlled local fixtures only. No public provider traffic is generated.
import { performance } from 'node:perf_hooks';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const baseline = process.argv.includes('--baseline');
const sourceFiles = ['api/nyaa.ts', 'api/stream-sources.ts'];
const contents = sourceFiles.map(file => baseline
  ? execFileSync('git', ['show', `c5d52020b26b08828c82e04674812e2152d9730c:${file}`], { encoding: 'utf8' })
  : readFileSync(file, 'utf8'));
const handlers = [];
for (let i = 0; i < sourceFiles.length; i++) {
  let url = pathToFileURL(path.resolve(sourceFiles[i])).href;
  if (baseline) {
    mkdirSync('.validation', { recursive: true });
    const output = path.resolve(`.validation/gateway-baseline-${i}.mjs`);
    await build({ stdin: { contents: contents[i], loader: 'ts', resolveDir: path.resolve('api') }, bundle: true, platform: 'node', format: 'esm', outfile: output });
    url = pathToFileURL(output).href;
  }
  handlers.push((await import(url)).default);
}
const [sourceHandler, metadataHandler] = handlers;

const rss = `<rss><channel>${Array.from({ length: 150 }, (_, i) => `<item><title>Fixture Series - 01 [1080p] [Group ${i}]</title><link>https://example.invalid/${i}</link><nyaa:infoHash>${i.toString(16).padStart(40, '0')}</nyaa:infoHash><nyaa:seeders>15</nyaa:seeders></item>`).join('')}</channel></rss>`;
let upstream = 0, upstreamBytes = 0;
globalThis.fetch = async url => {
  upstream++;
  await new Promise(resolve => setTimeout(resolve, 5));
  const body = String(url).includes('nyaa.si') ? rss : JSON.stringify({ data: [{ mal_id: 1, title: 'Fixture' }] });
  upstreamBytes += Buffer.byteLength(body);
  return new Response(body, { status: 200 });
};
function response() {
  return { headers: {}, body: null, code: 200, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; }, end() {} };
}
async function invoke(handler, query, method = 'GET') {
  const res = response(), start = performance.now();
  await handler({ method, query, headers: { 'user-agent': 'StreamNyaa Local Benchmark' } }, res);
  if (res.code !== 200) throw Error(JSON.stringify(res));
  return { ms: performance.now() - start, res };
}
function stats(values) {
  values.sort((a, b) => a - b);
  return { p50Ms: values[Math.floor(values.length * .5)], p95Ms: values[Math.min(values.length - 1, Math.floor(values.length * .95))] };
}
const concurrent = [], warm = [], metadata = [];
const cpuStart = process.cpuUsage();
let concurrentCalls = 0;
for (let i = 0; i < 12; i++) {
  const before = upstream;
  const query = { q: `Fixture Series ${i}`, deep: '0', scope: 'title' };
  const results = await Promise.all(Array.from({ length: 12 }, () => invoke(sourceHandler, query)));
  concurrent.push(...results.map(r => r.ms));
  concurrentCalls += upstream - before;
  for (let j = 0; j < 12; j++) warm.push((await invoke(sourceHandler, query)).ms);
}
const beforeOverlap = upstream;
await invoke(sourceHandler, { q: 'Fixture Series Shared', deep: '0', scope: 'title' });
await invoke(sourceHandler, { q: 'Fixture Series Shared', deep: '1', pages: '1', scope: 'title' });
for (let i = 0; i < 100; i++) metadata.push((await invoke(metadataHandler, { provider: 'tenrai', path: '/anime/1/episodes', ttl: '600' })).ms);
const cpu = process.cpuUsage(cpuStart);
const result = {
  capturedAt: new Date().toISOString(), fixture: { items: 150, upstreamDelayMs: 5, publicRequests: 0 },
  baseline, sourceSha256: createHash('sha256').update(contents.join('')).digest('hex'),
  concurrent: { clients: 144, upstreamRequests: concurrentCalls, ...stats(concurrent) },
  warm: { clients: warm.length, ...stats(warm) },
  overlappingPlans: { upstreamRequests: upstream - beforeOverlap - 1 },
  metadata: { clients: metadata.length, ...stats(metadata) },
  process: { cpuUserMs: cpu.user / 1000, cpuSystemMs: cpu.system / 1000, heapUsedBytes: process.memoryUsage().heapUsed, rssBytes: process.memoryUsage().rss },
  upstreamBytes,
};
const output = process.argv[2];
if (output) writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
