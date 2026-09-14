import { describe, expect, it } from 'vitest';
import { buildDesktopDiagnosticsReport } from '../../src/lib/desktop';

describe('shareable diagnostics', () => {
  it('excludes paths, raw errors, tokens and stream identifiers', () => {
    const report = buildDesktopDiagnosticsReport({
      app_version: '0.1.8',
      runtime: { ready: true, torrent_engine_path: 'C:\\Users\\Private\\rqbit.exe', player_path: '/private/mpv' },
      cache: { cache_dir: '/private/cache', total_bytes: 123, max_bytes: 456 },
      logs_dir: '/private/logs',
      active_session: { torrent_id: 'private-hash', session_dir: '/private/session', media_url: 'https://example/?token=secret', cache_bytes: 100 },
      recent_errors: ['Authorization: Bearer secret magnet:?xt=private'],
    } as any);
    expect(report).toContain('Cache usage: 123/456');
    expect(report).toContain('Recorded errors: 1');
    expect(report).not.toMatch(/secret|private-hash|magnet:|Users|\/private|https:/);
  });
});
