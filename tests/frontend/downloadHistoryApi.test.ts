import { beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ fetchSupabaseUser: vi.fn(), supabaseRest: vi.fn() }));
vi.mock('../../api/_shared/adminAuth.js', () => auth);
import handler from '../../api/download-history';

function response() {
  const res: any = { statusCode: 0, body: null, setHeader: vi.fn(), end: vi.fn() };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: any) => { res.body = body; return res; };
  return res;
}
const item = { title: 'Anime', magnet: 'magnet:example', action: 'open', user_id: 'attacker' };
beforeEach(() => {
  auth.fetchSupabaseUser.mockReset().mockResolvedValue({ id: 'verified-user' });
  auth.supabaseRest.mockReset().mockResolvedValue([]);
});

it.each([item, { entries: [item, item] }])('accepts legacy and batch requests with authenticated ownership', async (body) => {
  const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer test' }, body }, res);
  expect(res.statusCode).toBe(200);
  const insert = auth.supabaseRest.mock.calls.find(([, options]) => options?.method === 'POST');
  const rows = JSON.parse(insert![1].body);
  expect(rows).toHaveLength(1);
  expect(rows[0].user_id).toBe('verified-user');
  expect(res.body.ok).toBe(true);
});

it.each([{ entries: [] }, { entries: Array(31).fill(item) }, { entries: [item, {}] }])('validates the whole batch before changing data', async (body) => {
  const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer test' }, body }, res);
  expect(res.statusCode).toBe(400);
  expect(auth.supabaseRest).not.toHaveBeenCalled();
});

it('does not acknowledge an unavailable backing table', async () => {
  auth.supabaseRest.mockRejectedValue({ status: 404 });
  const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer test' }, body: item }, res);
  expect(res.body).toEqual({ ok: false, localOnly: true });
});

it('rejects invalid sessions before accessing history', async () => {
  auth.fetchSupabaseUser.mockResolvedValue(null);
  const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer test' }, body: item }, res);
  expect(res.statusCode).toBe(401);
  expect(auth.supabaseRest).not.toHaveBeenCalled();
});

it('caches preflight permission without caching private history', async () => {
  const res = response();
  await handler({ method: 'OPTIONS' }, res);
  expect(res.statusCode).toBe(204);
  expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Max-Age', '600');
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  expect(auth.fetchSupabaseUser).not.toHaveBeenCalled();
});
