import { replaceEqualDeep } from '@tanstack/react-query';
import { getDownloadQueue, listenDownloadsChanged, subscribeDownloadSnapshots, type DesktopDownloadQueue } from './desktopDownloads';

type Snapshot = { queue?: DesktopDownloadQueue; error: string };
const empty: Snapshot = { error: '' };
const active = (queue?: DesktopDownloadQueue) => queue?.items.some(item => ['queued', 'downloading', 'verifying'].includes(item.state));

/** UI-only observation. Native transfers, checkpoints and reminders own their lifetimes. */
export function createDesktopDownloadStore(dependencies = {
  fetch: getDownloadQueue, listen: listenDownloadsChanged, snapshots: subscribeDownloadSnapshots,
}) {
  let snapshot = empty, timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<DesktopDownloadQueue | undefined> | undefined, dirty = false, generation = 0;
  let stopNative: (() => void) | undefined, stopSnapshots: (() => void) | undefined;
  let eventsReady = false;
  let notificationPending = false;
  let lastRead = -Infinity;
  const listeners = new Set<() => void>();
  const emit = () => {
    if (document.hidden) { notificationPending = true; return; }
    notificationPending = false; listeners.forEach(listener => listener());
  };
  const accept = (queue: DesktopDownloadQueue) => {
    const shared = replaceEqualDeep(snapshot.queue, queue);
    lastRead = Date.now();
    if (shared === snapshot.queue && !snapshot.error) return;
    snapshot = { queue: shared, error: '' }; emit();
    if (!pending) schedule(active(snapshot.queue) || !eventsReady ? 2000 : 30_000);
  };
  const schedule = (delay: number) => {
    clearTimeout(timer); timer = undefined;
    if (listeners.size && !document.hidden) timer = setTimeout(() => void refresh(), delay);
  };
  const refresh = (): Promise<DesktopDownloadQueue | undefined> => {
    if (document.hidden || !listeners.size) return Promise.resolve(snapshot.queue);
    if (pending) { dirty = true; return pending; }
    const run = generation;
    const request = dependencies.fetch().then(queue => {
      if (run === generation) accept(queue); return queue;
    }).catch(issue => {
      if (run === generation) {
        const error = String(issue instanceof Error ? issue.message : issue);
        if (error !== snapshot.error) { snapshot = { ...snapshot, error }; emit(); }
      }
      return undefined;
    }).finally(() => {
      if (pending === request) pending = undefined;
      if (run !== generation) return;
      if (dirty) { dirty = false; schedule(250); }
      else schedule(snapshot.error ? 5000 : active(snapshot.queue) || !eventsReady ? 2000 : 30_000);
    });
    pending = request; return request;
  };
  const changed = () => {
    if (document.hidden) { dirty = true; return; }
    if (pending) { dirty = true; return; }
    // Collapse bursts, including the native event emitted just before a command's
    // returned snapshot. The fallback also recovers a missing native event.
    schedule(Math.max(0, 250 - (Date.now() - lastRead)));
  };
  const visibility = () => {
    clearTimeout(timer); timer = undefined;
    if (!document.hidden) { if (notificationPending) emit(); dirty = false; void refresh(); }
  };
  const focus = () => { if (!document.hidden && Date.now() - lastRead >= 1000) void refresh(); };
  const stop = () => {
    generation++; clearTimeout(timer); timer = undefined; dirty = false; pending = undefined;
    stopNative?.(); stopNative = undefined; stopSnapshots?.(); stopSnapshots = undefined;
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('focus', focus);
    window.removeEventListener('streamnyaa-refresh-downloads', changed);
    snapshot = empty; lastRead = -Infinity; eventsReady = false; notificationPending = false;
  };
  return {
    getSnapshot: () => snapshot,
    refresh,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        const run = ++generation;
        stopSnapshots = dependencies.snapshots(queue => { if (run === generation) accept(queue); });
        document.addEventListener('visibilitychange', visibility);
        window.addEventListener('focus', focus);
        window.addEventListener('streamnyaa-refresh-downloads', changed);
        void dependencies.listen(changed).then(unlisten => {
          if (run === generation && listeners.size) {
            stopNative = unlisten;
            eventsReady = dependencies.listen !== listenDownloadsChanged || Boolean(window.__TAURI__?.event?.listen);
            if (!pending) schedule(active(snapshot.queue) || !eventsReady ? 2000 : 30_000);
          } else unlisten();
        }).catch(() => { if (run === generation) { eventsReady = false; if (!pending) schedule(2000); } });
        void refresh();
      }
      return () => { listeners.delete(listener); if (!listeners.size) stop(); };
    },
  };
}
export const desktopDownloadStore = createDesktopDownloadStore();
