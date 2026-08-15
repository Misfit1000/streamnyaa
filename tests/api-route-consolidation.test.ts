import assert from 'node:assert/strict';
import test from 'node:test';
import authHandler from '../api/auth/[route].ts';
import adminHandler from '../api/admin/[route].ts';

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
