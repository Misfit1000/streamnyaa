import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({queue:{version:1,limitBps:0,items:[] as any[]},changed:()=>{}}));
vi.mock('../../src/lib/desktopDownloads',()=>({getDownloadQueue:vi.fn(async()=>({...mocks.queue,items:mocks.queue.items.map(i=>({...i}))})),listenDownloadsChanged:vi.fn(async(fn:any)=>{mocks.changed=fn;return()=>{};}),controlDownloads:vi.fn()}));
vi.mock('../../src/lib/desktopOfflineProgress',()=>({synchronizeOfflineProgress:vi.fn()}));
vi.mock('../../src/components/DesktopDownloads',()=>({default:()=> <div>File selection</div>}));
import DesktopDownloadManager from '../../src/components/DesktopDownloadManager';
const item={id:'a',title:'Fixture episode',state:'downloading',downloaded:100,total:1000};
beforeEach(()=>{mocks.queue.items=[];HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};});
afterEach(cleanup);
const mount=()=>render(<MemoryRouter><DesktopDownloadManager/></MemoryRouter>);
const change=async(items:any[])=>{await act(async()=>{mocks.queue.items=items;mocks.changed();});};
describe('compact download panel',()=>{
 it('stays hidden when empty, opens on transfer, and hides on completion',async()=>{await act(async()=>{mount();});await change([item]);await screen.findByLabelText('Active downloads');await change([{...item,state:'completed'}]);await waitFor(()=>expect(screen.queryByLabelText('Active downloads')).toBeNull());});
 it('does not reopen on polling after dismissal but opens on resume',async()=>{mocks.queue.items=[item];mount();await screen.findByLabelText('Active downloads');fireEvent.click(screen.getByLabelText('Dismiss download panel'));await change([{...item,downloaded:200}]);expect(screen.queryByLabelText('Active downloads')).toBeNull();await change([{...item,state:'paused'}]);await change([item]);await screen.findByLabelText('Active downloads');});
 it('keeps metadata selection out of the active panel',async()=>{mocks.queue.items=[{...item,chooseFiles:true}];mount();await waitFor(()=>expect(screen.queryByLabelText('Active downloads')).toBeNull());});
});
