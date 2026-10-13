import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: false, user: null, loading: false }) }));
import DesktopDownloadManager from '../../src/components/DesktopDownloadManager';
import DesktopDownloads from '../../src/components/DesktopDownloads';
import DesktopActivitySummary from '../../src/components/DesktopActivitySummary';

const invoke = vi.fn(async (_command: string) => ({ version: 1, limitBps: 0, items: [] }));
const listen = vi.fn(async (_event: string, _handler: (event: any) => void) => () => {});
beforeEach(() => {
  localStorage.clear(); vi.useFakeTimers(); vi.clearAllMocks();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  Object.defineProperty(window, '__TAURI__', { configurable: true, value: { core: { invoke }, event: { listen } } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); Object.defineProperty(window, '__TAURI__', { configurable: true, value: undefined }); });
it('measures the idle work of all three download surfaces over sixty seconds', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><DesktopDownloadManager /><DesktopDownloads /><DesktopActivitySummary /></MemoryRouter></QueryClientProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  const metrics = { seconds: 60, surfaces: 3, nativeQueueReads: invoke.mock.calls.length,
    nativeDownloadListeners: listen.mock.calls.filter(call => call[0] === 'streamnyaa-downloads-changed').length };
  console.info('DOWNLOAD_WORK_METRICS', JSON.stringify(metrics));
  expect(metrics.nativeQueueReads).toBe(3); // Baseline: 65 reads from three independent timers.
  expect(metrics.nativeDownloadListeners).toBe(1); // Baseline: three native listeners.
  client.clear();
});
