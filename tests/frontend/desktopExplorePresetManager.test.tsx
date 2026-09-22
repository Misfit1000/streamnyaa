import { afterEach, it, expect } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import DesktopExplorePresetManager from '../../src/components/DesktopExplorePresetManager';
import { readExplorePresets } from '../../src/lib/desktopExplorePresets';
afterEach(() => { cleanup(); localStorage.clear(); });
function Harness() { const [q, setQ] = useState('mode=new&genre=Fantasy'); return <DesktopExplorePresetManager query={q} onApply={setQ}/>; }
it('saves, detects duplicate filters, renames and undoes deletion', () => { render(<Harness />); const input = screen.getByLabelText('Preset name'); fireEvent.change(input, { target: { value: 'Fantasy' } }); fireEvent.click(screen.getByText('Save current')); expect(readExplorePresets()[0].name).toBe('Fantasy'); fireEvent.change(input, { target: { value: 'Duplicate' } }); fireEvent.click(screen.getByText('Save current')); expect(screen.getByRole('status').textContent).toContain('already saved'); fireEvent.click(screen.getByText('Rename / edit')); fireEvent.change(input, { target: { value: 'Fresh fantasy' } }); fireEvent.click(screen.getByText('Update preset')); expect(readExplorePresets()[0].name).toBe('Fresh fantasy'); fireEvent.click(screen.getByText('Delete')); expect(readExplorePresets()).toHaveLength(0); fireEvent.click(screen.getByText('Undo deletion')); expect(readExplorePresets()).toHaveLength(1); });
