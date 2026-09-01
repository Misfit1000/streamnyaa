import { describe, expect, it } from 'vitest';
import { redactDesktopDiagnostic } from '../../src/lib/desktopSecurity';

describe('desktop diagnostic redaction', () => {
  it('removes authentication credentials and source links', () => {
    const result = redactDesktopDiagnostic('failed?access_token=secret&refresh_token=other Bearer abc.def.ghi magnet:?xt=urn:btih:123');
    expect(result).not.toContain('secret');
    expect(result).not.toContain('other');
    expect(result).not.toContain('abc.def.ghi');
    expect(result).not.toContain('btih:123');
    expect(result).toContain('[redacted]');
  });

  it('bounds and normalizes diagnostic text', () => {
    const result = redactDesktopDiagnostic(`line one\n${'x'.repeat(500)}`);
    expect(result.length).toBeLessThanOrEqual(240);
    expect(result).not.toContain('\n');
  });
});
