import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn(async () => true), requestPermission: vi.fn(async () => 'granted'), sendNotification: vi.fn(async () => undefined),
}));
import {
  DESKTOP_SCHEDULE_REMINDERS_KEY, readDesktopReleaseSubscriptions, readDesktopScheduleReminders,
  reconcileDesktopReminderSchedule, releaseSubscriptionForAnime, writeDesktopReleaseSubscriptions,
  toggleDesktopReleaseSubscription, startDesktopReminderBridge,
} from '../../src/lib/desktopReminders';
import { isPermissionGranted } from '@tauri-apps/plugin-notification';
import { DESKTOP_RELEASE_EPISODES_KEY, DESKTOP_RELEASE_SUBSCRIPTIONS_KEY } from '../../src/lib/desktopReminders';
import { DESKTOP_AVAILABILITY_KEY, readDesktopAvailability } from '../../src/lib/desktopAvailability';

describe('desktop release subscriptions', () => {
  afterEach(() => { localStorage.clear(); delete window.__TAURI__; vi.mocked(isPermissionGranted).mockResolvedValue(true); });
  const anime={anilist_id:123,mal_id:456,title:'Example Season 2',type:'TV',airingEpisode:3,airingAt:1_800_000_000};
  it('builds qualified installment identity and preserves separate IDs', () => {
    const sub=releaseSubscriptionForAnime(anime)!;
    expect(sub).toMatchObject({id:'anilist:123',anilistId:123,malId:456,reminderOffsetMinutes:10});
    expect(sub.sourceIdentity).toMatchObject({animeId:'anilist:123',seasonNumber:2,sequel:true});
  });
  it('migrates only unfired legacy reminders with one unambiguous canonical match', async () => {
    localStorage.setItem(DESKTOP_SCHEDULE_REMINDERS_KEY,JSON.stringify([
      {id:'456:episode-3:old',animeId:456,title:anime.title,episode:3,airingAt:1_800_000_000_000,reminderOffsetMinutes:10,createdAt:1},
      {id:'fired',animeId:456,title:anime.title,episode:2,airingAt:1_700_000_000_000,reminderOffsetMinutes:10,createdAt:1,firedAt:2},
    ]));
    await reconcileDesktopReminderSchedule([anime]);
    expect(readDesktopReleaseSubscriptions()[0]).toMatchObject({id:'anilist:123'});
    expect(readDesktopReleaseSubscriptions()[0].oneShotEpisode).toBeUndefined();
    expect(readDesktopScheduleReminders().map(value=>value.id)).toEqual(['fired']);
  });
  it('preserves ambiguous legacy data rather than subscribing an unrelated anime', async () => {
    localStorage.setItem(DESKTOP_SCHEDULE_REMINDERS_KEY,JSON.stringify([{id:'legacy',animeId:456,title:'Example',episode:3,airingAt:1_800_000_000_000,reminderOffsetMinutes:10,createdAt:1}]));
    await reconcileDesktopReminderSchedule([anime,{id:456,title:'Unrelated',airingEpisode:3,airingAt:1_800_000_000}]);
    expect(readDesktopReleaseSubscriptions()).toEqual([]); expect(readDesktopScheduleReminders()).toHaveLength(1);
  });
  it('failed native persistence does not claim that a subscription was saved', async () => {
    window.__TAURI__={invoke:vi.fn(async () => {throw new Error('disk full');})} as any;
    await expect(writeDesktopReleaseSubscriptions([releaseSubscriptionForAnime(anime)!])).rejects.toThrow('disk full');
    expect(readDesktopReleaseSubscriptions()).toEqual([]);
  });
  it('permission errors preserve existing subscriptions and do not enqueue new alerts', async () => {
    const invoke=vi.fn(async () => undefined); window.__TAURI__={invoke} as any;
    vi.mocked(isPermissionGranted).mockRejectedValueOnce(new Error('permission failed'));
    const result=await toggleDesktopReleaseSubscription(anime);
    expect(result).toMatchObject({saved:false,permission:'error'});
    expect(invoke).not.toHaveBeenCalledWith('sync_desktop_reminder_subscriptions',expect.anything());
    expect(readDesktopReleaseSubscriptions()).toEqual([]);
  });
  it('passes exact schedule identity and clean cancellation to the native worker', async () => {
    const invoke=vi.fn(async (command:string,args:any) => {
      if(command==='sync_desktop_reminder_subscriptions') return {version:2,subscriptions:args.subscriptions,episodes:[],availability:[]};
      return undefined;
    });
    window.__TAURI__={invoke} as any;
    expect((await toggleDesktopReleaseSubscription(anime)).saved).toBe(true);
    expect(invoke).toHaveBeenCalledWith('reconcile_desktop_reminder_schedule',{items:[{animeId:'anilist:123',episode:3,airingAt:1_800_000_000_000,blocked:false}]});
    expect((await toggleDesktopReleaseSubscription(anime)).removed).toBe(true);
    expect(readDesktopReleaseSubscriptions()).toEqual([]);
  });
  it('restores durable native delivery state without marking permission failures delivered', async () => {
    const listeners=new Map<string,(event:any)=>void>(); const cleanup=vi.fn();
    const native={version:2,subscriptions:[releaseSubscriptionForAnime(anime)!],episodes:[{key:'anilist:123:episode-3',animeId:'anilist:123',episode:3,airingAt:1_800_000_000_000,airedNotifiedAt:10,blocked:false}],availability:[]};
    const invoke=vi.fn(async (command:string) => command==='get_desktop_reminder_state'?native:undefined);
    window.__TAURI__={invoke,event:{listen:vi.fn(async (event:string,listener:any) => {listeners.set(event,listener);return cleanup;})}} as any;
    const stop=await startDesktopReminderBridge();
    expect(JSON.parse(localStorage.getItem(DESKTOP_RELEASE_EPISODES_KEY)!)[0].airedNotifiedAt).toBe(10);
    expect(JSON.parse(localStorage.getItem(DESKTOP_RELEASE_SUBSCRIPTIONS_KEY)!)[0].id).toBe('anilist:123');
    expect(invoke).toHaveBeenCalledWith('set_desktop_reminder_permission',{granted:true}); stop(); expect(cleanup).toHaveBeenCalledTimes(2);
  });
  it('mirrors only valid imported availability and restores newer native evidence first', async () => {
    const now=Date.now();
    const current={key:'anilist:123:episode-3',animeId:'anilist:123',episode:3,scope:'episode',status:'available',checkedAt:now,expiresAt:now+300_000,complete:false,evidence:'exact-source'};
    const native={version:2,subscriptions:[],episodes:[],availability:[current]};
    const invoke=vi.fn(async (command:string) => ['get_desktop_reminder_state','sync_desktop_reminder_subscriptions'].includes(command)?native:undefined);
    window.__TAURI__={invoke,event:{listen:vi.fn(async () => () => {})}} as any;
    const stop=await startDesktopReminderBridge();
    localStorage.setItem(DESKTOP_AVAILABILITY_KEY,JSON.stringify([{...current,checkedAt:now-1,status:'unknown'},{...current,key:'mal:123:episode-3'}]));
    window.dispatchEvent(new CustomEvent('streamnyaa.desktop.reminders.imported'));
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('record_desktop_source_availability',{record:expect.objectContaining({checkedAt:now-1})}));
    expect(invoke).not.toHaveBeenCalledWith('record_desktop_source_availability',{record:expect.objectContaining({key:'mal:123:episode-3'})});
    expect(readDesktopAvailability({anilist_id:123},3)?.checkedAt).toBe(now);
    stop();
  });
});
