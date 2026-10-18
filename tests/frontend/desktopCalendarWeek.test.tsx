import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { airingAtMs, scheduleDelayLabel, scheduleInRange, scheduleNextRelease, scheduleSections, scheduleTitleCount } from '../../src/lib/desktopSchedulePresentation';
import DesktopScheduleCard from '../../src/components/DesktopScheduleCard';

afterEach(cleanup);
const start = new Date(2026, 9, 18).getTime();
const end = new Date(2026, 9, 25).getTime();
const day = 86_400_000;
const window = { weekStart: start, weekEnd: end, dayStart: start, dayEnd: start + day, today: true, dayLabel: 'Today', now: start + 1000 };
const base = { anilist_id: 1, mal_id: 2, title: 'A very long installment title that wraps without changing its identity', airingEpisode: 2, airingAt: (start + 3600_000) / 1000 };

describe('Calendar week relevance', () => {
  it('excludes historical and undated delays even when freshly fetched', () => {
    const rows = [{ ...base, airingAt: 0, previousAiringAt: new Date(2026, 7, 16).getTime(), scheduleStatus: 'delayed', scheduleFetchedAt: start },
      { ...base, anilist_id: 3, mal_id: 4, airingAt: 0, scheduleStatus: 'delayed', scheduleFetchedAt: start }];
    expect(scheduleSections(rows, window)).toEqual([]);
    expect(rows[0].previousAiringAt).toBe(new Date(2026, 7, 16).getTime());
  });
  it('keeps this week’s TBA and moved episodes in the weekly overview', () => {
    const rows = [{ ...base, airingAt: 0, previousAiringAt: start + 3 * day, scheduleStatus: 'postponed' },
      { ...base, airingEpisode: 3, airingAt: (end + day) / 1000, previousAiringAt: start + 5 * day, scheduleStatus: 'rescheduled' }];
    expect(scheduleSections(rows, window)[0]).toMatchObject({ title: 'Schedule changes', items: rows });
    expect(scheduleSections(rows, { ...window, weekStart: end + 2 * day, weekEnd: end + 9 * day })).toEqual([]);
  });
  it('uses exclusive end boundaries and supports both timestamp units', () => {
    expect(scheduleInRange({ ...base, airingAt: start / 1000 }, start, end)).toBe(true);
    expect(scheduleInRange({ ...base, airingAt: end }, start, end)).toBe(false);
    expect(airingAtMs({ airingAt: start })).toBe(start);
    expect(airingAtMs({ airingAt: start / 1000 })).toBe(start);
  });
  it('uses supplied local-day bounds across a 25-hour daylight-saving day', () => {
    const from = Date.parse('2026-11-01T00:00:00-04:00'), until = Date.parse('2026-11-02T00:00:00-05:00');
    expect(scheduleInRange({ ...base, airingAt: until - 1 }, from, until)).toBe(true);
    expect(scheduleInRange({ ...base, airingAt: until }, from, until)).toBe(false);
  });
  it('counts a title once across episode and provider-qualified track records', () => {
    expect(scheduleTitleCount([base, { ...base, anilist_id: undefined, airingEpisode: 3, releaseTrack: 'dub' }])).toBe(1);
    expect(scheduleTitleCount([base, { ...base, anilist_id: 3, mal_id: 4 }])).toBe(2);
  });
  it('keeps mixed tracks in one changed card without duplicate ordinary cards', () => {
    const rows = [{ ...base, releaseTrack: 'original' }, { ...base, releaseTrack: 'sub' },
      { ...base, releaseTrack: 'dub', airingAt: 0, previousAiringAt: start + 2 * day, scheduleStatus: 'delayed' }];
    const result = scheduleSections(rows, window);
    expect(result).toHaveLength(1); expect(result[0].items).toHaveLength(3);
    expect(scheduleDelayLabel(rows)).toBe('Dub delayed');
    expect(scheduleNextRelease(rows, start)).toBe(airingAtMs(base));
  });
  it('keeps other tabs day-specific and does not conflate different installments', () => {
    const first = { ...base, airingAt: (start + 2 * day) / 1000, scheduleStatus: 'rescheduled' };
    const second = { ...base, anilist_id: 99, mal_id: 98 };
    expect(scheduleSections([first, second], { ...window, today: false })[0].items).toEqual([second]);
    expect(scheduleSections([first], window, () => false)).toEqual([]);
  });
  it('never counts a retained old slot as the next confirmed release', () => {
    expect(scheduleNextRelease([{ ...base, scheduleStatus: 'delayed' }], start)).toBe(0);
    expect(scheduleNextRelease([{ ...base, scheduleStatus: 'cancelled' }], start)).toBe(0);
    expect(scheduleNextRelease([{ ...base, previousAiringAt: start, scheduleStatus: 'delayed' }], start)).toBe(airingAtMs(base));
    expect(scheduleDelayLabel([{ ...base, scheduleStatus: 'postponed' }])).toBe('');
    expect(scheduleDelayLabel([{ ...base, scheduleStatus: 'delayed' }])).toBe('Delayed');
  });
});

it('renders a track-qualified full-artwork band and accessible status details', () => {
  const tracks = [base, { ...base, releaseTrack: 'dub', airingAt: 0, previousAiringAt: start, scheduleStatus: 'delayed', scheduleReason: 'Dub production was postponed' }];
  const view = render(<MemoryRouter><DesktopScheduleCard anime={base} tracks={tracks} now={start}><button>Bookmark</button><button>Bell</button></DesktopScheduleCard></MemoryRouter>);
  expect(view.container.querySelector('.sn-schedule-artwork-delay')?.textContent).toBe('Dub delayed');
  expect(screen.getByText(base.title)).toBeTruthy(); expect(screen.getByText('Awaiting new date')).toBeTruthy();
  fireEvent.click(screen.getByText('Details')); expect(screen.getByText('Dub production was postponed')).toBeTruthy();
  expect(view.container.querySelector('.broadcast-time time')?.getAttribute('datetime')).toBe(new Date(airingAtMs(base)).toISOString());
});
