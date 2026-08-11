import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(path.join(repositoryRoot, 'mobile', 'app.json'), 'utf8'));
const apiOrigin = String(config.expo?.extra?.apiOrigin || 'https://www.streamnyaa.xyz').replace(/\/+$/, '');
const startedAt = Date.now();

async function measured(id, request) {
  const started = Date.now();
  try {
    const value = await request();
    return { id, ok: true, latencyMs: Date.now() - started, ...value };
  } catch (error) {
    return { id, ok: false, latencyMs: Date.now() - started, error: error instanceof Error ? error.message.slice(0, 240) : 'Request failed' };
  }
}

async function fetchResponse(url, init = {}, timeoutMs = 8_000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${new URL(url).pathname} returned HTTP ${response.status}`);
  return response;
}

async function fetchJson(url, init, timeoutMs) {
  return fetchResponse(url, init, timeoutMs).then((response) => response.json());
}

function sourceItems(payload) {
  for (const value of [payload, payload?.items, payload?.results, payload?.data]) if (Array.isArray(value)) return value;
  return [];
}

const sourceQueries = [
  'Frieren Beyond Journeys End Season 2 01',
  'Solo Leveling Season 2 01',
  'Fullmetal Alchemist Brotherhood 01',
  'DAN DA DAN Season 2 01',
];

const baseChecks = await Promise.all([
  measured('anime-metadata', async () => {
    const payload = await fetchJson('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query: 'query { GenreCollection }' }),
    }, 7_000);
    return { genres: Array.isArray(payload?.data?.GenreCollection) ? payload.data.GenreCollection.length : 0 };
  }),
  measured('account-config', async () => {
    const payload = await fetchJson(`${apiOrigin}/api/auth/config`, { headers: { accept: 'application/json' } }, 7_000);
    return { configured: Boolean(payload && typeof payload === 'object') };
  }),
  ...sourceQueries.map((query, index) => measured(`sources-${index + 1}`, async () => {
    const params = new URLSearchParams({ q: query, c: '1_2', f: '0', p: '1', deep: '0', pages: '1', wide: '0' });
    const payload = await fetchJson(`${apiOrigin}/api/nyaa?${params}`, { headers: { accept: 'application/json' } }, 8_000);
    const items = sourceItems(payload);
    const seeded = items.filter((item) => Number(item?.seeders || 0) > 0);
    const validHashes = items.filter((item) => /^[a-z0-9]{32,64}$/i.test(String(item?.infoHash || '')));
    const sample = seeded[0] || items[0];
    const sampleId = String(sample?.id || sample?.link || '').match(/(?:view|download)\/(\d+)/i)?.[1] || String(sample?.id || '').match(/^\d+$/)?.[0];
    return {
      query,
      results: items.length,
      seeded: seeded.length,
      validHashes: validHashes.length,
      bestSeeders: Number(seeded[0]?.seeders || 0),
      sampleTorrentId: sampleId ? Number(sampleId) : null,
    };
  })),
]);

const torrentId = baseChecks.find((check) => check.ok && check.sampleTorrentId)?.sampleTorrentId;
const directMetadataCheck = torrentId ? { required: true, ...await measured('torrent-metadata-direct', async () => {
  const response = await fetchResponse(`https://nyaa.si/download/${torrentId}.torrent`, { headers: { accept: 'application/x-bittorrent,application/octet-stream' } }, 8_000);
  const bytes = (await response.arrayBuffer()).byteLength;
  if (bytes < 32) throw new Error('Direct torrent metadata returned an empty response');
  return { bytes, contentType: response.headers.get('content-type') || 'unknown' };
}) } : { id: 'torrent-metadata-direct', ok: false, required: true, latencyMs: 0, error: 'No indexed torrent ID was returned by source search' };
const proxyMetadataCheck = torrentId ? { required: false, ...await measured('torrent-metadata-proxy', async () => {
  const response = await fetchResponse(`${apiOrigin}/api/torrent?id=${torrentId}`, { headers: { accept: 'application/x-bittorrent,application/octet-stream' } }, 8_000);
  const bytes = (await response.arrayBuffer()).byteLength;
  if (bytes < 32) throw new Error('Torrent metadata proxy returned an empty response');
  return { bytes, contentType: response.headers.get('content-type') || 'unknown' };
}) } : { id: 'torrent-metadata-proxy', ok: false, required: false, latencyMs: 0, error: 'No indexed torrent ID was returned by source search' };

const checks = [...baseChecks.map((check) => ({ required: true, ...check })), directMetadataCheck, proxyMetadataCheck];
const requiredFailures = checks.filter((check) => check.required && !check.ok);
const report = {
  protocolVersion: 1,
  generatedAt: new Date().toISOString(),
  apiOrigin,
  elapsedMs: Date.now() - startedAt,
  summary: { passed: checks.filter((check) => check.ok).length, requiredFailures: requiredFailures.length, optionalWarnings: checks.filter((check) => !check.required && !check.ok).length },
  checks,
};

const reportDirectory = path.join(repositoryRoot, '.tooling', 'mobile-health');
await mkdir(reportDirectory, { recursive: true });
const reportPath = path.join(reportDirectory, 'latest.json');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.table(checks.map(({ id, required, ok, latencyMs, results, seeded, error }) => ({ id, required, ok, latencyMs, results: results ?? '', seeded: seeded ?? '', error: error || '' })));
console.log(`Saved sanitized report to ${reportPath}`);
if (requiredFailures.length) process.exitCode = 1;
