import { afterEach, describe, expect, it } from 'vitest';
import { clearInterruptedPlayback, markInterruptedPlayback, readInterruptedPlayback, interruptedSourceKey } from '../../src/lib/desktopInterruptedSession';
afterEach(() => localStorage.clear());
describe('interrupted session identity', () => {
  it('does not clear a newer playback session when dismissing the startup prompt', () => {
    markInterruptedPlayback('123', 4, 'hash:old');
    const startup = readInterruptedPlayback()!;
    markInterruptedPlayback('123', 5, 'hash:new');
    clearInterruptedPlayback(startup);
    expect(readInterruptedPlayback()).toMatchObject({ episode: '5', sourceKey: 'hash:new' });
    clearInterruptedPlayback(readInterruptedPlayback()!);
    expect(readInterruptedPlayback()).toBeNull();
  });
  it('normalizes release identity from explicit hashes and magnet links', () => {
    expect(interruptedSourceKey({ infoHash: 'ABC123' })).toBe('hash:abc123');
    expect(interruptedSourceKey({ magnet: 'magnet:?xt=urn:btih:ABC123&dn=test' })).toBe('hash:abc123');
    expect(interruptedSourceKey({ title: 'Release B' })).not.toBe(interruptedSourceKey({ title: 'Release A' }));
  });
  it('stores only identity and expires old or future markers', () => {
    markInterruptedPlayback('anilist:123', 4);
    const marker = readInterruptedPlayback()!;
    expect(marker.animeId).toBe('anilist:123');
    expect(marker.episode).toBe('4');
    expect(Object.keys(marker).sort()).toEqual(['animeId', 'episode', 'savedAt']);
    expect(readInterruptedPlayback(marker.savedAt - 1)).toBeNull();
    expect(readInterruptedPlayback(marker.savedAt + 8 * 86400000)).toBeNull();
  });
  it('ignores invalid identities and clears without deleting watch history', () => {
    markInterruptedPlayback('', 1); expect(readInterruptedPlayback()).toBeNull();
    markInterruptedPlayback('1', -1); expect(readInterruptedPlayback()).toBeNull();
    localStorage.setItem('history-fixture', 'keep');
    markInterruptedPlayback('1', 2); clearInterruptedPlayback();
    expect(readInterruptedPlayback()).toBeNull();
    expect(localStorage.getItem('history-fixture')).toBe('keep');
  });
});
