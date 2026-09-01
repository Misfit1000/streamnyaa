import { describe, expect, it } from 'vitest';
import { isValidDesktopMetadataPayload } from '../../src/api/jikan';

describe('desktop metadata payload validation', () => {
  it('accepts usable AniList and Jikan responses', () => {
    expect(isValidDesktopMetadataPayload('anilist', { data: { Media: { id: 1 } } })).toBe(true);
    expect(isValidDesktopMetadataPayload('jikan', { data: [] })).toBe(true);
    expect(isValidDesktopMetadataPayload('jikan', { data: { mal_id: 1 } })).toBe(true);
  });

  it('rejects provider error envelopes and malformed payloads before caching', () => {
    expect(isValidDesktopMetadataPayload('anilist', { errors: [{ message: 'rate limited' }] })).toBe(false);
    expect(isValidDesktopMetadataPayload('anilist', { data: null })).toBe(false);
    expect(isValidDesktopMetadataPayload('jikan', { pagination: {} })).toBe(false);
    expect(isValidDesktopMetadataPayload('jikan', '<html>error</html>')).toBe(false);
  });
});
