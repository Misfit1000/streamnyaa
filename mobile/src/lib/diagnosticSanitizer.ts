import type { TorrentStreamStatus } from '../types';

export type SupportDiagnosticLevel = 'info' | 'warning' | 'error';

export type SupportDiagnosticEvent = {
  at: number;
  level: SupportDiagnosticLevel;
  stage: string;
  code: string;
  message: string;
  context?: Record<string, string | number | boolean | null>;
};

const sensitiveKey = /account|authorization|bearer|email|jwt|magnet|password|refresh|session|token|user/i;

export function sanitizeDiagnosticText(value: unknown, maximumLength = 240) {
  return String(value || '')
    .replace(/magnet:\?[^\s]+/gi, '[magnet redacted]')
    .replace(/(bearer\s+)[a-z0-9._~-]+/gi, '$1[token redacted]')
    .replace(/((?:access|refresh)[_-]?token)["'=:\s]+[a-z0-9._~-]+/gi, '$1=[token redacted]')
    .replace(/\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/gi, '[jwt redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email redacted]')
    .slice(0, maximumLength);
}

export function sanitizeDiagnosticContext(context?: Record<string, unknown>) {
  if (!context) return undefined;
  const safe: Record<string, string | number | boolean | null> = {};
  Object.entries(context).slice(0, 24).forEach(([key, value]) => {
    if (sensitiveKey.test(key) || value === undefined || typeof value === 'object' || typeof value === 'function') return;
    safe[key.slice(0, 48)] = typeof value === 'string' ? sanitizeDiagnosticText(value, 160) : value as number | boolean | null;
  });
  return Object.keys(safe).length ? safe : undefined;
}

export function shortDiagnosticId(value: unknown) {
  const normalized = String(value || '').replace(/[^a-z0-9]/gi, '');
  if (!normalized) return '';
  return normalized.length <= 10 ? normalized : `${normalized.slice(0, 8)}…${normalized.slice(-4)}`;
}

export function sanitizedPlaybackStatus(status?: TorrentStreamStatus) {
  if (!status) return undefined;
  return {
    state: status.state,
    stage: status.failureStage || status.connectionStage || 'unknown',
    failureCode: status.failureCode,
    message: sanitizeDiagnosticText(status.error || status.message),
    progress: Math.round(Number(status.progress || 0) * 10) / 10,
    bufferedPercent: Math.round(Number(status.bufferedPercent || 0) * 10) / 10,
    peers: Number(status.peers || 0),
    seeds: Number(status.seeds || 0),
    connectCandidates: Number(status.connectCandidates || 0),
    trackerCount: Number(status.trackerCount || 0),
    dhtNodes: Number(status.dhtNodes || 0),
    dhtRunning: Boolean(status.dhtRunning),
    firewalled: Boolean(status.firewalled),
    downloadedBytes: Number(status.downloadedBytes || 0),
    totalBytes: Number(status.totalBytes || 0),
    readOffsetBytes: Number(status.readOffsetBytes || 0),
    readableBytesAtOffset: Number(status.readableBytesAtOffset || 0),
    rangeWaitSeconds: Number(status.rangeWaitSeconds || 0),
    downloadRate: Number(status.downloadRate || 0),
    etaSeconds: Number(status.etaSeconds || 0),
    cached: Boolean(status.cached),
    waitSeconds: Number(status.waitSeconds || 0),
    hasStreamUrl: Boolean(status.streamUrl),
    fileName: status.fileName ? sanitizeDiagnosticText(status.fileName, 160) : undefined,
  };
}

export function appendBoundedDiagnostic(events: SupportDiagnosticEvent[], event: SupportDiagnosticEvent, maximum = 120) {
  return [...events, event].slice(-Math.max(1, maximum));
}
