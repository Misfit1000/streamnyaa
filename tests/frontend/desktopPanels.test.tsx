import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DesktopTrailer from '../../src/components/DesktopTrailer';
import DesktopActivityCenter from '../../src/components/DesktopActivityCenter';
import DesktopNotificationCenter from '../../src/components/DesktopNotificationCenter';
import { DESKTOP_SCHEDULE_UPDATES_KEY, loadDesktopScheduleUpdatePreferences } from '../../src/lib/scheduleRevisions';
vi.mock('../../src/components/DesktopActivitySummary',()=>({default:()=> <p>Transfers</p>,DesktopCatalogStatus:()=>null}));
afterEach(()=>{cleanup();localStorage.clear();});
it('keeps the iframe mounted during fullscreen rejection and full-window exit',async()=>{
 const request=vi.fn().mockRejectedValue(new Error('Denied'));Object.defineProperty(HTMLElement.prototype,'requestFullscreen',{configurable:true,value:request});
 const close=vi.fn();const view=render(<DesktopTrailer title="Example" url="https://www.youtube.com/embed/test?fs=1" onClose={close}/>);
 const iframe=view.baseElement.querySelector('iframe');expect(iframe?.allowFullscreen).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Fullscreen trailer'}));await waitFor(()=>expect(request).toHaveBeenCalledTimes(1));
 expect(view.baseElement.querySelector('iframe')).toBe(iframe);expect(screen.getByRole('button',{name:'Exit trailer fullscreen'})).toBeTruthy();
 fireEvent.keyDown(window,{key:'Escape'});expect(view.baseElement.querySelector('iframe')).toBe(iframe);
 fireEvent.keyDown(window,{key:'Escape'});expect(close).toHaveBeenCalledTimes(1);
 view.unmount();expect(document.querySelector('iframe')).toBeNull();
});
it('separates Activity from Bell read state and restores keyboard focus on dismissal',()=>{
 const now=Date.now();localStorage.setItem(DESKTOP_SCHEDULE_UPDATES_KEY,JSON.stringify([{id:'update',key:'anilist:1:1',animeId:'1',title:'Example',episode:1,previousAiringAt:now,airingAt:now+3600000,detectedAt:now,kind:'delayed'}]));
 render(<MemoryRouter><DesktopActivityCenter/><DesktopNotificationCenter/></MemoryRouter>);
 const activity=screen.getByRole('button',{name:'Activity'}),bell=screen.getByRole('button',{name:/Notifications/});
 fireEvent.click(activity);expect(screen.getByRole('dialog',{name:'Activity'})).toBeTruthy();expect(loadDesktopScheduleUpdatePreferences().lastReadAt).toBe(0);
 fireEvent.keyDown(window,{key:'Escape'});expect(screen.queryByRole('dialog',{name:'Activity'})).toBeNull();expect(document.activeElement).toBe(activity);
 fireEvent.click(bell);expect(bell.getAttribute('aria-expanded')).toBe('true');expect(activity.getAttribute('aria-expanded')).toBe('false');
 expect(loadDesktopScheduleUpdatePreferences().lastReadAt).toBeGreaterThan(0);
 fireEvent.keyDown(window,{key:'Escape'});expect(document.activeElement).toBe(bell);
});
