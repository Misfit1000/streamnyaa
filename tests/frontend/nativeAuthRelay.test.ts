import { describe, expect, it, vi } from 'vitest';
import handler from '../../api/auth/native-callback';

function responseHarness() {
  const headers = new Map<string, string>();
  const response: any = {
    statusCode: 0,
    body: '',
    setHeader: vi.fn((name: string, value: string) => headers.set(name, value)),
    status: vi.fn((statusCode: number) => { response.statusCode = statusCode; return response; }),
    send: vi.fn((body: string) => { response.body = body; return response; }),
  };
  return { response, headers };
}

describe('native recovery relay handler', () => {
  it('rejects unknown platforms and actions', () => {
    const invalidPlatform = responseHarness();
    handler({ method: 'GET', query: { platform: 'web', action: 'recovery' } }, invalidPlatform.response);
    expect(invalidPlatform.response.statusCode).toBe(400);

    const invalidAction = responseHarness();
    handler({ method: 'GET', query: { platform: 'desktop', action: 'login' } }, invalidAction.response);
    expect(invalidAction.response.statusCode).toBe(400);

    const unknownParameter = responseHarness();
    handler({ method: 'GET', query: { platform: 'desktop', action: 'recovery', next: 'https://evil.example' } }, unknownParameter.response);
    expect(unknownParameter.response.statusCode).toBe(400);
  });

  it('returns a non-cacheable credential-filtering handoff', () => {
    const { response, headers } = responseHarness();
    handler({ method: 'GET', query: { platform: 'desktop', action: 'recovery' } }, response);
    expect(response.statusCode).toBe(200);
    expect(headers.get('Cache-Control')).toContain('no-store');
    expect(headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(response.body).toContain('streamnyaa://auth/callback?action=recovery');
    expect(response.body).toContain('const allowed = ["access_token","refresh_token"');
    expect(response.body).toContain('const unknown =');
  });
});
