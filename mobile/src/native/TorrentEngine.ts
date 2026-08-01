import { NativeModule, requireNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';
import type { TorrentStreamStatus } from '../types';

type TorrentEvents = { onStatus: (status: TorrentStreamStatus) => void };

declare class TorrentEngineNative extends NativeModule<TorrentEvents> {
  isSupported(): boolean;
  startStream(magnet: string, preferredFile?: string): Promise<TorrentStreamStatus>;
  getStatus(): Promise<TorrentStreamStatus>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(removeFiles?: boolean): Promise<void>;
  clearCache(): Promise<number>;
}

let nativeModule: TorrentEngineNative | null = null;
try { nativeModule = requireNativeModule<TorrentEngineNative>('StreamNyaaTorrent'); } catch { nativeModule = null; }

const unsupported: TorrentStreamStatus = {
  state: 'error', message: 'Torrent streaming requires an Android development build.', progress: 0,
  bufferedPercent: 0, peers: 0, downloadRate: 0, error: 'Native module unavailable',
};

export const TorrentEngine = {
  isSupported: () => nativeModule?.isSupported() ?? false,
  startStream: (magnet: string, preferredFile?: string) => nativeModule?.startStream(magnet, preferredFile) ?? Promise.resolve(unsupported),
  getStatus: () => nativeModule?.getStatus() ?? Promise.resolve(unsupported),
  pause: () => nativeModule?.pause() ?? Promise.resolve(),
  resume: () => nativeModule?.resume() ?? Promise.resolve(),
  stop: (removeFiles = false) => nativeModule?.stop(removeFiles) ?? Promise.resolve(),
  clearCache: () => nativeModule?.clearCache() ?? Promise.resolve(0),
  addStatusListener: (listener: (status: TorrentStreamStatus) => void): EventSubscription | null =>
    nativeModule?.addListener('onStatus', listener) ?? null,
};
