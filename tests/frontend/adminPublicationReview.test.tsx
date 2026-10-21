import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import AdminPublicationReview from '../../src/components/AdminPublicationReview';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const job={id:'00000000-0000-0000-0000-000000000001',status:'awaiting_review'};
const revision='a'.repeat(64);
const saved={draft:{revision,article:{headline:'Private verified announcement',excerpt:'A private draft.',paragraphs:[{text:'The primary announcement confirms the release change.',sourceIds:['official']}],sections:[]},brief:{subject:'Fixture Anime',sources:[{id:'official',title:'Publisher',url:'https://example.org/announcement',text:'The original announcement.',publishedAt:'2026-10-20'}]}}};
it('publishes only the reviewed revision and prevents duplicate activation while saving',async()=>{
  let finish!:(response:Response)=>void;
  const fetcher=vi.fn(async(_input:any,init?:RequestInit)=>init?.method==='POST'?await new Promise<Response>(resolve=>{finish=resolve;}):new Response(JSON.stringify(saved)));
  vi.stubGlobal('fetch',fetcher);const accepted=vi.fn(),client=new QueryClient();
  render(<QueryClientProvider client={client}><AdminPublicationReview accountId="owner" token="fixture-token" jobs={[job]} automaticEnabled={false} onAccepted={accepted}/></QueryClientProvider>);
  expect(fetcher).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Review saved draft'));
  await screen.findByText(saved.draft.article.headline);
  expect(fetcher.mock.calls[0][1]).toMatchObject({cache:'no-store',headers:{Authorization:'Bearer fixture-token'}});
  const button=screen.getByRole('button',{name:'Approve and publish'});fireEvent.click(button);fireEvent.click(button);
  expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1);
  expect(JSON.parse(String(fetcher.mock.calls.at(-1)?.[1]?.body))).toMatchObject({jobId:job.id,action:'approve',revision});
  finish(new Response(JSON.stringify({jobs:[job]}),{status:202}));await waitFor(()=>expect(accepted).toHaveBeenCalledOnce());
  expect(screen.queryByRole('region',{name:'Private draft review'})).toBeNull();client.clear();
});
it('cancels a private draft read and removes its cache on account unmount',async()=>{
  let signal:AbortSignal|undefined;
  vi.stubGlobal('fetch',vi.fn((_input:any,init:any)=>{signal=init.signal;return new Promise(()=>{});}));
  const client=new QueryClient(),view=render(<QueryClientProvider client={client}><AdminPublicationReview accountId="owner-a" token="fixture-token" jobs={[job]} automaticEnabled={false} onAccepted={()=>{}}/></QueryClientProvider>);
  fireEvent.click(screen.getByText('Review saved draft'));await waitFor(()=>expect(signal).toBeDefined());
  view.unmount();expect(signal!.aborted).toBe(true);await waitFor(()=>expect(client.getQueryCache().findAll({queryKey:['admin-draft','owner-a']})).toHaveLength(0));client.clear();
});
