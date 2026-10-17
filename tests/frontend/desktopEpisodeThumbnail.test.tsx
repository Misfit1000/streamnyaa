import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DesktopEpisodeThumbnail from '../../src/components/DesktopEpisodeThumbnail';
afterEach(cleanup);
it('changes its accessible provenance when a failed still falls back to series artwork', () => {
  const view = render(<DesktopEpisodeThumbnail artwork={{ candidates: ['https://example.com/still.jpg', 'https://example.com/series.jpg'], specific: true, specificCount: 1, label: 'Episode 1 artwork' }} title="Episode 1" />);
  expect(screen.getByTitle('Episode 1 artwork')).toBeTruthy();
  fireEvent.error(screen.getByRole('img'));
  expect(screen.getByTitle('Series artwork')).toBeTruthy();
  expect(screen.getByRole('img').getAttribute('src')).toBe('https://example.com/series.jpg');
  fireEvent.error(screen.getByRole('img')); expect(screen.queryByRole('img')).toBeNull();
  view.rerender(<DesktopEpisodeThumbnail artwork={{ candidates: ['https://example.com/other.jpg'], specific: true, specificCount: 1, label: 'Episode 2 artwork' }} title="Episode 2" />);
  expect(screen.getByRole('img').getAttribute('src')).toBe('https://example.com/other.jpg');
});
