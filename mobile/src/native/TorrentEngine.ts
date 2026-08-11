import { NativeModule, requireNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';
import { API_ORIGIN } from '../config';
import { normalizeEngineException } from '../lib/engineErrors';
import { nativeSubtitleStyle } from '../lib/subtitleStyle';
import type { SubtitleStylePreferences } from '../../../shared/preferences';
import type {
  EngineCommandResult,
  EngineDiagnostic,
  EngineFailure,
  EngineHealthReport,
  RuntimeDeviceProfile,
  TorrentCacheEntry,
  TorrentCacheStats,
  TorrentStartOptions,
  TorrentStartRequest,
  TorrentStreamStatus,
} from '../types';

type TorrentEvents = { onStatus: (status: TorrentStreamStatus) => void };

declare class TorrentEngineNative extends NativeModule<TorrentEvents> {
  isSupported(): boolean;
  startStream(requestJson: string): Promise<string>;
  getEngineHealth(): Promise<string>;
  getDiagnostics(): Promise<string>;
  clearDiagnostics(): void;
  getStatus(): Promise<TorrentStreamStatus>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(removeFiles?: boolean): Promise<void>;
  clearCache(): Promise<number>;
  getCacheStats(): Promise<TorrentCacheStats>;
  listCacheEntries(): Promise<TorrentCacheEntry[]>;
  removeCacheEntry(infoHash: string): Promise<number>;
  getRuntimeProfile(): RuntimeDeviceProfile;
  applyPlayerSubtitleStyle(requestJson: string): Promise<number>;
}

let nativeModule: TorrentEngineNative | null = null;
try { nativeModule = requireNativeModule<TorrentEngineNative>('StreamNyaaTorrent'); } catch { nativeModule = null; }

const unsupported: TorrentStreamStatus = {
  state: 'error', message: 'Torrent streaming requires an Android development build.', progress: 0,
  bufferedPercent: 0, peers: 0, downloadRate: 0, error: 'Native module unavailable',
  connectionStage: 'failed', failureStage: 'native-module',
};

const unsupportedFailure: EngineFailure = {
  errorCode: 'NATIVE_MODULE_UNAVAILABLE',
  message: unsupported.error!,
  stage: 'native-module',
  retryable: false,
};

function torrentMetadataUrls(options: TorrentStartOptions) {
  const urls = new Set((options.metadataUrls || []).filter((value) => /^https:\/\//i.test(value)));
  const sourceUrl = options.torrentUrl;
  const torrentId = sourceUrl?.match(/(?:download|view)\/(\d+)(?:\.torrent)?/i)?.[1];
  if (torrentId) urls.add(`${API_ORIGIN}/api/torrent?id=${encodeURIComponent(torrentId)}`);
  if (sourceUrl && /^https:\/\//i.test(sourceUrl)) urls.add(sourceUrl);
  return [...urls].slice(0, 4);
}

function safeFailure(value: unknown, fallback: EngineFailure): EngineFailure {
  if (!value || typeof value !== 'object') return fallback;
  const candidate = value as Partial<EngineFailure>;
  return {
    errorCode: String(candidate.errorCode || fallback.errorCode),
    message: String(candidate.message || fallback.message),
    stage: String(candidate.stage || fallback.stage),
    retryable: candidate.retryable !== false,
  };
}

function parseResult<T>(raw: string, fallback: EngineFailure): EngineCommandResult<T> {
  try {
    const parsed = JSON.parse(raw) as EngineCommandResult<T>;
    if (parsed && parsed.ok === true && 'value' in parsed) return parsed;
    if (parsed && parsed.ok === false) return { ok: false, error: safeFailure(parsed.error, fallback) };
  } catch { /* Return a stable diagnostic instead of throwing another bridge error. */ }
  return { ok: false, error: fallback };
}

export const TorrentEngine = {
  isSupported: () => nativeModule?.isSupported() ?? false,
  startStream: async (magnet: string, preferredFile: string | undefined, options: TorrentStartOptions): Promise<EngineCommandResult<TorrentStreamStatus>> => {
    if (!nativeModule) return { ok: false, error: unsupportedFailure };
    const request: TorrentStartRequest = {
      protocolVersion: 1,
      magnet,
      preferredFile,
      options: { ...options, metadataUrls: torrentMetadataUrls(options) },
    };
    try {
      return parseResult<TorrentStreamStatus>(await nativeModule.startStream(JSON.stringify(request)), {
        errorCode: 'INVALID_NATIVE_RESPONSE',
        message: 'The Android streaming engine returned an invalid response.',
        stage: 'native-bridge',
        retryable: true,
      });
    } catch (error) {
      return { ok: false, error: normalizeEngineException(error) };
    }
  },
  getEngineHealth: async (): Promise<EngineHealthReport> => {
    if (!nativeModule) return {
      protocolVersion: 1, supported: false, serviceConnected: false, nativeLibraryLoaded: false,
      abi: 'unknown', androidApi: 0, cacheWritable: false, loopbackReachable: false,
      details: unsupportedFailure.message,
    };
    try {
      return JSON.parse(await nativeModule.getEngineHealth()) as EngineHealthReport;
    } catch (error) {
      return {
        protocolVersion: 1, supported: true, serviceConnected: false, nativeLibraryLoaded: false,
        abi: 'unknown', androidApi: 0, cacheWritable: false, loopbackReachable: false,
        details: normalizeEngineException(error).message,
      };
    }
  },
  getDiagnostics: async (): Promise<EngineDiagnostic[]> => {
    if (!nativeModule) return [];
    try { return JSON.parse(await nativeModule.getDiagnostics()) as EngineDiagnostic[]; } catch { return []; }
  },
  clearDiagnostics: () => nativeModule?.clearDiagnostics(),
  getStatus: () => nativeModule?.getStatus() ?? Promise.resolve(unsupported),
  pause: () => nativeModule?.pause() ?? Promise.resolve(),
  resume: () => nativeModule?.resume() ?? Promise.resolve(),
  stop: (removeFiles = false) => nativeModule?.stop(removeFiles) ?? Promise.resolve(),
  clearCache: () => nativeModule?.clearCache() ?? Promise.resolve(0),
  getCacheStats: () => nativeModule?.getCacheStats() ?? Promise.resolve({ bytes: 0, freeBytes: 0, maxBytes: 0 }),
  listCacheEntries: () => nativeModule?.listCacheEntries() ?? Promise.resolve([]),
  removeCacheEntry: (infoHash: string) => nativeModule?.removeCacheEntry(infoHash) ?? Promise.resolve(0),
  getRuntimeProfile: () => nativeModule?.getRuntimeProfile() ?? ({ resolvedProfile: 'standard', lowRam: false, memoryClassMiB: 256 }),
  applyPlayerSubtitleStyle: (style: SubtitleStylePreferences) => nativeModule?.applyPlayerSubtitleStyle(JSON.stringify(nativeSubtitleStyle(style))) ?? Promise.resolve(0),
  addStatusListener: (listener: (status: TorrentStreamStatus) => void): EventSubscription | null =>
    nativeModule?.addListener('onStatus', listener) ?? null,
};
