import { useEffect, useRef } from 'react';
import {
  listenDesktopPlayerAutoNextChanged,
  listenDesktopPlayerReady,
  listenDesktopPlayerSettingChanged,
  loadDesktopPlayerPreferences,
  saveDesktopAutoPlayNextEpisode,
  saveDesktopPlayerSetting,
  subscribeDesktopPlayerPreferences,
  syncDesktopPlayerPreferencesToPlayer,
} from '../lib/desktop';

const MAX_SYNC_ATTEMPTS = 3;

export default function DesktopPlayerPreferenceBridge() {
  const playerReadyRef = useRef(false);
  const syncGenerationRef = useRef(0);
  const syncTimerRef = useRef<number | null>(null);
  const acceptingPlayerEventRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const cleanupListeners: Array<() => void> = [];

    const clearSyncTimer = () => {
      if (syncTimerRef.current === null) return;
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    };

    const syncPreferences = async (reason: string, attempt = 1, generation = ++syncGenerationRef.current) => {
      if (!mounted || !playerReadyRef.current || generation !== syncGenerationRef.current) return;
      clearSyncTimer();
      const result = await syncDesktopPlayerPreferencesToPlayer(loadDesktopPlayerPreferences());
      if (!mounted || generation !== syncGenerationRef.current) return;
      if (result.ok) {
        console.info(`[StreamNyaa Desktop] Player preferences restored reason=${reason}`);
        return;
      }
      if (attempt >= MAX_SYNC_ATTEMPTS) {
        console.warn(`[StreamNyaa Desktop] Player preference restore incomplete failed=${result.failed.join(',')}`);
        return;
      }
      syncTimerRef.current = window.setTimeout(() => {
        syncTimerRef.current = null;
        void syncPreferences(reason, attempt + 1, generation);
      }, 250 * attempt);
    };

    const preservePlayerChange = (key: string, value: unknown) => {
      acceptingPlayerEventRef.current = true;
      saveDesktopPlayerSetting(key, value);
      acceptingPlayerEventRef.current = false;
      console.info(`[StreamNyaa Desktop] Saved player preference key=${key}`);
    };

    void listenDesktopPlayerSettingChanged((event) => {
      if (!mounted || !event.key) return;
      preservePlayerChange(event.key, event.value);
    }).then((cleanup) => {
      if (mounted) cleanupListeners.push(cleanup);
      else cleanup();
    });

    void listenDesktopPlayerAutoNextChanged((event) => {
      if (!mounted || typeof event.enabled !== 'boolean') return;
      acceptingPlayerEventRef.current = true;
      saveDesktopAutoPlayNextEpisode(event.enabled);
      acceptingPlayerEventRef.current = false;
    }).then((cleanup) => {
      if (mounted) cleanupListeners.push(cleanup);
      else cleanup();
    });

    void listenDesktopPlayerReady(() => {
      if (!mounted) return;
      playerReadyRef.current = true;
      void syncPreferences('lua-ready');
    }).then((cleanup) => {
      if (mounted) cleanupListeners.push(cleanup);
      else cleanup();
    });

    const unsubscribePreferences = subscribeDesktopPlayerPreferences(() => {
      if (!playerReadyRef.current || acceptingPlayerEventRef.current) return;
      void syncPreferences('desktop-change');
    });

    return () => {
      mounted = false;
      playerReadyRef.current = false;
      syncGenerationRef.current += 1;
      clearSyncTimer();
      unsubscribePreferences();
      cleanupListeners.forEach((cleanup) => cleanup());
    };
  }, []);

  return null;
}
