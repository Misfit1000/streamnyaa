import { describe, expect, it } from 'vitest';
import { isValidDesktopMetadataPayload } from '../../src/api/jikan';

describe('desktop metadata payload validation', () => {
  it('accepts usable AniList and Jikan responses', () => {
    expect(isValidDesktopMetadataPayload('anilist', { data: { Media: { id: 1 } } })).toBe(true);
    expect(isValidDesktopMetadataPayload('tenrai', { data: [] })).toBe(true);
    expect(isValidDesktopMetadataPayload('tenrai', { data: { mal_id: 1 } })).toBe(true);
  });

  it('rejects provider error envelopes and malformed payloads before caching', () => {
    expect(isValidDesktopMetadataPayload('anilist', { errors: [{ message: 'rate limited' }] })).toBe(false);
    expect(isValidDesktopMetadataPayload('anilist', { data: null })).toBe(false);
    expect(isValidDesktopMetadataPayload('tenrai', { pagination: {} })).toBe(false);
    expect(isValidDesktopMetadataPayload('tenrai', '<html>error</html>')).toBe(false);
  });
});
