import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import AdminDashboard from '../../src/pages/AdminDashboard';
import { generationFeedback, generationJobLabel } from '../../src/lib/adminGeneration';
vi.mock('../../src/context/AuthContext',()=>({useAuth:()=>({session:{access_token:'fixture'},user:{id:'owner',email:'admin@example.test'},isAdmin:true,loading:false})}));
const job={id:'00000000-0000-0000-0000-000000000002',kind:'daily',status:'pending',active:true,stage:'Activity report discovery',published:[]};
const summary={generatedBlogArticles:4,admins:{env:[],stored:[],tableReady:true},jobs:[],config:{geminiConfigured:true},publicationPolicy:{automaticEnabled:false}};
afterEach(()=>{cleanup();vi.unstubAllGlobals();localStorage.clear();});
it('Generate acknowledges the saved job, follows status and reports a private draft instead of zero published',async()=>{
 let release!:(response:Response)=>void;
 const fetcher=vi.fn(async(input:any,init?:RequestInit)=>{
  if(init?.method==='POST')return await new Promise<Response>(resolve=>{release=resolve;});
  if(String(input).includes('generation-status'))return new Response(JSON.stringify({jobs:[{...job,status:'awaiting_review',active:false,resumeRequired:true}]}));
  return new Response(JSON.stringify(summary));
 });vi.stubGlobal('fetch',fetcher);
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<MemoryRouter><QueryClientProvider client={client}><AdminDashboard/></QueryClientProvider></MemoryRouter>);
 await screen.findByText('Configured');const button=screen.getByRole('button',{name:'Generate'});
 fireEvent.click(button);expect(button.hasAttribute('disabled')).toBe(true);
 expect(screen.getByRole('status').textContent).toContain('Starting draft preparation');
 release(new Response(JSON.stringify({accepted:true,jobs:[job]}),{status:202}));
 await screen.findByText(/A draft is saved privately and ready for review/);
 expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1);
 expect(fetcher.mock.calls.some(call=>String(call[0]).includes(job.id))).toBe(true);
 expect(screen.queryByText(/0 articles published/)).toBeNull();
 await waitFor(()=>expect(button.hasAttribute('disabled')).toBe(false));client.clear();
});
it('dates and provider deadlines distinguish old paused jobs and prevent premature Resume',async()=>{
 const paused={...job,active:false,resumeRequired:true,retryAt:Date.now()+120000,createdAt:'2026-10-22T00:00:00Z',reason:'Evidence provider graphql.anilist.co returned HTTP 500.'};
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({...summary,jobs:[paused]}))));
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<MemoryRouter><QueryClientProvider client={client}><AdminDashboard/></QueryClientProvider></MemoryRouter>);
 const button=await screen.findByRole('button',{name:'Waiting for provider'});expect(button.hasAttribute('disabled')).toBe(true);
 expect(screen.getByText(/daily · Oct 22/).textContent).toContain('Paused');
 expect(generationFeedback([paused])).toContain('Retry after');expect(generationFeedback([paused])).not.toContain('0 articles');
 expect(generationJobLabel({...paused,status:'skipped'})).toBe('No eligible article');client.clear();
});
