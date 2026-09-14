import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import DesktopLibraryOrganizer from '../../src/components/DesktopLibraryOrganizer';
import { createLibraryCollection, organizationIdentity, readLibraryOrganization, undoLibraryOrganization, updateLibraryOrganization } from '../../src/lib/desktopLibraryOrganization';
beforeEach(() => localStorage.clear());
afterEach(cleanup);
it('keeps catalog identities separate', () => {
  expect(organizationIdentity({ mal_id: 7 })).toBe('mal:7');
  expect(organizationIdentity({ anilist_id: 7 })).toBe('anilist:7');
});
it('supports collection assignment and undo without losing later edits', () => {
  localStorage.setItem('shanks-storage', 'preserve');
  createLibraryCollection('Weekend');
  const first = updateLibraryOrganization(['mal:1', 'mal:2'], { status: 'Watching', collection: 'Weekend' });
  updateLibraryOrganization(['mal:2'], { status: 'Completed' });
  undoLibraryOrganization(first);
  expect(readLibraryOrganization().entries['mal:1']).toBeUndefined();
  expect(readLibraryOrganization().entries['mal:2'].status).toBe('Completed');
  expect(localStorage.getItem('shanks-storage')).toBe('preserve');
});
it('provides real status controls and bulk undo', () => {
  render(<DesktopLibraryOrganizer anime={[{ mal_id: 1, title: 'First' }, { mal_id: 2, title: 'Second' }]} />);
  fireEvent.click(screen.getByText('Organize library'));
  fireEvent.click(screen.getByRole('button', { name: 'Select visible (2)' }));
  fireEvent.change(screen.getByLabelText('Set selected viewing status'), { target: { value: 'On hold' } });
  expect(readLibraryOrganization().entries['mal:1'].status).toBe('On hold');
  expect(readLibraryOrganization().entries['mal:2'].status).toBe('On hold');
  fireEvent.click(screen.getByRole('button', { name: 'Undo last change' }));
  expect(Object.keys(readLibraryOrganization().entries)).toHaveLength(0);
});
it('does not accept malformed status and recovers corrupt metadata', () => {
  localStorage.setItem('streamnyaa.desktop.libraryOrganization.v1', '{');
  expect(readLibraryOrganization().collections).toEqual([]);
  expect(() => updateLibraryOrganization(['mal:1'], { status: 'bad' as any })).toThrow('Invalid');
});
