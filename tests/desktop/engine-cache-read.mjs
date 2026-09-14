// Real bundled-engine regression; entirely local, with DHT/listening/UPnP disabled.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

function bencode(v) {
  if (Buffer.isBuffer(v)) return Buffer.concat([Buffer.from(`${v.length}:`), v]);
  if (typeof v === 'string') return bencode(Buffer.from(v));
  if (typeof v === 'number') return Buffer.from(`i${v}e`);
  if (Array.isArray(v)) return Buffer.concat([Buffer.from('l'), ...v.map(bencode), Buffer.from('e')]);
  return Buffer.concat([Buffer.from('d'), ...Object.keys(v).sort().flatMap(k => [bencode(k), bencode(v[k])]), Buffer.from('e')]);
}
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'streamnyaa-engine-read-'));
const allocator = net.createServer();
await new Promise(resolve => allocator.listen(0, '127.0.0.1', resolve));
const port = allocator.address().port;
await new Promise(resolve => allocator.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(path.resolve('desktop/src-tauri/bin/rqbit.exe'), [
  '--http-api-listen-addr', `127.0.0.1:${port}`, '--disable-dht', '--disable-dht-persistence',
  '--disable-tcp-listen', '--disable-upnp-port-forward', 'server', 'start', '--disable-persistence', root,
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let engineError = '';
child.stderr.on('data', chunk => { engineError = (engineError + chunk.toString()).slice(-4096); });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(route, options = {}) {
  return fetch(origin + route, { ...options, signal: AbortSignal.timeout(4000) });
}
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { ready = (await request('/')).ok; } catch {}
    if (ready) break;
    await wait(100);
  }
  assert(ready, 'Isolated engine did not become ready');
  const bytes = Buffer.alloc(65536, 0x53);
  await fs.writeFile(path.join(root, 'fixture.mkv'), bytes);
  const info = { name: 'fixture.mkv', length: bytes.length, 'piece length': 65536,
    pieces: crypto.createHash('sha1').update(bytes).digest(), private: 1 };
  const added = await request(`/torrents?overwrite=true&output_folder=${encodeURIComponent(root)}`, {
    method: 'POST', body: bencode({ info }), headers: { 'Content-Type': 'application/x-bittorrent' },
  });
  assert(added.ok, `Cache add failed: HTTP ${added.status}`);
  const { id } = await added.json();
  assert.notEqual(id, undefined);
  let state;
  for (let i = 0; i < 50; i++) {
    state = await (await request(`/torrents/${id}/stats/v1`)).json();
    if (state.state === 'live' || state.state === 'error') break;
    await wait(100);
  }
  assert.equal(state.state, 'live', 'Verified cached torrent must reach live state');
  const selected = await request(`/torrents/${id}/update_only_files`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ only_files: [0] }),
  });
  assert(selected.ok, `Selected file failed: HTTP ${selected.status}`);
  const response = await request(`/torrents/${id}/stream/0`, { headers: { Range: 'bytes=0-1023' } });
  assert([200, 206].includes(response.status), `Video read failed: HTTP ${response.status}`);
  const received = Buffer.from(await response.arrayBuffer());
  assert(received.length >= 1024 && received.length <= bytes.length);
  assert.deepEqual(received.subarray(0, 1024), bytes.subarray(0, 1024));
  console.log(`Video read: HTTP ${response.status}, ${received.length} bytes.`);
  console.log('Bundled rqbit: cached verification, file selection and HTTP byte read passed.');
} catch (error) {
  // Do not print raw stderr, paths or URLs from the engine.
  console.error(error.message, engineError.includes('ERROR') ? '(engine reported an error)' : '');
  process.exitCode = 1;
} finally {
  if (child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  }
  if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('streamnyaa-engine-read-')) throw new Error('Unsafe fixture cleanup');
  await fs.rm(root, { recursive: true, force: true });
}
