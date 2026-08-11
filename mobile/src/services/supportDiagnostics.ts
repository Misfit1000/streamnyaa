import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Paths } from 'expo-file-system';
import { Dimensions, PixelRatio, Platform } from 'react-native';
import {
  appendBoundedDiagnostic,
  sanitizeDiagnosticContext,
  sanitizeDiagnosticText,
  sanitizedPlaybackStatus,
  shortDiagnosticId,
  type SupportDiagnosticEvent,
  type SupportDiagnosticLevel,
} from '../lib/diagnosticSanitizer';
import { TorrentEngine } from '../native/TorrentEngine';
import type { PlaybackPhase } from '../context/PlaybackContext';
import type { ConnectionDiagnostic } from './diagnostics';
import type { TorrentSource, TorrentStreamStatus } from '../types';

const STORAGE_KEY = 'streamnyaa.support-diagnostics.v1';
const MAX_EVENTS = 120;
let cachedEvents: SupportDiagnosticEvent[] | undefined;
let storageQueue: Promise<void> = Promise.resolve();
let lastStatusSignature = '';
let lastStatusAt = 0;

async function readEvents() {
  if (cachedEvents) return cachedEvents;
  try {
    const parsed = JSON.parse(await AsyncStorage.getItem(STORAGE_KEY) || '[]');
    cachedEvents = Array.isArray(parsed) ? parsed.slice(-MAX_EVENTS) : [];
  } catch {
    cachedEvents = [];
  }
  return cachedEvents;
}

async function writeEvent(event: SupportDiagnosticEvent) {
  const events = await readEvents();
  cachedEvents = appendBoundedDiagnostic(events, event, MAX_EVENTS);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cachedEvents));
}

export function recordSupportEvent(input: {
  level?: SupportDiagnosticLevel;
  stage: string;
  code: string;
  message: string;
  context?: Record<string, unknown>;
}) {
  const event: SupportDiagnosticEvent = {
    at: Date.now(),
    level: input.level || 'info',
    stage: sanitizeDiagnosticText(input.stage, 48) || 'app',
    code: sanitizeDiagnosticText(input.code, 64) || 'EVENT',
    message: sanitizeDiagnosticText(input.message),
    context: sanitizeDiagnosticContext(input.context),
  };
  storageQueue = storageQueue.then(() => writeEvent(event)).catch(() => undefined);
}

export function recordPlaybackStatus(status: TorrentStreamStatus, context: { animeId?: number; episode?: number; source?: TorrentSource; phase?: PlaybackPhase }) {
  const stage = status.failureStage || status.connectionStage || status.state;
  const signature = [status.state, stage, status.failureCode || '', status.peers, status.seeds || 0, Boolean(status.streamUrl)].join('|');
  const now = Date.now();
  if (signature === lastStatusSignature && now - lastStatusAt < 30_000) return;
  lastStatusSignature = signature;
  lastStatusAt = now;
  recordSupportEvent({
    level: status.state === 'error' ? 'error' : status.peers === 0 && Number(status.waitSeconds || 0) >= 10 ? 'warning' : 'info',
    stage,
    code: status.failureCode || `TORRENT_${status.state.toUpperCase()}`,
    message: status.error || status.message,
    context: {
      animeId: context.animeId,
      episode: context.episode,
      sourceId: shortDiagnosticId(context.source?.infoHash),
      phase: context.phase,
      peers: status.peers,
      seeds: status.seeds || 0,
      candidates: status.connectCandidates || 0,
      trackers: status.trackerCount || 0,
      dhtNodes: status.dhtNodes || 0,
      bufferedPercent: status.bufferedPercent,
      downloadedBytes: status.downloadedBytes || 0,
      downloadRate: status.downloadRate,
      waitSeconds: status.waitSeconds || 0,
      hasStreamUrl: Boolean(status.streamUrl),
    },
  });
}

export async function flushSupportDiagnostics() {
  await storageQueue;
}

export async function getSupportEvents() {
  await flushSupportDiagnostics();
  return [...await readEvents()];
}

export async function clearSupportDiagnostics() {
  await flushSupportDiagnostics();
  cachedEvents = [];
  lastStatusSignature = '';
  try { TorrentEngine.clearDiagnostics(); } catch { /* Native diagnostics may be unavailable in Expo preview. */ }
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
}

export type SupportReportPlayback = {
  animeId?: number;
  episode?: number;
  source?: TorrentSource;
  phase?: PlaybackPhase;
  currentTime?: number;
  duration?: number;
  status?: TorrentStreamStatus;
};

export async function buildSupportReport(options: {
  playback?: SupportReportPlayback;
  connections?: ConnectionDiagnostic[];
  preferences?: Record<string, unknown>;
} = {}) {
  await flushSupportDiagnostics();
  const [events, engineHealth, nativeDiagnostics, cacheStats] = await Promise.all([
    getSupportEvents(),
    TorrentEngine.getEngineHealth(),
    TorrentEngine.getDiagnostics(),
    TorrentEngine.getCacheStats().catch(() => ({ bytes: 0, freeBytes: 0, maxBytes: 0 })),
  ]);
  const profile = TorrentEngine.getRuntimeProfile();
  const window = Dimensions.get('window');
  const screen = Dimensions.get('screen');
  let availableDiskBytes = 0;
  let totalDiskBytes = 0;
  try {
    availableDiskBytes = Number(Paths.availableDiskSpace || 0);
    totalDiskBytes = Number(Paths.totalDiskSpace || 0);
  } catch { /* Disk telemetry is optional on unsupported runtimes. */ }

  return {
    protocolVersion: 1,
    generatedAt: new Date().toISOString(),
    app: {
      name: 'StreamNyaa Android',
      version: Constants.expoConfig?.version || 'unknown',
      runtimeVersion: Constants.expoConfig?.runtimeVersion || null,
    },
    device: {
      platform: Platform.OS,
      androidApi: Number(Platform.Version || profile.androidApi || 0),
      manufacturer: profile.manufacturer || engineHealth.manufacturer || 'unknown',
      model: profile.model || engineHealth.model || 'unknown',
      device: profile.device || 'unknown',
      supportedAbis: profile.supportedAbis || engineHealth.supportedAbis || [],
      lowRam: profile.lowRam,
      memoryClassMiB: profile.memoryClassMiB,
      resolvedProfile: profile.resolvedProfile,
      window: { width: window.width, height: window.height, scale: window.scale, fontScale: window.fontScale },
      screen: { width: screen.width, height: screen.height, scale: screen.scale, fontScale: screen.fontScale },
      pixelRatio: PixelRatio.get(),
      availableDiskBytes,
      totalDiskBytes,
    },
    engine: engineHealth,
    cache: cacheStats,
    playback: options.playback ? {
      animeId: options.playback.animeId,
      episode: options.playback.episode,
      sourceId: shortDiagnosticId(options.playback.source?.infoHash),
      sourceSeeders: options.playback.source?.seeders,
      sourceSizeBytes: options.playback.source?.sizeBytes,
      phase: options.playback.phase,
      currentTime: Math.round(Number(options.playback.currentTime || 0)),
      duration: Math.round(Number(options.playback.duration || 0)),
      status: sanitizedPlaybackStatus(options.playback.status),
    } : null,
    connections: (options.connections || []).map((item) => ({ ...item, message: sanitizeDiagnosticText(item.message) })),
    preferences: sanitizeDiagnosticContext(options.preferences),
    recentEvents: events.slice(-MAX_EVENTS),
    nativeDiagnostics: nativeDiagnostics.slice(-80).map((entry) => ({ ...entry, message: sanitizeDiagnosticText(entry.message) })),
  };
}
