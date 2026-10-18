import { useState } from 'react';
import { ArrowRight, Bell, CalendarClock, Clock3 } from 'lucide-react';
import DesktopDrawer from './DesktopDrawer';
import type { DesktopReleaseSubscription, DesktopScheduleReminder } from '../lib/desktopReminders';

export type ScheduleStatusKind = 'delayed' | 'cancelled' | 'postponed' | 'rescheduled' | 'hiatus' | 'suspended' | 'tba' | 'normal';
function dateLabel(ms: number) {
  return new Date(ms).toLocaleString(undefined, {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}
export function DesktopScheduleStatus({kind,label,previousAt,revisedAt,reason,fetchedAt,stale}: {
  kind: ScheduleStatusKind; label: string; previousAt: number; revisedAt: number; reason?: string; fetchedAt?: number; stale?: boolean;
}) {
  if (kind === 'normal' || kind === 'tba') return null;
  return <div className="sn-schedule-status" data-kind={kind}>
    <div className="sn-schedule-status-line"><span className="sn-schedule-status-label"><CalendarClock size={14} />{label}</span>
      {previousAt > 0 && <time dateTime={new Date(previousAt).toISOString()} className="sn-schedule-previous">{dateLabel(previousAt)}</time>}
      {previousAt > 0 && revisedAt > 0 && <ArrowRight size={14} aria-label="changed to" />}
      {revisedAt > 0 ? <time dateTime={new Date(revisedAt).toISOString()}>{dateLabel(revisedAt)}</time>
        : !['cancelled','suspended'].includes(kind) ? <span>Awaiting new date</span> : null}
      <details><summary>Details</summary><div className="sn-schedule-status-detail"><p>{reason || 'The provider has reported a change to this release.'}</p>
        {fetchedAt ? <p><Clock3 size={12} />{stale ? 'Last reported information · ' : 'Last checked · '}{new Date(fetchedAt).toLocaleString()}</p> : <p>Last reported information · update time unavailable</p>}
      </div></details>
    </div>
  </div>;
}

export function DesktopScheduleReminders({subscriptions,reminders,permissionMessage,isAdmin,onRemoveTitle,onRemoveAlert,onClearDelivered,onTest}: {
  subscriptions: DesktopReleaseSubscription[]; reminders: DesktopScheduleReminder[]; permissionMessage: string; isAdmin: boolean;
  onRemoveTitle: (id:string)=>void; onRemoveAlert: (id:string)=>void; onClearDelivered:()=>void; onTest:()=>void;
}) {
  const [open,setOpen] = useState(false);
  const [tab,setTab] = useState<'followed'|'scheduled'>('followed');
  const active = reminders.filter(item=>!item.firedAt && item.airingAt > Date.now()).sort((a,b)=>a.airingAt-b.airingAt);
  const next = active[0];
  return <>
    <div className="sn-reminders-compact"><button type="button" className="sn-secondary-action" onClick={()=>setOpen(true)} aria-haspopup="dialog"><Bell size={16} />Reminders · {subscriptions.length} titles</button>
      <p title={next ? `${next.title} · ${dateLabel(next.airingAt)}` : undefined}>{next ? <>Next · {next.title} <span>{dateLabel(next.airingAt)}</span></> : 'Follow an episode’s bell for release updates.'}</p>
    </div>
    <DesktopDrawer open={open} onClose={()=>setOpen(false)} title="Reminders" subtitle="Manage your release notifications">
      <div role="tablist" aria-label="Reminder management" className="sn-reminder-tabs" onKeyDown={event=>{
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault(); const value = event.key === 'Home' ? 'followed' : event.key === 'End' ? 'scheduled' : tab === 'followed' ? 'scheduled' : 'followed';
        setTab(value); event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${value}"]`)?.focus();
      }}>
        <button id="reminder-tab-followed" data-tab="followed" role="tab" aria-selected={tab==='followed'} aria-controls="reminder-followed" tabIndex={tab==='followed'?0:-1} onClick={()=>setTab('followed')}>Followed titles</button>
        <button id="reminder-tab-scheduled" data-tab="scheduled" role="tab" aria-selected={tab==='scheduled'} aria-controls="reminder-scheduled" tabIndex={tab==='scheduled'?0:-1} onClick={()=>setTab('scheduled')}>Scheduled alerts</button>
      </div>
      <div id="reminder-followed" role="tabpanel" aria-labelledby="reminder-tab-followed" hidden={tab!=='followed'}>
        {subscriptions.length ? <ul className="sn-reminder-list">{subscriptions.map(item=><li key={item.id}><span>{item.title}<small>Broadcast and watch availability</small></span><button onClick={()=>onRemoveTitle(item.id)} aria-label={`Stop following ${item.title}`}>Remove</button></li>)}</ul> : <p className="sn-reminder-empty">Tap a bell beside an episode to follow its title, including when its new date is unknown.</p>}
      </div>
      <div id="reminder-scheduled" role="tabpanel" aria-labelledby="reminder-tab-scheduled" hidden={tab!=='scheduled'}>
        {active.length ? <ul className="sn-reminder-list">{active.map(item=><li key={item.id}><span>{item.title}<small>Episode {item.episode || '?'} · {dateLabel(item.airingAt)}</small></span><button onClick={()=>onRemoveAlert(item.id)} aria-label={`Remove scheduled alert for ${item.title}`}>Remove</button></li>)}</ul> : <p className="sn-reminder-empty">No timed alerts scheduled. Followed titles stay subscribed while awaiting a new date.</p>}
        {reminders.some(item=>item.firedAt) && <button type="button" className="sn-secondary-action mt-3" onClick={onClearDelivered}>Clear delivered alerts</button>}
      </div>
      <div className="sn-reminder-guidance"><p>{permissionMessage}.</p><p>Get separate alerts for broadcast time and matching watch sources. Personal and Global schedule-change choices are in Settings. Checks continue in the tray; quitting stops them.</p>
        {isAdmin && <button type="button" onClick={onTest} className="sn-secondary-action">Test an alert</button>}
      </div>
    </DesktopDrawer>
  </>;
}
