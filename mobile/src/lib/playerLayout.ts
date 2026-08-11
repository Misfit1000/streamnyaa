export type PlayerViewport = {
  width: number;
  height: number;
  fontScale?: number;
  fullscreen: boolean;
};

export type PlayerViewportLayout = {
  compact: boolean;
  controlSize: number;
  controlIconSize: number;
  playControlSize: number;
  playIconSize: number;
  centerGap: number;
  edgePadding: number;
  timeFontSize: number;
  showAdjacentEpisodes: boolean;
  showEpisodeLabel: boolean;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * React Native dimensions are density-independent pixels, so viewport space
 * is the right signal for player layout. Physical pixel density must not make
 * controls enormous on high-resolution phones.
 */
export function playerLayoutForViewport({ width, height, fontScale = 1, fullscreen }: PlayerViewport): PlayerViewportLayout {
  const shortEdge = Math.max(1, Math.min(width, height));
  const playerHeight = fullscreen ? height : Math.min(height, width * 9 / 16);
  const playerShortEdge = Math.max(1, Math.min(width, playerHeight));
  const compact = playerShortEdge < 220 || width < 360 || fontScale > 1.25;
  const controlIconSize = Math.round(clamp(playerShortEdge * (fullscreen ? 0.058 : 0.1), 19, 24));
  const playControlSize = Math.round(clamp(playerShortEdge * (fullscreen ? 0.135 : 0.24), 48, 56));

  return {
    compact,
    controlSize: 48,
    controlIconSize,
    playControlSize,
    playIconSize: Math.round(clamp(playControlSize * 0.54, 26, 30)),
    centerGap: Math.round(clamp(width * 0.018, 6, fullscreen ? 16 : 12)),
    edgePadding: compact ? 4 : fullscreen ? 10 : 6,
    timeFontSize: compact ? 11 : 12,
    showAdjacentEpisodes: fullscreen && width >= 600,
    showEpisodeLabel: width >= 360 && fontScale <= 1.3,
  };
}
