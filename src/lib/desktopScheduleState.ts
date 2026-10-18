import type { DesktopScheduleUpdate } from './scheduleRevisions';

export const SCHEDULE_ALERT_STATE_KEY = 'streamnyaa.desktop.schedule-alert-state.v1';
export type AlertState = { version: number; tracks: any[]; changes: DesktopScheduleUpdate[]; error?: string | null; persistenceError?: string | null };
let snapshot: AlertState | undefined;
export function savedScheduleState(): AlertState {
  try {
    const state = JSON.parse(localStorage.getItem(SCHEDULE_ALERT_STATE_KEY) || 'null');
    if (state?.version === 1 && Array.isArray(state.tracks) && Array.isArray(state.changes)) return state;
  } catch { /* The native snapshot is authoritative on desktop. */ }
  return { version: 1, tracks: [], changes: [] };
}
export function readScheduleAlertState(): AlertState { return snapshot || savedScheduleState(); }
export function publishScheduleState(state: AlertState) {
  snapshot = { version: 1, tracks: state.tracks, changes: state.changes, error: state.error, persistenceError: state.persistenceError };
  // The native service already persists the complete snapshot atomically. A second
  // multi-megabyte localStorage write consumed quota and falsely reported disk failure.
  // Keep legacy/imported data until the native service confirms a durable save.
  if (!state.persistenceError) {
    try { localStorage.removeItem(SCHEDULE_ALERT_STATE_KEY); } catch { /* Optional duplicate cache only. */ }
  }
}
export function scheduleStateForBackup() { return JSON.stringify(readScheduleAlertState()); }
