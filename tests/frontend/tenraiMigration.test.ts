import { afterEach, describe, expect, it, vi } from 'vitest';
import { supportedMalMetadataPath } from '../../src/lib/malMetadataProvider';
import { desktopSeriesArtwork } from '../../src/lib/desktopArtwork';
import { resolveEpisodeArtwork } from '../../src/lib/desktopEpisodeArtwork';
import { episodeMetadataStatus } from '../../src/lib/desktopEpisodeStatus';
import { recoveryDelay } from '../../src/lib/desktopAutoRecovery';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('public metadata migration', () => {
  it.each(['/anime/52991/episodes?page=2','/anime/52991/full','/anime/52991/characters','/anime/52991/news','/anime?q=Frieren','/seasons/2026/fall','/schedules?filter=monday','/top/anime?page=2'])('accepts a supported public route: %s', path => {
    expect(supportedMalMetadataPath(path)).toBe(path);
  });
  it.each(['/watch/episodes','/users/1','https://evil.test/anime/1','//evil.test/anime/1','/anime/../users','/anime/%2e%2e/users','/anime/1#fragment','/anime/1\\users'])('rejects unsupported/private routes: %s', path => {
    expect(supportedMalMetadataPath(path)).toBeNull();
  });
  it.each(['tenrai','jikan'])('serves %s gateway clients through Tenrai with real provenance', async provider => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{mal_id:1,title:'Real episode'}]})));
    vi.stubGlobal('fetch',fetch);
    const { default: handler } = await import('../../api/stream-sources');
    const record: any = { headers:{} };
    const res: any = {setHeader:(k:string,v:string)=>record.headers[k]=v,status:(v:number)=>{record.status=v;return res;},json:(v:unknown)=>{record.body=v;return res;}};
    await handler({method:'GET',query:{provider,path:'/anime/52991/episodes'}},res);
    expect(record.status).toBe(200);
    expect(fetch.mock.calls[0][0]).toBe('https://api.tenrai.org/v1/anime/52991/episodes');
    expect(record.body.streamnyaa).toMatchObject({provider:'tenrai',adapterVersion:1,stale:false});
  });
  it.each([403,429,503])('preserves upstream status %s and Retry-After', async status => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({message:'Wait'}),{status,headers:{'Retry-After':'90'}})));
    const { default: handler } = await import('../../api/stream-sources');
    const record:any={headers:{}};
    const res:any={setHeader:(k:string,v:string)=>record.headers[k]=v,status:(v:number)=>{record.status=v;return res;},json:(v:unknown)=>{record.body=v;return res;}};
    await handler({method:'GET',query:{provider:'tenrai',path:'/anime/1/episodes'}},res);
    expect(record.status).toBe(status); expect(record.headers['Retry-After']).toBe('90');
  });
  it('uses bounded recovery and hides technical errors from ordinary accounts', () => {
    expect([0,1,2,3,9].map(recoveryDelay)).toEqual([30000,60000,120000,300000,300000]);
    const input={enabled:true,fetching:false,hasTitles:true,hasEntries:true,error:{provider:'tenrai',code:'error',retryable:true,message:'Unavailable',statusCode:503}};
    expect(episodeMetadataStatus(input).message).not.toContain('HTTP');
    expect(episodeMetadataStatus({...input,administrator:true}).message).toContain('HTTP 503');
    expect(episodeMetadataStatus({...input,error:{...input.error,code:'invalid',retryable:false,statusCode:501}}).canRetry).toBe(false);
  });
});
describe('consistent series artwork', () => {
  it('keeps identity separate and never treats a generic/MAL ID as AniList identity', () => {
    const artwork=desktopSeriesArtwork({id:52991,mal_id:52991,title:'Title',poster:'https://images.test/poster.jpg'});
    expect(artwork.anilistId).toBeUndefined(); expect(artwork.malId).toBe(52991);
    expect(artwork.candidates).toEqual([{url:'https://images.test/poster.jpg',role:'poster'}]);
  });
  it('uses the same series art across episodes without discarding saved stills', () => {
    const resolver=resolveEpisodeArtwork({anilist_id:1,mal_id:2,bannerImage:'https://images.test/banner.jpg',streamingEpisodes:[{episode:1,thumbnail:'https://images.test/still.jpg'}]});
    expect(resolver.forEpisode(1,false,true).candidates).toEqual(resolver.forEpisode(2,false,true).candidates);
    expect(resolver.streaming.get(1).thumbnail).toContain('still.jpg');
    expect(resolver.forEpisode(1,true,true).label).toContain('spoilers hidden');
  });
});
