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
 let release!:(response:Response)=>void,readStatus!:(response:Response)=>void;
 const fetcher=vi.fn(async(input:any,init?:RequestInit)=>{
  if(init?.method==='POST')return await new Promise<Response>(resolve=>{release=resolve;});
  if(String(input).includes('generation-status'))return await new Promise<Response>(resolve=>{readStatus=resolve;});
  return new Response(JSON.stringify(summary));
 });vi.stubGlobal('fetch',fetcher);
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 client.setQueryData(['admin-jobs','owner',job.id],{jobs:[{...job,status:'skipped',active:false,reason:'An old finished attempt.'}]});
 render(<MemoryRouter><QueryClientProvider client={client}><AdminDashboard/></QueryClientProvider></MemoryRouter>);
 await screen.findByText(/Access checked when writing/);const button=screen.getByRole('button',{name:'Generate'});
 fireEvent.click(button);expect(button.hasAttribute('disabled')).toBe(true);
 expect(screen.getByRole('status').textContent).toContain('Starting draft preparation');
 release(new Response(JSON.stringify({accepted:true,jobs:[job]}),{status:202}));
 await waitFor(()=>expect(readStatus).toBeDefined());
 expect(screen.getByRole('status').textContent).toContain('Draft preparation is running');
 expect(localStorage.getItem('streamnyaa.admin.jobs.owner')).toContain(job.id);
 readStatus(new Response(JSON.stringify({jobs:[{...job,status:'awaiting_review',active:false,resumeRequired:true}]})));
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
it('explains automatic Gemini retry while keeping a paused job distinct',()=>{
 const retrying={...job,stage:'Waiting for Gemini retry',retryAt:Date.now()+30000};
 expect(generationFeedback([retrying])).toContain('will retry automatically');
 expect(generationFeedback([{...retrying,active:false,resumeRequired:true}])).toContain('Generation paused');
});
it('shows a saved draft as written and never offers Resume for an approval gate',async()=>{
 const ready={...job,status:'awaiting_review',active:false,resumeRequired:true};
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({...summary,jobs:[ready]}))));
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<MemoryRouter><QueryClientProvider client={client}><AdminDashboard/></QueryClientProvider></MemoryRouter>);
 await screen.findByText(/Draft written\. Generate saves a private draft/);
 expect(screen.getByRole('button',{name:'Review saved draft'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Resume job'})).toBeNull();client.clear();
});
it('reuses a persisted manual request after a lost response, then assigns a new ID to the next deliberate run',async()=>{
 const bodies:any[]=[];let fail=true;
 vi.stubGlobal('fetch',vi.fn(async(_input:any,init?:RequestInit)=>{
  if(init?.method==='POST'){bodies.push(JSON.parse(String(init.body)));if(fail){fail=false;throw new TypeError('Controlled lost response');}return new Response(JSON.stringify({accepted:true,jobs:[{...job,status:'awaiting_review',active:false}]}),{status:202});}
  return new Response(JSON.stringify(summary));
 }));
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const ui=()=> <MemoryRouter><QueryClientProvider client={client}><AdminDashboard/></QueryClientProvider></MemoryRouter>;
 const first=render(ui());await screen.findByText(/Access checked when writing/);
 fireEvent.click(screen.getByRole('button',{name:'Generate'}));await screen.findByText('Controlled lost response');
 const pending=JSON.parse(localStorage.getItem('streamnyaa.admin.request.owner')!);expect(pending.id).toBe(bodies[0].requestId);
 first.unmount();client.clear();render(ui());await screen.findByText(/Access checked when writing/);
 fireEvent.click(screen.getByRole('button',{name:'Generate'}));await waitFor(()=>expect(bodies).toHaveLength(2));
 expect(bodies[1].requestId).toBe(bodies[0].requestId);await waitFor(()=>expect(localStorage.getItem('streamnyaa.admin.request.owner')).toBeNull());
 await waitFor(()=>expect(screen.getByRole('button',{name:'Generate'}).hasAttribute('disabled')).toBe(false));
 fireEvent.click(screen.getByRole('button',{name:'Generate'}));await waitFor(()=>expect(bodies).toHaveLength(3));expect(bodies[2].requestId).not.toBe(bodies[1].requestId);client.clear();
});
