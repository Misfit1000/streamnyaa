import assert from 'node:assert/strict';
import test from 'node:test';
import authHandler from '../api/auth/[route].ts';
import adminHandler from '../api/admin/[route].ts';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { transformSync } from 'esbuild';

test('metadata and source gateways load as emitted Node ESM without a TypeScript resolver', () => {
  const parent=path.resolve('.validation'); mkdirSync(parent,{recursive:true});
  const root=mkdtempSync(path.join(parent,'gateway-esm-'));
  try {
    for (const file of ['api/stream-sources.ts','api/nyaa.ts','api/_shared/boundedHttp.ts','api/_shared/publicMetadataQuery.ts','api/_shared/requestReuse.ts','api/_shared/publicCalendar.ts','api/_shared/recentReleases.ts','src/lib/recentReleases.ts','api/_shared/publicSnapshots.ts','api/_shared/adminAuth.js','src/lib/calendarModel.ts','src/lib/scheduleTiming.ts','src/lib/malMetadataProvider.ts','src/lib/desktopSourceIdentity.ts']) {
      const output=path.join(root,file.replace(/\.ts$/,'.js')); mkdirSync(path.dirname(output),{recursive:true});
      writeFileSync(output,transformSync(readFileSync(file,'utf8'),{loader:'ts',format:'esm',target:'node22'}).code);
    }
    const urls=['api/stream-sources.js','api/nyaa.js'].map(file=>pathToFileURL(path.join(root,file)).href);
    const result=spawnSync(process.execPath,['--input-type=module','-e',`for(const url of ${JSON.stringify(urls)}) {const module=await import(url);if(typeof module.default!=='function') throw Error('Missing handler');}`],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

function responseRecorder() {
  const state: { status: number; body: any; headers: Record<string, string> } = { status: 200, body: null, headers: {} };
  return {
    state,
    response: {
      setHeader(name: string, value: string) { state.headers[name] = value; },
      status(value: number) { state.status = value; return this; },
      json(value: any) { state.body = value; return this; },
      send(value: any) { state.body = value; return this; },
      end() { return this; },
    },
  };
}

test('consolidated auth routes preserve the native mobile callback', async () => {
  const { state, response } = responseRecorder();
  await authHandler({ method: 'GET', query: { route: 'mobile-callback' }, headers: {} }, response);
  assert.equal(state.status, 200);
  assert.match(state.body, /streamnyaa:\/\/auth/);
  assert.match(state.headers['Content-Security-Policy'], /default-src 'none'/);
});

test('consolidated auth routes retain session validation', async () => {
  const { state, response } = responseRecorder();
  await authHandler({ method: 'GET', query: { route: 'me' }, headers: {} }, response);
  assert.equal(state.status, 401);
  assert.deepEqual(state.body, { error: 'Not signed in' });
});

test('consolidated route handlers reject unknown paths', async () => {
  const auth = responseRecorder();
  const admin = responseRecorder();
  await authHandler({ method: 'GET', query: { route: 'unknown' }, headers: {} }, auth.response);
  await adminHandler({ method: 'GET', query: { route: 'unknown' }, headers: {} }, admin.response);
  assert.equal(auth.state.status, 404);
  assert.equal(admin.state.status, 404);
});
