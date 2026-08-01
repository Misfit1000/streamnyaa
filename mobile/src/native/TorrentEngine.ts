import { NativeModule, requireNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';
import type { TorrentCacheStats, TorrentStartOptions, TorrentStreamStatus } from '../types';

type TorrentEvents = { onStatus: (status: TorrentStreamStatus) => void };

declare class TorrentEngineNative extends NativeModule<TorrentEvents> {
  isSupported(): boolean;
  startStream(magnet: string, preferredFile: string | undefined, options: TorrentStartOptions): Promise<TorrentStreamStatus>;
  getStatus(): Promise<TorrentStreamStatus>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(removeFiles?: boolean): Promise<void>;
  clearCache(): Promise<number>;
  getCacheStats(): Promise<TorrentCacheStats>;
}

let nativeModule: TorrentEngineNative | null = null;
try { nativeModule = requireNativeModule<TorrentEngineNative>('StreamNyaaTorrent'); } catch { nativeModule = null; }

const unsupported: TorrentStreamStatus = {
  state: 'error', message: 'Torrent streaming requires an Android development build.', progress: 0,
  bufferedPercent: 0, peers: 0, downloadRate: 0, error: 'Native module unavailable',
};

export const TorrentEngine = {
  isSupported: () => nativeModule?.isSupported() ?? false,
  startStream: (magnet: string, preferredFile: string | undefined, options: TorrentStartOptions) => nativeModule?.startStream(magnet, preferredFile, options) ?? Promise.resolve(unsupported),
  getStatus: () => nativeModule?.getStatus() ?? Promise.resolve(unsupported),
  pause: () => nativeModule?.pause() ?? Promise.resolve(),
  resume: () => nativeModule?.resume() ?? Promise.resolve(),
  stop: (removeFiles = false) => nativeModule?.stop(removeFiles) ?? Promise.resolve(),
  clearCache: () => nativeModule?.clearCache() ?? Promise.resolve(0),
  getCacheStats: () => nativeModule?.getCacheStats() ?? Promise.resolve({ bytes: 0, freeBytes: 0, maxBytes: 0 }),
  addStatusListener: (listener: (status: TorrentStreamStatus) => void): EventSubscription | null =>
    nativeModule?.addListener('onStatus', listener) ?? null,
};
