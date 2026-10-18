import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DesktopNotificationCenter from '../../src/components/DesktopNotificationCenter';
import { desktopNotificationVisible } from '../../src/lib/desktopNotificationVisibility';
import { DESKTOP_SCHEDULE_UPDATES_KEY, mergeDesktopScheduleUpdates, saveDesktopScheduleUpdatePreferences } from '../../src/lib/scheduleRevisions';
import { DESKTOP_RELEASE_EPISODES_KEY, DESKTOP_RELEASE_SUBSCRIPTIONS_KEY, DESKTOP_SCHEDULE_REMINDERS_KEY } from '../../src/lib/desktopReminders';
const now = Date.UTC(2026, 9, 18, 12);
const day = 86_400_000;
const update = (id: string, at: number) => ({ id, key: `anilist:1:episode-${id}:dub`, animeId: 'anilist:1', title: id, episode: 1, previousAiringAt: now, airingAt: 0, detectedAt: at, kind: 'delayed' as const, releaseTrack: 'dub' });
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); });
const mount = () => render(<MemoryRouter><DesktopNotificationCenter /></MemoryRouter>);
const open = () => fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));

describe('Bell retention boundaries', () => {
  it('expires read entries at 24h and every entry at 7d using delivery time', () => {
    expect(desktopNotificationVisible(now - day + 1, now, now)).toBe(true);
    expect(desktopNotificationVisible(now - day, now, now)).toBe(false);
    expect(desktopNotificationVisible(now - 7 * day + 1, 0, now)).toBe(true);
    expect(desktopNotificationVisible(now - 7 * day, 0, now)).toBe(false);
    expect(desktopNotificationVisible(NaN, 0, now)).toBe(false);
  });
  it('keeps newly read entries in the current opening and removes them after dismissal', () => {
    localStorage.setItem(DESKTOP_SCHEDULE_UPDATES_KEY, JSON.stringify([update('Yesterday unread', now - 2 * day)]));
    mount(); expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toBeTruthy();
    open(); expect(screen.getByText('Yesterday unread')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close notifications' }));
    open(); expect(screen.queryByText('Yesterday unread')).toBeNull();
    expect(JSON.parse(localStorage.getItem(DESKTOP_SCHEDULE_UPDATES_KEY)!)).toHaveLength(1);
  });
  it('filters old releases before slicing and counting, preserving delivery markers and reminders', () => {
    const subscriptions = [{ id: 'anilist:1', title: 'Release title', sourceIdentity: { animeId: 'anilist:1' }, createdAt: now }];
    const episodes = [{ key: 'old', animeId: 'anilist:1', episode: 1, airingAt: now - 8 * day, airedNotifiedAt: now - 8 * day, availableNotifiedAt: now - 8 * day, blocked: false },
      { key: 'new', animeId: 'anilist:1', episode: 2, airingAt: now, availableNotifiedAt: now - 1000, blocked: false }];
    localStorage.setItem(DESKTOP_RELEASE_SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions));
    localStorage.setItem(DESKTOP_RELEASE_EPISODES_KEY, JSON.stringify(episodes));
    localStorage.setItem(DESKTOP_SCHEDULE_REMINDERS_KEY, JSON.stringify([{ id: 'future', title: 'Upcoming title', episode: 3, airingAt: now + day, createdAt: now, delivery: 'system' }]));
    mount(); expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toBeTruthy(); open();
    expect(screen.getAllByText('Release title')).toHaveLength(1); expect(screen.getByText('Upcoming title')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(DESKTOP_RELEASE_EPISODES_KEY)!)).toEqual(episodes);
  });
  it('does not resurrect expired revisions after native refresh or remount', () => {
    const old = update('Expired', now - 8 * day);
    mergeDesktopScheduleUpdates([old]); const view = mount(); open();
    expect(screen.queryByText('Expired')).toBeNull();
    act(() => mergeDesktopScheduleUpdates([{ ...old, detectedAt: now }]));
    expect(screen.queryByText('Expired')).toBeNull(); view.unmount(); mount(); open();
    expect(screen.queryByText('Expired')).toBeNull();
    expect(JSON.parse(localStorage.getItem(DESKTOP_SCHEDULE_UPDATES_KEY)!)[0].detectedAt).toBe(old.detectedAt);
  });
  it('refreshes expiry on the visible timer and foreground return', () => {
    saveDesktopScheduleUpdatePreferences({ personal: true, global: true, lastReadAt: now });
    localStorage.setItem(DESKTOP_SCHEDULE_UPDATES_KEY, JSON.stringify([update('Expires soon', now - day + 30_000)]));
    mount(); open(); expect(screen.getByText('Expires soon')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(60_000); }); expect(screen.queryByText('Expires soon')).toBeNull();
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
  });
});
