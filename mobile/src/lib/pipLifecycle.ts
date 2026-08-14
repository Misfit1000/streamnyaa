export type PipLifecycleState = 'idle' | 'eligible' | 'entering' | 'active';

type PipEligibility = {
  streamUrl?: string;
  playing: boolean;
  firstFrameRendered: boolean;
};

export function canEnterPictureInPicture({ streamUrl, playing, firstFrameRendered }: PipEligibility) {
  return Boolean(streamUrl && playing && firstFrameRendered);
}

export function supportsAutomaticPictureInPicture(platform: string, version: string | number) {
  const androidApi = typeof version === 'number' ? version : Number.parseInt(version, 10);
  return platform === 'android' && Number.isFinite(androidApi) && androidApi >= 31;
}

export function shouldPreservePlaybackForPip(state: PipLifecycleState) {
  return state === 'eligible' || state === 'entering' || state === 'active';
}

export function backgroundPauseDelay(state: PipLifecycleState) {
  return shouldPreservePlaybackForPip(state) ? 4_000 : 1_500;
}

export function shouldPauseAfterPipStop(appState: string, allowBackgroundPlayback: boolean) {
  return appState !== 'active' && !allowBackgroundPlayback;
}

export function shouldCloseTaskAfterPipStop(appState: string) {
  return appState !== 'active';
}
