import { describe, expect, it } from 'vitest';
import { trailerEmbedUrl, trailerErrorMessage } from '../../src/lib/desktopTrailerPlayer';
describe('in-app trailer integration', () => {
  it('delegates fullscreen and identifies the actual parent origin without changing privacy host', () => {
    const url = new URL(trailerEmbedUrl('https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1'));
    expect(url.hostname).toBe('www.youtube-nocookie.com'); expect(url.searchParams.get('fs')).toBe('1');
    expect(url.searchParams.get('enablejsapi')).toBe('1'); expect(url.searchParams.get('origin')).toBe(window.location.origin);
  });
  it('rejects external embeds and explains supported errors without promising verification bypass', () => {
    expect(trailerEmbedUrl('https://evil.example/embed/abcdefghijk')).toBe('');
    expect(trailerErrorMessage(153)).toContain('identification');
    expect(trailerErrorMessage(101)).toContain('does not allow');
    expect(trailerErrorMessage(5)).toContain('verification');
  });
});
