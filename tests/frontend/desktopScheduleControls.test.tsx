import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopScheduleStatus, DesktopScheduleReminders } from '../../src/components/DesktopScheduleControls';
import type { DesktopReleaseSubscription } from '../../src/lib/desktopReminders';
afterEach(cleanup);
describe('compact schedule changes',()=>{
  it.each([['delayed','Delayed'],['postponed','Postponed'],['hiatus','On break']] as const)('retains %s with an unknown new date', (kind,label)=>{
    render(<DesktopScheduleStatus kind={kind} label={label} previousAt={Date.UTC(2026,9,18,12)} revisedAt={0} reason="Provider confirms a break" fetchedAt={Date.UTC(2026,9,18,8)} stale />);
    expect(screen.getByText(label)).toBeTruthy();expect(screen.getByText('Awaiting new date')).toBeTruthy();
    fireEvent.click(screen.getByText('Details'));expect(screen.getByText('Provider confirms a break')).toBeTruthy();expect(screen.getByText(/Last reported information/)).toBeTruthy();
    expect(document.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-18T12:00:00.000Z');
  });
  it('shows real previous and revised dates in order',()=>{
    render(<DesktopScheduleStatus kind="rescheduled" label="Rescheduled" previousAt={Date.UTC(2026,9,18,12)} revisedAt={Date.UTC(2026,9,25,13)} />);
    expect([...document.querySelectorAll('time')].map(item=>item.dateTime)).toEqual(['2026-10-18T12:00:00.000Z','2026-10-25T13:00:00.000Z']);
    expect(screen.queryByText('Awaiting new date')).toBeNull();
  });
  it.each([['cancelled','Cancelled'],['suspended','Suspended']] as const)('keeps %s distinct from postponement',(kind,label)=>{
    render(<DesktopScheduleStatus kind={kind} label={label} previousAt={0} revisedAt={0} />);
    expect(screen.getByText(label)).toBeTruthy();expect(screen.queryByText('Awaiting new date')).toBeNull();
  });
  it('leaves ordinary episode status alone',()=>{
    const view=render(<DesktopScheduleStatus kind="normal" label="Aired" previousAt={0} revisedAt={1} />);expect(view.container.textContent).toBe('');
  });
});
describe('reminder management',()=>{
  const sub={id:'anilist:1',title:'Delayed title'} as DesktopReleaseSubscription;
  const mount=(admin=false)=>{
    const handlers={onRemoveTitle:vi.fn(),onRemoveAlert:vi.fn(),onClearDelivered:vi.fn(),onTest:vi.fn()};
    render(<DesktopScheduleReminders subscriptions={[sub]} reminders={[{id:'1',title:'Scheduled title',animeId:1,airingAt:Date.now()+3600000,createdAt:1,delivery:'system',episode:2},{id:'old',title:'Delivered',animeId:1,airingAt:1,createdAt:1,delivery:'system',firedAt:2}]} permissionMessage="Notifications blocked in Windows settings" isAdmin={admin} {...handlers} />);
    return handlers;
  };
  it('uses one compact opener with independent tabs, removal and delivered cleanup',()=>{
    const handlers=mount();expect(screen.queryByRole('dialog')).toBeNull();expect(screen.getByText(/Next · Scheduled title/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Reminders · 1 titles'}));
    expect(screen.getByText('Notifications blocked in Windows settings.')).toBeTruthy();expect(screen.queryByRole('button',{name:'Test an alert'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Stop following Delayed title'}));expect(handlers.onRemoveTitle).toHaveBeenCalledWith('anilist:1');
    fireEvent.keyDown(screen.getByRole('tab',{name:'Followed titles'}),{key:'ArrowRight'});
    expect(screen.getByRole('tab',{name:'Scheduled alerts'}).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button',{name:'Remove scheduled alert for Scheduled title'}));expect(handlers.onRemoveAlert).toHaveBeenCalledWith('1');
    fireEvent.click(screen.getByRole('button',{name:'Clear delivered alerts'}));expect(handlers.onClearDelivered).toHaveBeenCalledOnce();
  });
  it('keeps testing inside the admin management drawer',()=>{
    const handlers=mount(true);expect(screen.queryByRole('button',{name:'Test an alert'})).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Reminders · 1 titles'}));fireEvent.click(screen.getByRole('button',{name:'Test an alert'}));expect(handlers.onTest).toHaveBeenCalledOnce();
  });
});
