import { describe, expect, it } from 'vitest';
import { appendBoundedDiagnostic, sanitizeDiagnosticContext, sanitizeDiagnosticText, sanitizedPlaybackStatus } from './diagnosticSanitizer';

describe('support diagnostic sanitization', () => {
  it('removes magnets, tokens, JWTs, and account identifiers', () => {
    const text = sanitizeDiagnosticText('Bearer secret-token user@example.com magnet:?xt=urn:btih:abc access_token=abc.def eyJabc.def.ghi');
    expect(text).not.toContain('secret-token');
    expect(text).not.toContain('user@example.com');
    expect(text).not.toContain('magnet:?');
    expect(text).not.toContain('eyJabc');
    expect(sanitizeDiagnosticContext({ token: 'secret', accountEmail: 'a@b.com', peers: 3 })).toEqual({ peers: 3 });
  });

  it('exports telemetry without the private loopback URL', () => {
    const status = sanitizedPlaybackStatus({
      state: 'buffering', message: 'Waiting', progress: 12, bufferedPercent: 4, peers: 2, seeds: 7,
      downloadRate: 1024, streamUrl: 'http://127.0.0.1:12345/stream?token=secret',
    });
    expect(status?.hasStreamUrl).toBe(true);
    expect(JSON.stringify(status)).not.toContain('127.0.0.1');
    expect(JSON.stringify(status)).not.toContain('secret');
  });

  it('keeps the newest bounded history', () => {
    const events = Array.from({ length: 4 }, (_, at) => ({ at, level: 'info' as const, stage: 'test', code: String(at), message: 'ok' }));
    expect(appendBoundedDiagnostic(events.slice(0, 3), events[3]!, 2).map((event) => event.code)).toEqual(['2', '3']);
  });
});
