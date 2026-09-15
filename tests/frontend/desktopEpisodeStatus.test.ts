import { describe, expect, it } from 'vitest';
import { episodeMetadataStatus } from '../../src/lib/desktopEpisodeStatus';
import { desktopDataError } from '../../src/lib/desktopData';
const base = { enabled: true, fetching: false, hasTitles: false, hasEntries: false, now: 10_000, errorAt: 10_000 };
describe('episode metadata feedback', () => {
  it('does not call unpublished titles a connection failure', () => {
    expect(episodeMetadataStatus(base)).toMatchObject({canRetry: false, message: expect.stringContaining('not listed')});
  });
  it('identifies an upstream outage and disables retry during cooldown', () => {
    const error = desktopDataError('jikan', new Error('unavailable'), 504);
    expect(episodeMetadataStatus({...base,error})).toMatchObject({canRetry:true,waitingSeconds:30,message:expect.stringContaining('HTTP 504')});
    expect(episodeMetadataStatus({...base,error,now:40_000}).waitingSeconds).toBe(0);
  });
  it('honors Retry-After and keeps cached titles visible', () => {
    const error = {code:'rate-limited',provider:'jikan',message:'Wait',retryable:true,retryAfterMs:60_000};
    expect(episodeMetadataStatus({...base,error,hasTitles:true})).toMatchObject({waitingSeconds:60,message:expect.stringContaining('Available titles')});
  });
  it('does not offer a request without a canonical identity', () => {
    expect(episodeMetadataStatus({...base,enabled:false})).toMatchObject({canRetry:false,message:expect.stringContaining('verified MyAnimeList identity')});
  });
  it('does not claim titles are absent when verified streaming titles exist', () => {
    expect(episodeMetadataStatus({...base,hasTitles:true}).message).toBe('');
  });
  it('shows saved content and separates upcoming titles from outages', () => {
    expect(episodeMetadataStatus({...base,hasTitles:true,stale:true}).message).toContain('Saved');
    expect(episodeMetadataStatus({...base,upcoming:true,error:new Error('offline')})).toMatchObject({canRetry:false,message:'Episode titles will appear when published.'});
  });
});
