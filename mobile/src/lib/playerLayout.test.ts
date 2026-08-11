import { describe, expect, it } from 'vitest';
import { playerLayoutForViewport } from './playerLayout';

describe('playerLayoutForViewport', () => {
  it('keeps accessible touch targets without oversized high-resolution controls', () => {
    const layout = playerLayoutForViewport({ width: 412, height: 232, fullscreen: false });
    expect(layout.controlSize).toBe(48);
    expect(layout.playControlSize).toBeLessThanOrEqual(56);
    expect(layout.controlIconSize).toBeLessThanOrEqual(24);
  });

  it('compacts labels on small screens and large display-font settings', () => {
    const small = playerLayoutForViewport({ width: 320, height: 180, fontScale: 1.4, fullscreen: false });
    expect(small.compact).toBe(true);
    expect(small.showEpisodeLabel).toBe(false);
    expect(small.controlSize).toBe(48);
    expect(small.playControlSize).toBe(48);
  });

  it('adds adjacent episode controls only when landscape has enough width', () => {
    expect(playerLayoutForViewport({ width: 915, height: 412, fullscreen: true }).showAdjacentEpisodes).toBe(true);
    expect(playerLayoutForViewport({ width: 540, height: 320, fullscreen: true }).showAdjacentEpisodes).toBe(false);
  });
});
