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

it('replaces an ultrawide strip with a supplied poster and keeps a lone panorama filled', () => {
  const view = render(<DesktopEpisodeThumbnail artwork={{ candidates: ['https://example.com/banner.jpg', 'https://example.com/poster.jpg'], specific: false, specificCount: 0, label: 'Series artwork' }} title="Series" />);
  const image = screen.getByRole('img');
  Object.defineProperties(image, { naturalWidth: { configurable: true, value: 1900 }, naturalHeight: { configurable: true, value: 400 } });
  fireEvent.load(image);
  expect(screen.getByRole('img').getAttribute('src')).toBe('https://example.com/poster.jpg');
  Object.defineProperties(image, { naturalWidth: { configurable: true, value: 720 }, naturalHeight: { configurable: true, value: 1080 } });
  fireEvent.load(image); expect(image.className).toContain('object-contain');
  view.rerender(<DesktopEpisodeThumbnail artwork={{ candidates: ['https://example.com/wide.jpg'], specific: false, specificCount: 0, label: 'Series artwork' }} title="Other series" />);
  const replacement = screen.getByRole('img');
  Object.defineProperties(replacement, { naturalWidth: { configurable: true, value: 1900 }, naturalHeight: { configurable: true, value: 400 } });
  fireEvent.load(replacement); expect(replacement.className).toContain('object-cover');
});
