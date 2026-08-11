import type { PropsWithChildren } from 'react';

/**
 * Keeps the app-level player below navigation without creating another
 * VideoView owner. Native-stack Back is intentionally not intercepted here:
 * leaving Watch triggers its focus cleanup, which minimizes playback in one
 * action and reveals the tab-level mini-player.
 */
export function PlayerHost({ children }: PropsWithChildren) {
  return children;
}
