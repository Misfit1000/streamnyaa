import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import AdminBlogManager from '../../src/components/AdminBlogManager';
const article={slug:'saved-article',title:'A published fixture',updated_at:'2026-10-24T00:00:00Z',admin_revision:2};
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
it('does not reset a quickly selected next page with an unchanged initial search debounce',async()=>{
 vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn(async(url:any)=>Response.json(String(url).includes('cursor=')?{entries:[{...article,slug:'second',title:'Second page article'}]}:{entries:[article],nextCursor:'fixture-next'})));
 const {client}=mount();await vi.waitFor(()=>expect(screen.getByText(article.title)).toBeTruthy());fireEvent.click(screen.getByRole('button',{name:'Next'}));await vi.waitFor(()=>expect(screen.getByText('Second page article')).toBeTruthy());await act(()=>vi.advanceTimersByTimeAsync(350));expect(screen.getByText('Second page article')).toBeTruthy();expect(screen.getByText(/Page 2/)).toBeTruthy();client.clear();
});
function mount(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});const onAccepted=vi.fn(),onChanged=vi.fn();const view=render(<MemoryRouter><QueryClientProvider client={client}><AdminBlogManager accountId="owner" token="private-fixture" onAccepted={onAccepted} onChanged={onChanged}/></QueryClientProvider></MemoryRouter>);return{client,view,onChanged};}
it('loads summaries only, confirms recoverable trash once and restores using the current revision',async()=>{
 let finish!:(r:Response)=>void;const fetcher=vi.fn(async(url:any,init:any)=>init?.method==='POST'?await new Promise<Response>(r=>finish=r):Response.json({entries:[{...article,admin_revision:String(url).includes('trash-articles')?3:2}]}));vi.stubGlobal('fetch',fetcher);
 const {client,onChanged}=mount();await screen.findByText(article.title);expect(fetcher).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Move to Trash'}));expect(fetcher).toHaveBeenCalledTimes(1);fireEvent.click(screen.getByRole('button',{name:'Confirm move to Trash'}));fireEvent.click(screen.getByRole('button',{name:'Moving…'}));expect(fetcher.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1);
 expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body)).toMatchObject({kind:'article',id:article.slug,revision:2,action:'trash'});finish(Response.json({ok:true}));await waitFor(()=>expect(onChanged).toHaveBeenCalledOnce());
 fireEvent.click(screen.getByRole('tab',{name:'Trash'}));await screen.findByRole('button',{name:'Restore'});fireEvent.click(screen.getByRole('button',{name:'Restore'}));expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body)).toMatchObject({revision:3,action:'restore'});finish(Response.json({ok:true}));client.clear();
});
it('retrieves a rejected draft on demand and shows feedback without approval controls',async()=>{
 const job={id:'00000000-0000-0000-0000-000000000001',rejected_title:'Saved unsuccessful guide',status:'skipped',admin_revision:0};const fetcher=vi.fn(async(url:any)=>String(url).includes('generation-review')?Response.json({draft:{reviewable:false,article:{headline:job.rejected_title,excerpt:'Private draft',paragraphs:[],sections:[]},brief:{subject:'Fixture',sources:[]},errors:['Blocks 1 and 3 repeat the same explanation.']}}):Response.json({entries:String(url).includes('view=drafts')?[job]:[article]}));vi.stubGlobal('fetch',fetcher);
 const {client}=mount();await screen.findByText(article.title);fireEvent.click(screen.getByRole('tab',{name:'Drafts'}));fireEvent.click(await screen.findByRole('button',{name:'Inspect draft and feedback'}));await screen.findByText('Why this draft was not published');expect(screen.getByText(/Blocks 1 and 3/)).toBeTruthy();expect(screen.queryByRole('button',{name:'Approve and publish'})).toBeNull();expect(fetcher.mock.calls.filter(call=>String(call[0]).includes('generation-review'))).toHaveLength(1);client.clear();
});
