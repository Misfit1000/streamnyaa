import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/context/AuthContext',()=>({useAuth:()=>({user:null,isAdmin:false})}));
vi.mock('../../src/components/DesktopWatchDesk',()=>({default:()=>null}));
vi.mock('../../src/api/desktopHomeBatch',async importOriginal=>({...(await importOriginal<any>()),fetchHomeShelf:vi.fn()}));
vi.mock('../../src/lib/desktopHomeReadiness',async importOriginal=>({...(await importOriginal<any>()),useDesktopHomeReadiness:vi.fn(()=>({episodesFor:()=>[],checking:false,pendingTitles:74,showUnavailable:false}))}));
import DesktopHome from '../../src/pages/DesktopHome';
import { fetchHomeShelf, homeShelfSelection } from '../../src/api/desktopHomeBatch';
import { mapAnilistToJikan } from '../../src/api/jikan';
import { recentHomeQuery } from '../../src/api/desktopRecentSchedule';
import { useDesktopHomeReadiness } from '../../src/lib/desktopHomeReadiness';
import { HOME_CHINESE_ANIMATION_KEY, HOME_BROWSING_EVENT, homeBrowseItems, homeBrowseVisible, isChineseAnimation, useHomeBrowsingPreference } from '../../src/lib/desktopHomeBrowsing';
import { loadLocalPlaybackHistory, saveLocalPlaybackHistoryItem } from '../../src/lib/desktop';
import { exportPersonalBackup, importPersonalBackup } from '../../src/lib/desktopPersonalBackup';
import { defaultShortcutConfig } from '../../src/lib/desktopShortcutConfig';
import { writeDesktopCatalog } from '../../src/lib/desktopCatalogCache';
const anime=(id:number,title:string,country?:string)=>({anilist_id:id,mal_id:id,title,countryOfOrigin:country,type:'ONA',status:'RELEASING',images:{jpg:{large_image_url:'https://images.example/poster.jpg'}},banner_image:'https://images.example/banner.jpg'});
const japanese=anime(301,'Japanese ONA fixture','JP'),chinese=anime(302,'Chinese animation fixture','CN'),unknown=anime(303,'Unknown origin fixture');
beforeEach(()=>{
 localStorage.clear();vi.clearAllMocks();
 vi.mocked(fetchHomeShelf).mockImplementation(async(key)=>({data:key==='home:recent'?[{...japanese,title:'New episode fixture',latestEpisode:7,recentFeedKind:'aired'}]:[japanese,chinese,unknown],fetchedAt:Date.now()}));
});
afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.clear();});
describe('Home origin preference',()=>{
 it('excludes only explicitly Chinese origin; ONA, Han characters and unknown origin are not country evidence',()=>{
  expect(isChineseAnimation(chinese)).toBe(true);expect(isChineseAnimation({country_of_origin:' cn '})).toBe(true);
  for(const value of [japanese,unknown,{title:'天官赐福',type:'ONA'},{countryOfOrigin:'JP',country_of_origin:'CN'},{countryOfOrigin:'TW'}])expect(homeBrowseVisible(value,false)).toBe(true);
  expect(homeBrowseVisible(chinese,false)).toBe(false);expect(homeBrowseVisible(chinese,true)).toBe(true);
 });
 it('keeps ordinary titles immediately without pretending they have verified sources',()=>{
  const items=homeBrowseItems([japanese,chinese,unknown],false,()=>[],()=>4);
  expect(items.map(item=>item.title)).toEqual([japanese.title,unknown.title]);
  expect(items.every(item=>item.homeReadyEpisode===undefined&&item.homeAvailabilityLabel===undefined)).toBe(true);
  expect(homeBrowseItems([japanese],false,()=>[1,4],()=>4)[0].homeReadyEpisode).toBe(4);
 });
 it('never substitutes an older available episode for an advertised new episode',()=>{
  const latest={...japanese,latestEpisode:7};
  expect(homeBrowseItems([latest],false,()=>[1,6],()=>1,true)[0]).toMatchObject({latestEpisode:7,homeReadyEpisode:undefined});
  expect(homeBrowseItems([latest],false,()=>[7],()=>1,true)[0].homeReadyEpisode).toBe(7);
 });
 it('persists independently from Explore and reacts to imports and storage changes',()=>{
  localStorage.setItem('streamnyaa.desktop.showUnavailableTitles.v1','true');
  const hook=renderHook(useHomeBrowsingPreference);expect(hook.result.current.showChineseAnimation).toBe(false);
  act(()=>hook.result.current.setShowChineseAnimation(true));expect(localStorage.getItem(HOME_CHINESE_ANIMATION_KEY)).toBe('true');
  expect(localStorage.getItem('streamnyaa.desktop.showUnavailableTitles.v1')).toBe('true');
  localStorage.setItem(HOME_CHINESE_ANIMATION_KEY,'false');act(()=>window.dispatchEvent(new Event(HOME_BROWSING_EVENT)));
  expect(hook.result.current.showChineseAnimation).toBe(false);
  localStorage.setItem(HOME_CHINESE_ANIMATION_KEY,'true');act(()=>window.dispatchEvent(new StorageEvent('storage')));
  expect(hook.result.current.showChineseAnimation).toBe(true);
 });
 it('keeps the current selection usable if preference persistence fails',()=>{
  const hook=renderHook(useHomeBrowsingPreference);vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Full','QuotaExceededError');});
  act(()=>hook.result.current.setShowChineseAnimation(true));expect(hook.result.current.showChineseAnimation).toBe(true);
 });
 it('requests and retains explicit AniList country metadata in ordinary and episode shelves',()=>{
  for(const key of ['home:seasonal','home:trending','home:top-airing','home:popular','home:upcoming','home:year:2025','home:recent'])expect(homeShelfSelection(key,false)).toContain('countryOfOrigin');
  expect(recentHomeQuery(18,123)).toContain('countryOfOrigin');
  expect(mapAnilistToJikan({id:1,title:{english:'Example'},countryOfOrigin:'CN'}).countryOfOrigin).toBe('CN');
 });
 it('round-trips the preference through personal backups and leaves it alone for older backups',async()=>{
  Object.defineProperty(window,'__TAURI__',{configurable:true,value:{core:{invoke:vi.fn(async()=>defaultShortcutConfig)}}});
  try {
   localStorage.setItem(HOME_CHINESE_ANIMATION_KEY,'true');const backup=await exportPersonalBackup();
   expect(JSON.parse(backup).extras[HOME_CHINESE_ANIMATION_KEY]).toBe('true');
   localStorage.setItem(HOME_CHINESE_ANIMATION_KEY,'false');const hook=renderHook(useHomeBrowsingPreference);
   await act(async()=>{await importPersonalBackup(backup);});expect(hook.result.current.showChineseAnimation).toBe(true);
   const legacy=JSON.parse(backup);delete legacy.extras[HOME_CHINESE_ANIMATION_KEY];localStorage.setItem(HOME_CHINESE_ANIMATION_KEY,'false');
   await act(async()=>{await importPersonalBackup(JSON.stringify(legacy));});expect(hook.result.current.showChineseAnimation).toBe(false);
  } finally { Object.defineProperty(window,'__TAURI__',{configurable:true,value:undefined}); }
 });
});
describe('Home page without source proof',()=>{
 const mount=()=>{const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});return render(<QueryClientProvider client={client}><MemoryRouter><DesktopHome/></MemoryRouter></QueryClientProvider>);};
 it('populates the banner and shelves, toggles Chinese animation, and opens the advertised episode',async()=>{
  const view=mount();await screen.findAllByText(japanese.title);await screen.findByText('New episode fixture');
  expect(screen.queryByText(chinese.title)).toBeNull();expect(screen.getAllByText(unknown.title).length).toBeGreaterThan(0);
  expect(screen.getByRole('link',{name:'Open anime'})).toBeTruthy();expect(screen.queryByText(/still need source verification/)).toBeNull();
  const episodeLink=screen.getByText('New episode fixture').closest('a');expect(episodeLink?.getAttribute('href')).toContain('ep=7');
  fireEvent.click(screen.getByRole('checkbox',{name:'Show Chinese animation'}));await screen.findAllByText(chinese.title);
  expect(localStorage.getItem(HOME_CHINESE_ANIMATION_KEY)).toBe('true');
  fireEvent.click(screen.getByRole('checkbox',{name:'Show Chinese animation'}));await waitFor(()=>expect(screen.queryByText(chinese.title)).toBeNull());
  const checked=vi.mocked(useDesktopHomeReadiness).mock.calls.at(-1)?.[0]||[];expect(checked.some(item=>item.countryOfOrigin==='CN')).toBe(false);
  view.unmount();
 });
 it('keeps personal Continue Watching at its original episode even without fresh proof',async()=>{
  saveLocalPlaybackHistoryItem({magnet:'magnet:?xt=urn:btih:'+'a'.repeat(40),title:'Saved release',animeTitle:'Saved anime',animeId:'anilist:900',episode:'3',savedAt:Date.now(),resumeSeconds:50});
  mount();await screen.findByText('Continue Watching');expect(loadLocalPlaybackHistory()[0].episode).toBe('3');
  const details=screen.getByRole('link',{name:'Open sources for Saved anime'});expect(details.getAttribute('href')).toContain('ep=3');
 });
 it('refreshes legacy cached country metadata while retaining usable cached browsing content',async()=>{
  const cached={...chinese,countryOfOrigin:undefined};
  writeDesktopCatalog('home:popular:safe',{data:[cached],fetchedAt:Date.now()},Date.now());
  mount();await waitFor(()=>expect(vi.mocked(fetchHomeShelf).mock.calls.some(([key])=>key==='home:popular')).toBe(true));
  await screen.findAllByText(japanese.title);await waitFor(()=>expect(screen.queryByText(chinese.title)).toBeNull());
 });
});
