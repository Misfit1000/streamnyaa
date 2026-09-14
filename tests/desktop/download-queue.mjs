// Local-only torrent integration. No public trackers, media or user profile data.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'streamnyaa-download-fixture-'));
const seed = path.join(fixture, 'seed');
const local = path.join(fixture, 'profile');
await fs.mkdir(seed); await fs.mkdir(local);
function bencode(value) {
  if (Buffer.isBuffer(value)) return Buffer.concat([Buffer.from(`${value.length}:`), value]);
  if (typeof value === 'string') return bencode(Buffer.from(value));
  if (typeof value === 'number') return Buffer.from(`i${value}e`);
  if (Array.isArray(value)) return Buffer.concat([Buffer.from('l'), ...value.map(bencode), Buffer.from('e')]);
  return Buffer.concat([Buffer.from('d'), ...Object.keys(value).sort().flatMap(key => [bencode(key), bencode(value[key])]), Buffer.from('e')]);
}
async function port() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value;
}
const peerPort = await port(), apiPort = await port();
const tracker = http.createServer((req, res) => {
  const peer = Buffer.alloc(6); peer.set([127, 0, 0, 1]); peer.writeUInt16BE(peerPort, 4);
  res.end(bencode({ interval: 1, complete: 1, incomplete: 0, peers: peer }));
});
await new Promise(resolve => tracker.listen(0, '127.0.0.1', resolve));
const trackerUrl = `http://127.0.0.1:${tracker.address().port}/announce`;
const bytes = Buffer.alloc(4 * 1024 * 1024); for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
await fs.writeFile(path.join(seed, 'fixture.mkv'), bytes);
const pieces = []; for (let i = 0; i < bytes.length; i += 16384) pieces.push(crypto.createHash('sha1').update(bytes.subarray(i, i + 16384)).digest());
const info = { name: 'fixture.mkv', length: bytes.length, 'piece length': 16384, pieces: Buffer.concat(pieces) };
const hash = crypto.createHash('sha1').update(bencode(info)).digest('hex');
const torrent = bencode({ announce: trackerUrl, info });
const engine = spawn(path.join(repo, 'desktop/src-tauri/bin/rqbit.exe'), ['--http-api-listen-addr', `127.0.0.1:${apiPort}`, '--disable-dht', '--disable-upnp-port-forward', '--tcp-min-port', String(peerPort), '--tcp-max-port', String(peerPort + 1), 'server', 'start', '--disable-persistence', seed], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
let test;
try {
  const base = `http://127.0.0.1:${apiPort}`;
  for (let i = 0; ; i++) {
    try { await fetch(base); break; } catch { if (i >= 50) throw new Error('Fixture seeder unavailable'); await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  const response = await fetch(`${base}/torrents?overwrite=true`, { method: 'POST', body: torrent });
  if (!response.ok) throw new Error(`Fixture rejected: ${response.status}`);
  const added = await response.json();
  for (let i = 0; ; i++) {
    const stats = await (await fetch(`${base}/torrents/${added.id}/stats/v1`)).json();
    if (stats.finished) break;
    if (i >= 50) throw new Error('Fixture seeder did not verify');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  test = spawn('cargo', ['test', '--manifest-path', 'desktop/src-tauri/Cargo.toml', 'download_queue::tests::local_torrent_pause_resume_and_completion', '--', '--ignored', '--test-threads=1', '--nocapture'], {
    cwd: repo, windowsHide: true, stdio: 'inherit', env: { ...process.env, LOCALAPPDATA: local,
      STREAMNYAA_DOWNLOAD_FIXTURE: '1', RQBIT_DHT_DISABLE: 'true',
      STREAMNYAA_DOWNLOAD_FIXTURE_MAGNET: `magnet:?xt=urn:btih:${hash}&tr=${encodeURIComponent(trackerUrl)}` },
  });
  const code = await new Promise((resolve, reject) => { test.on('error', reject); test.on('exit', resolve); });
  if (code !== 0) throw new Error(`Download integration failed (${code}); fixture retained at ${fixture}`);
  console.log('Native download transfer, bandwidth-limited pause, resume, file verification and durable completion passed.');
  console.log(`Fixture evidence: ${fixture}`);
} finally {
  if (engine.exitCode === null) engine.kill();
  tracker.closeAllConnections(); tracker.close();
}
