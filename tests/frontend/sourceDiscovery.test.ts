import { describe, expect, it, vi } from 'vitest';
import { runSourceSearchPass, sourceSearchPlan } from '../../src/lib/desktopSourceDiscovery';
import { buildSourceIdentity } from '../../src/lib/desktopSourceIdentity';

describe('bounded resumable source discovery', () => {
  it('searches films without episode tokens or an episode transport filter and keeps every alias',()=>{
    const identity=buildSourceIdentity({mal_id:59192,type:'MOVIE',title:'Demon Slayer Infinity Castle',synonyms:Array.from({length:9},(_,i)=>`Verified movie alias ${i}`)});
    const plan=sourceSearchPlan(identity,1);
    expect(plan.every(job=>job.scope==='title'&&job.episode===undefined&&!job.query.endsWith(' 01'))).toBe(true);
    expect(new Set(plan.map(job=>job.query)).size).toBe(identity.aliases.length);
    const series=sourceSearchPlan(buildSourceIdentity({...identity,mal_id:1,title:'Series',type:'TV',synonyms:identity.aliases}),2);
    expect(series.some(job=>job.query==='Verified movie alias 8 02')).toBe(true);
  });
  const jobs = () => sourceSearchPlan(buildSourceIdentity({ mal_id: 1, title_romaji: 'Romaji Example', title_english: 'English Example' }), 1);
  const merge = (items: { id: string }[]) => [...new Map(items.map(item => [item.id, item])).values()];
  it('continues beyond three matches, preserves alias order and resumes only pending pages', async () => {
    const fetch = vi.fn(async (job: ReturnType<typeof jobs>[number]) => ({ items: [{ id: `${job.query}:${job.category}:${job.page}` }], complete: true }));
    const first = await runSourceSearchPass({ jobs: jobs(), merge, fetch, requestLimit: 4 });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(first.items).toHaveLength(4);
    expect(first.complete).toBe(false);
    expect(first.partialReason).toBe('discovery-budget');
    expect(first.pending?.length).toBe(jobs().length - 4);
    const next = await runSourceSearchPass({ jobs: first.pending!, initial: first.items, merge, fetch, requestLimit: jobs().length });
    expect(next.complete).toBe(true);
    expect(next.items.length).toBe(jobs().length);
    expect(fetch.mock.calls[0][0].query).toContain('Romaji Example');
    expect(fetch.mock.calls[1][0].query).toContain('English Example');
  });
  it('retains successful lanes and returns pending jobs when local admission waits', async () => {
    const first = jobs().slice(0, 3);
    const result = await runSourceSearchPass({ jobs: first, merge, fetch: async job => {
      if (job.query===first[1].query&&job.category===first[1].category) throw { code: 'queued', origin: 'local-admission', retryAt: 60_000 };
      return { items: [{ id: job.query }], complete: true };
    } });
    expect(result.items.length).toBe(1);
    expect(result.complete).toBe(false);
    expect(result.pending).toContainEqual(first[1]);
    expect(result).toMatchObject({ partialReason: 'provider-failure', retryAt: 60_000 });
  });
  it('prunes only genuinely empty provider pages, never pages whose items were rejected by classification', async () => {
    const identity = buildSourceIdentity({ mal_id: 1, title: 'Example' });
    const plan = sourceSearchPlan(identity, 1);
    const fetch = vi.fn(async () => ({ items: [], complete: true, emptyPage: true }));
    const result = await runSourceSearchPass({ jobs: plan, merge, fetch });
    expect(result.complete).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(6);
    const filtered = await runSourceSearchPass({ jobs: plan, merge, requestLimit: 3, fetch: async () => ({ items: [], complete: true, emptyPage: false }) });
    expect(filtered.complete).toBe(false);
    expect(filtered.pending?.length).toBe(plan.length);
  });
  it('continues beyond page three and terminates a repeated provider page',async()=>{
    const job=jobs()[0];const fetch=vi.fn(async (job:typeof job)=>({items:[{id:String(job.page)}],emptyPage:false,pageFingerprint:job.page>4?'page4':`page${job.page}`,complete:true}));
    const first=await runSourceSearchPass({jobs:[job],merge,fetch,requestLimit:3});
    expect(first.pending?.[0].page).toBe(4);
    const next=await runSourceSearchPass({jobs:first.pending!,initial:first.items,merge,fetch});
    expect(fetch.mock.calls.map(([job])=>job.page)).toEqual([1,2,3,4,5]);expect(next.complete).toBe(true);
  });
  it('never reports stale or cancelled discovery as complete', async () => {
    const result = await runSourceSearchPass({ jobs: jobs().slice(0, 1), merge, fetch: async () => ({ items: [{ id: 'saved' }], complete: false, stale: true, fetchedAt: 10 }) });
    expect(result).toMatchObject({ complete: false, stale: true, fetchedAt: 10 });
    const controller = new AbortController(); controller.abort();
    await expect(runSourceSearchPass({ jobs: jobs(), merge, signal: controller.signal, fetch: async () => ({ items: [] }) })).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('stops failed transport lanes until recovery and preserves all title aliases', async () => {
    const aliases = Array.from({ length: 9 }, (_, index) => `Example alias ${index}`);
    const identity = buildSourceIdentity({ mal_id: 1, title: 'Example', synonyms: aliases });
    const plan = sourceSearchPlan(identity);
    expect(new Set(plan.map(job => job.query)).size).toBe(10);
    const fetch = vi.fn(async () => { throw new Error('Transport unavailable'); });
    const result = await runSourceSearchPass({ jobs: plan, merge, fetch });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.complete).toBe(false);
    expect(result.pending).toHaveLength(plan.length);
  });
  it('never relabels retained stale candidates as fresh when unfinished lanes recover', async () => {
    const first = await runSourceSearchPass({ jobs: jobs().slice(0, 1), merge,
      fetch: async () => ({ items: [{ id: 'saved-source' }], fetchedAt: 100, stale: true, complete: false }) });
    const publish = vi.fn();
    const resumed = await runSourceSearchPass({ jobs: first.pending!, initial: first.items, initialState: first, merge, publish,
      fetch: async () => ({ items: [{ id: 'fresh-source' }], fetchedAt: 200, stale: false, complete: true }) });
    expect(resumed.items).toHaveLength(2);
    expect(resumed).toMatchObject({ stale: true, fetchedAt: 100, complete: false, pending: [] });
    expect(publish.mock.calls.at(-1)?.[0]).toMatchObject({ stale: true, fetchedAt: 100, complete: false });
    const refreshed = await runSourceSearchPass({ jobs: jobs().slice(0, 1), merge,
      fetch: async () => ({ items: [{ id: 'fresh-source' }], fetchedAt: 300, stale: false, complete: true }) });
    expect(refreshed).toMatchObject({ stale: false, fetchedAt: 300, complete: true });
  });
});
