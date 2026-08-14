import { describe, expect, it } from 'vitest';
import {
  backgroundPauseDelay,
  canEnterPictureInPicture,
  shouldCloseTaskAfterPipStop,
  shouldPreservePlaybackForPip,
  shouldPauseAfterPipStop,
  supportsAutomaticPictureInPicture,
} from './pipLifecycle';

describe('picture-in-picture lifecycle', () => {
  it('requires a playing stream with a rendered frame', () => {
    expect(canEnterPictureInPicture({ streamUrl: 'http://127.0.0.1/video', playing: true, firstFrameRendered: true })).toBe(true);
    expect(canEnterPictureInPicture({ streamUrl: 'http://127.0.0.1/video', playing: true, firstFrameRendered: false })).toBe(false);
    expect(canEnterPictureInPicture({ streamUrl: '', playing: true, firstFrameRendered: true })).toBe(false);
    expect(canEnterPictureInPicture({ streamUrl: 'http://127.0.0.1/video', playing: false, firstFrameRendered: true })).toBe(false);
  });

  it('uses platform auto-entry only on Android 12 and newer', () => {
    expect(supportsAutomaticPictureInPicture('android', 31)).toBe(true);
    expect(supportsAutomaticPictureInPicture('android', '36')).toBe(true);
    expect(supportsAutomaticPictureInPicture('android', 30)).toBe(false);
    expect(supportsAutomaticPictureInPicture('ios', 36)).toBe(false);
  });

  it('preserves playback during eligible, entering, and active PiP states', () => {
    expect(shouldPreservePlaybackForPip('idle')).toBe(false);
    expect(shouldPreservePlaybackForPip('eligible')).toBe(true);
    expect(shouldPreservePlaybackForPip('entering')).toBe(true);
    expect(shouldPreservePlaybackForPip('active')).toBe(true);
    expect(backgroundPauseDelay('idle')).toBe(1_500);
    expect(backgroundPauseDelay('entering')).toBe(4_000);
  });

  it('stops hidden playback when the user closes PiP outside the app', () => {
    expect(shouldPauseAfterPipStop('background', false)).toBe(true);
    expect(shouldPauseAfterPipStop('active', false)).toBe(false);
    expect(shouldPauseAfterPipStop('background', true)).toBe(false);
    expect(shouldCloseTaskAfterPipStop('background')).toBe(true);
    expect(shouldCloseTaskAfterPipStop('active')).toBe(false);
  });
});
