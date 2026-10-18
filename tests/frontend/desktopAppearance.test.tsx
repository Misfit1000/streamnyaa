import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DesktopAppearanceSettings from '../../src/components/DesktopAppearanceSettings';
import { initializeDesktopAppearance, normalizeInterfaceScale, readInterfaceScale, useDesktopInterfaceScale } from '../../src/lib/desktopAppearance';
beforeEach(() => localStorage.clear());
afterEach(cleanup);
it('rejects corrupt, zero and excessive interface scales', () => {
  for (const value of [null, 0, -5, 500, 'broken']) expect(normalizeInterfaceScale(value)).toBe(100);
  expect(normalizeInterfaceScale('115')).toBe(115);
});
it('updates immediately, persists, and restores the root style on unmount', () => {
  function Host() { useDesktopInterfaceScale(); return <DesktopAppearanceSettings />; }
  const previous = document.documentElement.style.fontSize;
  const view = render(<Host />);
  fireEvent.click(screen.getByRole('button', { name: '125%' }));
  expect(document.documentElement.style.fontSize).toBe('20px');
  expect(readInterfaceScale()).toBe(125);
  expect(screen.getByRole('button', { name: '125%' }).getAttribute('aria-pressed')).toBe('true');
  act(() => view.unmount());
  expect(document.documentElement.style.fontSize).toBe(previous);
});
it('normalizes legacy Classic while preserving size and Home layout',()=>{
  localStorage.setItem('streamnyaa.desktop.design.v1','classic');localStorage.setItem('streamnyaa.desktop.interfaceScale','115');
  localStorage.setItem('streamnyaa.desktop.homeLayout.v1','{"hidden":["upcoming"]}');
  initializeDesktopAppearance();render(<DesktopAppearanceSettings />);
  expect(document.documentElement.dataset.desktopDesign).toBe('revamped');expect(localStorage.getItem('streamnyaa.desktop.design.v1')).toBe('revamped');
  expect(readInterfaceScale()).toBe(115);expect(localStorage.getItem('streamnyaa.desktop.homeLayout.v1')).toBe('{"hidden":["upcoming"]}');
  expect(screen.queryByRole('button',{name:/Classic|revert/i})).toBeNull();
});
it('applies Revamped when storage is unavailable',()=>{
  document.documentElement.dataset.desktopDesign='classic';vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('Denied');});
  initializeDesktopAppearance();expect(document.documentElement.dataset.desktopDesign).toBe('revamped');
});
