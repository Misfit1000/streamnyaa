import React from 'react';
import { act,cleanup,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const {auth,remote,push}=vi.hoisted(()=>({auth:{current:{} as any},remote:vi.fn(),push:vi.fn(async(..._args:any[])=>({}))}));
vi.mock('../../src/context/AuthContext',()=>({useAuth:()=>auth.current}));
vi.mock('../../src/lib/accountSync',async importOriginal=>({...await importOriginal<any>(),fetchAccountSync:remote,replaceAccountSyncData:push}));
vi.mock('../../src/lib/desktop',()=>({loadDesktopWatchProgress:()=>[],replaceDesktopWatchProgress:vi.fn(),subscribeDesktopWatchProgress:()=>()=>{}}));
import { useStore } from '../../src/store/useStore';
import { WebAccountSyncProvider } from '../../src/context/WebAccountSyncContext';
const owner=(id:string)=>({user:{id,email:id+'@example.test'},session:{access_token:id,user:{id}}});
const View=()=> <WebAccountSyncProvider><Titles/></WebAccountSyncProvider>;
function Titles(){const items=useStore(state=>state.myList);return <div>{items.map(item=><span key={item.mal_id}>{item.title}</span>)}</div>;}
beforeEach(()=>{localStorage.clear();remote.mockReset();push.mockClear();useStore.setState({myList:[],likedAnimes:[],likes:[]});});
afterEach(()=>cleanup());
it('keeps owner projections separate and fences late account responses',async()=>{
 let resolveA!:(value:any)=>void;remote.mockImplementation((session:any)=>session.access_token==='a'?new Promise(resolve=>{resolveA=resolve;}):Promise.resolve({library:[],watchHistory:[]}));
 auth.current=owner('a');useStore.setState({myList:[{mal_id:12,title:'Account A title'} as any]});
 const view=render(<View/>);await vi.waitFor(()=>expect(remote).toHaveBeenCalledOnce());
 auth.current=owner('b');view.rerender(<View/>);await vi.waitFor(()=>expect(remote).toHaveBeenCalledTimes(2));expect(screen.queryByText('Account A title')).toBeNull();
 await act(async()=>resolveA({library:[{animeId:'12',animeTitle:'Late A title',anime:{mal_id:12,title:'Late A title'},bookmarked:true,liked:false,updatedAt:new Date().toISOString()}],watchHistory:[]}));
 expect(screen.queryByText('Late A title')).toBeNull();expect(push.mock.calls.every(([session]:any)=>session.access_token==='b')).toBe(true);
 auth.current=owner('a');remote.mockResolvedValue({library:[],watchHistory:[]});view.rerender(<View/>);await screen.findByText('Account A title');
});
