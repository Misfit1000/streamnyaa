import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('../../src/lib/desktopTrailerPlayer', async () => ({
  ...await vi.importActual('../../src/lib/desktopTrailerPlayer'), loadTrailerApi: vi.fn(),
}));
import { loadTrailerApi } from '../../src/lib/desktopTrailerPlayer';
import DesktopTrailer from '../../src/components/DesktopTrailer';
let events: any;
const destroy = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadTrailerApi).mockResolvedValue({ Player: class {
    destroy = destroy;
    constructor(_frame: HTMLIFrameElement, config: any) { events = config.events; }
  } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const mount = (onClose = vi.fn()) => render(<DesktopTrailer title="Example" url="https://www.youtube-nocookie.com/embed/abcdefghijk" onClose={onClose} />);
describe('in-app trailer modal', () => {
  it('keeps the same video frame through fullscreen entry and exit', async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: request });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
    const view = mount(); const frame = screen.getByTitle('Example trailer');
    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen trailer' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: view.getByRole('dialog') });
    fireEvent.click(screen.getByRole('button', { name: 'Exit trailer fullscreen' }));
    await waitFor(() => expect(exit).toHaveBeenCalledTimes(1));
    expect(screen.getByTitle('Example trailer')).toBe(frame);
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
  });
  it('uses the full-window fallback after rejection and Escape restores the modal first', async () => {
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: vi.fn().mockRejectedValue(new Error('not allowed')) });
    const onClose = vi.fn(); mount(onClose); const frame = screen.getByTitle('Example trailer');
    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen trailer' }));
    await screen.findByRole('button', { name: 'Exit trailer fullscreen' });
    expect(screen.getByTitle('Example trailer')).toBe(frame);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Fullscreen trailer' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' }); expect(onClose).toHaveBeenCalledOnce();
  });
  it('shows actual player errors and retries only when requested', async () => {
    mount(); await waitFor(() => expect(events).toBeTruthy());
    const frame = screen.getByTitle('Example trailer');
    fireEvent.load(frame); expect(screen.queryByText('Playing on YouTube')).toBeNull();
    act(() => events.onError({ data: 153 }));
    expect(screen.getByRole('status').textContent).toContain('identification');
    expect(loadTrailerApi).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry trailer' }));
    expect(screen.getByTitle('Example trailer')).not.toBe(frame);
    await waitFor(() => expect(loadTrailerApi).toHaveBeenCalledTimes(2));
    act(() => events.onStateChange({ data: 1 })); expect(screen.getByRole('status').textContent).toBe('Playing on YouTube');
  });
  it('cleans up the player and restores focus when the route unmounts it', async () => {
    const launcher = document.createElement('button'); document.body.append(launcher); launcher.focus();
    const view = mount(); await waitFor(() => expect(loadTrailerApi).toHaveBeenCalledOnce());
    view.unmount(); expect(destroy).toHaveBeenCalledOnce(); expect(document.activeElement).toBe(launcher); launcher.remove();
  });
});
