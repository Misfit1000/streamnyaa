import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import DesktopAppearanceSettings from '../../src/components/DesktopAppearanceSettings';
import { normalizeInterfaceScale, readInterfaceScale, useDesktopInterfaceScale } from '../../src/lib/desktopAppearance';
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
