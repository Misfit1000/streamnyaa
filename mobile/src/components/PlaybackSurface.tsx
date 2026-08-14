import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Modal as NativeModal, Platform, Pressable, ScrollView, Share, StatusBar as NativeStatusBar, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent, type NativeSyntheticEvent, type NativeTouchEvent, type StyleProp, type ViewStyle } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { isPictureInPictureSupported, VideoView } from 'expo-video';
import { ActivityIndicator, Button, IconButton, Switch, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayback } from '../context/PlaybackContext';
import { TorrentEngine } from '../native/TorrentEngine';
import { buildSupportReport } from '../services/supportDiagnostics';
import { sourceQualityBucket } from '../../../shared/sources';
import { playerLayoutForViewport } from '../lib/playerLayout';
import { canEnterPictureInPicture, supportsAutomaticPictureInPicture } from '../lib/pipLifecycle';
import { STREAMNYAA_SUBTITLE_DEFAULT, effectiveSubtitleStyle } from '../lib/subtitleStyle';
import { useAppStore } from '../store/useAppStore';
import { tokens } from '../theme';
import type { EngineDiagnostic, EngineHealthReport } from '../types';
import type { SubtitleStylePreferences } from '../../../shared/preferences';

type Playback = ReturnType<typeof usePlayback>;
type Sheet = 'settings' | 'episodes' | 'sources' | 'tracks' | 'subtitleAppearance' | 'speed' | 'video' | 'sleep' | 'diagnostics' | null;
type VideoFit = 'contain' | 'cover';

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = whole % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function PlaybackSurface({ onBrowseSources, onMinimize }: { onBrowseSources?: () => void; onMinimize?: () => void }) {
  const theme = useTheme();
  const playback = usePlayback();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const subtitleStyle = useAppStore((state) => state.playerPreferences.subtitleStyle);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [locked, setLocked] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [videoFit, setVideoFit] = useState<VideoFit>('contain');
  const [seekWidth, setSeekWidth] = useState(1);
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);
  const [pipError, setPipError] = useState('');
  const tapState = useRef<{ side: 'left' | 'right'; at: number } | undefined>(undefined);
  const videoViewRef = useRef<VideoView>(null);
  const pipRequestPending = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fullscreenTransition = useRef(false);
  const layout = useMemo(
    () => playerLayoutForViewport({ width, height, fontScale, fullscreen }),
    [fontScale, fullscreen, height, width],
  );
  const horizontalInset = fullscreen ? Math.max(layout.edgePadding, insets.left, insets.right) : layout.edgePadding;
  const topInset = fullscreen ? insets.top : 0;
  const bottomInset = fullscreen ? insets.bottom : 0;
  const sideSheet = width > height;

  const reveal = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playback.playing && !locked && !sheet) hideTimer.current = setTimeout(() => setControlsVisible(false), 3_500);
  }, [locked, playback.playing, sheet]);

  useEffect(() => {
    reveal();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [reveal]);

  useEffect(() => () => {
    NativeStatusBar.setHidden(false, 'fade');
    void ScreenOrientation.unlockAsync().catch(() => undefined);
    void NavigationBar.setVisibilityAsync('hidden').catch(() => undefined);
  }, []);

  const applySubtitleStyle = useCallback(() => {
    void TorrentEngine.applyPlayerSubtitleStyle(subtitleStyle).catch(() => undefined);
  }, [subtitleStyle]);

  useEffect(() => {
    if (!playback.status.streamUrl) return;
    const timers = [0, 250, 900].map((delay) => setTimeout(applySubtitleStyle, delay));
    return () => timers.forEach(clearTimeout);
  }, [applySubtitleStyle, fullscreen, playback.selectedSubtitleTrack?.id, playback.status.streamUrl]);

  const pipSupported = useMemo(() => {
    try { return Platform.OS === 'android' && isPictureInPictureSupported(); }
    catch { return false; }
  }, []);
  const pipReady = pipSupported && canEnterPictureInPicture({ streamUrl: playback.status.streamUrl, playing: playback.playing, firstFrameRendered });
  const automaticPip = supportsAutomaticPictureInPicture(Platform.OS, Platform.Version);

  useEffect(() => {
    setFirstFrameRendered(false);
    if (playback.pipState !== 'active') playback.setPipState('idle');
  }, [playback.status.streamUrl]);

  useEffect(() => {
    if (playback.pipState === 'active' || playback.pipState === 'entering') return;
    playback.setPipState(pipReady ? 'eligible' : 'idle');
  }, [pipReady, playback.pipState, playback.setPipState]);

  const enterPictureInPicture = useCallback(async (waitForSheetDismiss = false) => {
    if (!videoViewRef.current || !pipReady || playback.pipState === 'active' || pipRequestPending.current) return;
    pipRequestPending.current = true;
    setPipError('');
    playback.setPipState('entering');
    setSheet(null);
    setControlsVisible(false);
    try {
      if (waitForSheetDismiss) await new Promise<void>((resolve) => setTimeout(resolve, 320));
      await videoViewRef.current.startPictureInPicture();
    } catch (error) {
      pipRequestPending.current = false;
      playback.setPipState(pipReady ? 'eligible' : 'idle');
      setControlsVisible(true);
      setPipError(error instanceof Error ? error.message : 'Android could not open picture in picture.');
      if (waitForSheetDismiss) setSheet('settings');
    }
  }, [pipReady, playback.pipState, playback.setPipState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') pipRequestPending.current = false;
      if (nextState === 'background' && !automaticPip && pipReady && playback.pipState !== 'active') {
        void enterPictureInPicture();
      }
    });
    return () => subscription.remove();
  }, [automaticPip, enterPictureInPicture, pipReady, playback.pipState]);

  const toggleFullscreen = async () => {
    if (fullscreenTransition.current) return;
    fullscreenTransition.current = true;
    const next = !fullscreen;
    setFullscreen(next);
    try {
      if (next) {
        NativeStatusBar.setHidden(true, 'fade');
        await NavigationBar.setVisibilityAsync('hidden').catch(() => undefined);
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
      } else {
        setLocked(false);
        NativeStatusBar.setHidden(false, 'fade');
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
        await NavigationBar.setVisibilityAsync('hidden').catch(() => undefined);
      }
    } finally {
      fullscreenTransition.current = false;
    }
    reveal();
  };

  const handleZonePress = (side: 'left' | 'right') => {
    if (locked) { setControlsVisible(true); return; }
    const now = Date.now();
    if (tapState.current?.side === side && now - tapState.current.at <= 320) {
      playback.seekBy(side === 'left' ? -10 : 10);
      tapState.current = undefined;
      reveal();
      return;
    }
    tapState.current = { side, at: now };
    setTimeout(() => {
      if (tapState.current?.side === side && tapState.current.at === now) {
        tapState.current = undefined;
        setControlsVisible((visible) => !visible);
      }
    }, 330);
  };

  const seekFromTouch = (event: NativeSyntheticEvent<NativeTouchEvent>) => {
    if (!playback.duration) return;
    playback.seekTo(event.nativeEvent.locationX / seekWidth * playback.duration);
    reveal();
  };

  const onSeekLayout = (event: LayoutChangeEvent) => setSeekWidth(Math.max(1, event.nativeEvent.layout.width));
  const progress = playback.duration ? Math.min(1, playback.currentTime / playback.duration) : 0;
  const buffer = playback.duration ? Math.min(1, playback.bufferedPosition / playback.duration) : 0;
  const torrentBuffer = Math.min(1, Number(playback.status.bufferedPercent || 0) / 100);
  const visibleBuffer = Math.max(buffer, torrentBuffer);
  const canPrevious = playback.episode > 1;
  const canNext = !playback.anime?.episodes || playback.episode < playback.anime.episodes;
  const streamPreparing = Boolean(playback.status.streamUrl
    && !playback.playing
    && (playback.duration <= 0 || ['connecting', 'buffering', 'recovering'].includes(playback.phase)));

  const surface = (
    <View style={[styles.playerRoot, fullscreen ? styles.fullscreenPlayer : styles.embeddedPlayer]}>
      <StatusBar hidden={fullscreen} style="light" />
      {playback.status.streamUrl ? (
        <VideoView
          ref={videoViewRef}
          style={StyleSheet.absoluteFill}
          player={playback.player}
          nativeControls={false}
          contentFit={videoFit}
          surfaceType="textureView"
          useExoShutter={false}
          allowsPictureInPicture
          startsPictureInPictureAutomatically={automaticPip && pipReady}
          onFirstFrameRender={() => {
            setFirstFrameRendered(true);
            applySubtitleStyle();
          }}
          onPictureInPictureStart={() => {
            pipRequestPending.current = false;
            setPipError('');
            playback.setPipState('active');
            if (!playback.player.playing) playback.play();
          }}
          onPictureInPictureStop={() => {
            pipRequestPending.current = false;
            playback.finishPip(pipReady);
            setControlsVisible(true);
          }}
        />
      ) : null}

      <View style={[StyleSheet.absoluteFill, styles.tapLayer]} pointerEvents="box-none">
        <Pressable style={styles.tapZone} onPress={() => handleZonePress('left')} accessibilityLabel="Video area, double tap to rewind ten seconds" />
        <Pressable style={styles.tapZone} onPress={() => handleZonePress('right')} accessibilityLabel="Video area, double tap to skip ten seconds" />
      </View>

      {!playback.status.streamUrl ? (
        <View style={styles.loading} accessibilityLiveRegion="polite">
          {playback.phase === 'failed'
            ? <View style={styles.loadingMark}><MaterialCommunityIcons name="alert-outline" color="#FFFFFF" size={26} /></View>
            : <ActivityIndicator size={34} color={tokens.color.brandBright} />}
          <Text variant="titleMedium" numberOfLines={2} style={styles.loadingTitle}>{playback.phase === 'failed' ? 'Playback could not start' : playback.status.message}</Text>
          <Text variant="bodySmall" numberOfLines={2} style={styles.loadingDetail}>
            {playback.phase === 'discovering'
              ? 'Checking focused title matches first.'
              : playback.phase === 'failed'
                ? `${playback.status.failureCode ? `${playback.status.failureCode} · ` : ''}${playback.status.error || 'Try another release.'}`
                : `${playback.status.peers} peers · ${playback.status.seeds || 0} seeds · ${playback.status.dhtNodes || 0} DHT nodes`}
          </Text>
          <View style={styles.loadingActions}>
            {playback.phase === 'failed' ? <Button mode="contained" onPress={() => void playback.retry()}>Retry</Button> : null}
            {onBrowseSources ? <Button mode={playback.phase === 'failed' ? 'text' : 'outlined'} onPress={onBrowseSources}>Browse releases</Button> : null}
            {playback.phase === 'failed' ? <Button mode="text" onPress={() => setSheet('diagnostics')}>Diagnostics</Button> : null}
          </View>
        </View>
      ) : null}

      {playback.status.streamUrl && controlsVisible ? (
        <View style={styles.controls} pointerEvents="box-none">
          {locked ? (
            <PlayerIconButton icon="lock-open-variant-outline" iconSize={layout.controlIconSize} containerSize={layout.controlSize} filled style={[styles.unlock, { left: Math.max(12, insets.left + 8) }]} onPress={() => { setLocked(false); reveal(); }} accessibilityLabel="Unlock player controls" />
          ) : (
            <>
              <View style={[styles.topBar, { minHeight: 48 + topInset, paddingTop: topInset, paddingHorizontal: horizontalInset }]}>
                <PlayerIconButton icon="chevron-down" iconSize={layout.controlIconSize + 2} containerSize={layout.controlSize} onPress={fullscreen ? () => void toggleFullscreen() : (onMinimize || playback.minimize)} accessibilityLabel={fullscreen ? 'Exit fullscreen' : 'Minimize player'} />
                <View style={styles.titleCopy}><Text variant="titleSmall" numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.playerTitle}>{playback.anime?.title || 'StreamNyaa'}</Text><Text variant="labelSmall" numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.playerMeta}>Episode {playback.episode}{playback.source ? ` · ${sourceQualityBucket(playback.source.title).replace('other', 'Auto')}` : ''}</Text></View>
                {fullscreen ? <PlayerIconButton icon="lock-outline" iconSize={layout.controlIconSize} containerSize={layout.controlSize} onPress={() => { setLocked(true); setControlsVisible(false); }} accessibilityLabel="Lock player controls" /> : null}
                <PlayerIconButton icon="dots-vertical" iconSize={layout.controlIconSize} containerSize={layout.controlSize} onPress={() => setSheet('settings')} accessibilityLabel="Playback settings" />
              </View>

              {streamPreparing ? (
                <View style={styles.preparingOverlay} accessibilityLiveRegion="polite">
                  <ActivityIndicator size={28} color="#FFFFFF" />
                  <Text variant="titleSmall" numberOfLines={1} style={styles.preparingTitle}>{playback.phase === 'recovering' ? 'Restoring video' : 'Buffering video'}</Text>
                  <Text variant="labelSmall" style={styles.preparingDetail}>{playback.status.peers} peers · {playback.status.seeds || 0} seeds</Text>
                </View>
              ) : (
                <View pointerEvents="box-none" style={[styles.centerControls, { gap: layout.centerGap }]}>
                  {layout.showAdjacentEpisodes ? <PlayerIconButton icon="skip-previous" iconSize={layout.controlIconSize} containerSize={layout.controlSize} disabled={!canPrevious} onPress={() => void playback.changeEpisode(playback.episode - 1)} accessibilityLabel="Previous episode" /> : null}
                  <PlayerIconButton icon="rewind-10" iconSize={layout.controlIconSize + 2} containerSize={layout.controlSize} onPress={() => playback.seekBy(-10)} accessibilityLabel="Rewind ten seconds" />
                  <PlayerIconButton icon={playback.playing ? 'pause' : 'play'} iconSize={layout.playIconSize} containerSize={layout.playControlSize} filled onPress={playback.playing ? playback.pause : playback.play} accessibilityLabel={playback.playing ? 'Pause' : 'Play'} />
                  <PlayerIconButton icon="fast-forward-10" iconSize={layout.controlIconSize + 2} containerSize={layout.controlSize} onPress={() => playback.seekBy(10)} accessibilityLabel="Skip ten seconds" />
                  {layout.showAdjacentEpisodes ? <PlayerIconButton icon="skip-next" iconSize={layout.controlIconSize} containerSize={layout.controlSize} disabled={!canNext} onPress={() => void playback.changeEpisode(playback.episode + 1)} accessibilityLabel="Next episode" /> : null}
                </View>
              )}

              <View style={[styles.bottomControls, { paddingHorizontal: horizontalInset, paddingBottom: Math.max(4, bottomInset) }]}>
                <Pressable style={styles.seekTouch} onLayout={onSeekLayout} onPress={seekFromTouch} accessibilityRole="adjustable" accessibilityLabel={`Playback position ${formatTime(playback.currentTime)} of ${formatTime(playback.duration)}`}>
                  <View style={styles.seekTrack}>
                    <View style={[styles.seekBuffered, { width: `${visibleBuffer * 100}%` }]} />
                    <View style={[styles.seekProgress, { width: `${progress * 100}%` }]} />
                    <View style={[styles.seekThumb, { left: `${progress * 100}%` }]} />
                  </View>
                </Pressable>
                <View style={styles.controlRow}>
                  <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[styles.time, { fontSize: layout.timeFontSize }]}>{formatTime(playback.currentTime)} / {formatTime(playback.duration)}</Text>
                  <View style={styles.rowActions}>
                    <PlayerLabelButton label={layout.showEpisodeLabel ? `Episode ${playback.episode}` : `E${playback.episode}`} compact={!layout.showEpisodeLabel} onPress={() => setSheet('episodes')} />
                    <PlayerIconButton icon="subtitles-outline" iconSize={layout.controlIconSize} containerSize={layout.controlSize} onPress={() => setSheet('tracks')} accessibilityLabel="Audio and subtitles" />
                    <PlayerIconButton icon={fullscreen ? 'fullscreen-exit' : 'fullscreen'} iconSize={layout.controlIconSize + 1} containerSize={layout.controlSize} onPress={() => void toggleFullscreen()} accessibilityLabel={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} />
                  </View>
                </View>
              </View>
            </>
          )}
        </View>
      ) : null}

      {playback.activeSkip ? (
        <Pressable
          onPress={playback.skipActiveSegment}
          accessibilityRole="button"
          accessibilityLabel={`Skip ${playback.activeSkip.type === 'op' ? 'intro' : 'outro'}`}
          style={({ pressed }) => [
            styles.skipButton,
            {
              right: Math.max(12, horizontalInset),
              bottom: (playback.nextEpisodeCountdown !== null ? 126 : 58) + bottomInset,
              borderColor: theme.colors.primary,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <View style={[styles.skipAccent, { backgroundColor: theme.colors.primary }]} />
          <Text style={styles.skipLabel}>Skip {playback.activeSkip.type === 'op' ? 'intro' : 'outro'}</Text>
          <MaterialCommunityIcons name="chevron-right" size={19} color="#FFFFFF" />
        </Pressable>
      ) : null}
      {playback.nextEpisodeCountdown !== null ? (
        <View style={[styles.nextEpisode, { right: Math.max(12, horizontalInset), bottom: 58 + bottomInset }]}>
          <Text variant="titleSmall" style={styles.semibold}>Next episode in {playback.nextEpisodeCountdown}</Text>
          <Button compact onPress={playback.cancelNextEpisode}>Cancel</Button>
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      {fullscreen ? (
        <NativeModal
          visible
          animationType="fade"
          presentationStyle="fullScreen"
          hardwareAccelerated
          statusBarTranslucent
          navigationBarTranslucent
          supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}
          onShow={() => {
            NativeStatusBar.setHidden(true, 'none');
            void NavigationBar.setVisibilityAsync('hidden').catch(() => undefined);
          }}
          onRequestClose={() => void toggleFullscreen()}
        >
          <View style={styles.fullscreen}>{surface}</View>
        </NativeModal>
      ) : surface}
      <NativeModal visible={Boolean(sheet)} transparent animationType="slide" onRequestClose={() => setSheet(null)} statusBarTranslucent>
        <View style={[styles.sheetBackdrop, sideSheet && styles.sideSheetBackdrop]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheet(null)} accessibilityLabel="Close playback settings" />
          <View style={[styles.sheet, sideSheet && styles.sideSheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(12, insets.bottom) }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.sheetContent, sideSheet && { paddingTop: Math.max(18, insets.top + 8), paddingRight: Math.max(18, insets.right + 10) }]}>
            {sheet === 'settings' ? <SettingsSheet playback={playback} videoFit={videoFit} pipSupported={pipSupported} pipReady={pipReady} pipError={pipError} onOpen={setSheet} onEnterPictureInPicture={() => void enterPictureInPicture(true)} /> : null}
            {sheet === 'episodes' ? <EpisodesSheet playback={playback} onClose={() => setSheet(null)} /> : null}
            {sheet === 'sources' ? <SourcesSheet playback={playback} onClose={() => setSheet(null)} /> : null}
            {sheet === 'tracks' ? <TracksSheet playback={playback} onClose={() => setSheet(null)} /> : null}
            {sheet === 'subtitleAppearance' ? <SubtitleAppearanceSheet onClose={() => setSheet('settings')} /> : null}
            {sheet === 'speed' ? <SpeedSheet playback={playback} onClose={() => setSheet('settings')} /> : null}
            {sheet === 'video' ? <VideoSheet value={videoFit} onChange={setVideoFit} onClose={() => setSheet('settings')} /> : null}
            {sheet === 'sleep' ? <SleepSheet playback={playback} onClose={() => setSheet(null)} /> : null}
            {sheet === 'diagnostics' ? <DiagnosticsSheet playback={playback} onClose={() => setSheet(null)} /> : null}
          </ScrollView>
          </View>
        </View>
      </NativeModal>
    </>
  );
}

function SettingsSheet({ playback, videoFit, pipSupported, pipReady, pipError, onOpen, onEnterPictureInPicture }: { playback: Playback; videoFit: VideoFit; pipSupported: boolean; pipReady: boolean; pipError: string; onOpen: (sheet: Sheet) => void; onEnterPictureInPicture: () => void }) {
  const preferences = useAppStore((state) => state.playerPreferences);
  const setPlayerPreferences = useAppStore((state) => state.setPlayerPreferences);
  const selectedSubtitle = playback.selectedSubtitleTrack?.label || playback.selectedSubtitleTrack?.name || playback.selectedSubtitleTrack?.language || 'Off';
  const selectedAudio = playback.selectedAudioTrack?.label || playback.selectedAudioTrack?.name || playback.selectedAudioTrack?.language || 'Default';
  return <>
    <Text variant="titleLarge" style={styles.semibold}>Player settings</Text>
    <SheetAction icon="tune-variant" title="Release" detail={playback.source ? `${sourceQualityBucket(playback.source.title).replace('other', 'Auto')} · ${playback.source.seeders} seeders` : 'Automatic'} onPress={() => onOpen('sources')} />
    <SheetAction icon="subtitles-outline" title="Subtitles / CC" detail={selectedSubtitle} onPress={() => onOpen('tracks')} />
    <SheetAction icon="format-font" title="Subtitle appearance" detail={preferences.subtitleStyle.custom ? `${titleCase(preferences.subtitleStyle.fontSize)} · ${titleCase(preferences.subtitleStyle.position)}` : 'StreamNyaa default'} onPress={() => onOpen('subtitleAppearance')} />
    <SheetAction icon="volume-high" title="Audio" detail={selectedAudio} onPress={() => onOpen('tracks')} />
    <SheetAction icon="aspect-ratio" title="Video fit" detail={videoFit === 'contain' ? 'Fit · no crop' : 'Fill screen · cropped'} onPress={() => onOpen('video')} />
    <SheetAction icon="picture-in-picture-bottom-right-outline" title="Picture in picture" detail={!pipSupported ? 'Not supported on this device' : pipReady ? 'Continue in a floating Android player' : 'Available after video starts'} onPress={pipReady ? onEnterPictureInPicture : undefined} />
    {pipError ? <Text variant="bodySmall" accessibilityLiveRegion="polite" style={styles.playerSettingError}>{pipError}</Text> : null}
    <SheetAction icon="speedometer" title="Playback speed" detail={`${playback.player.playbackRate}×`} onPress={() => onOpen('speed')} />
    <SheetToggle icon="skip-next-circle-outline" title="Auto next episode" value={preferences.autoNextEpisode} onValueChange={(autoNextEpisode) => setPlayerPreferences({ autoNextEpisode })} />
    <SheetToggle icon="skip-forward-outline" title="Auto skip intro" value={preferences.autoSkipIntro} onValueChange={(autoSkipIntro) => setPlayerPreferences({ autoSkipIntro })} />
    <SheetToggle icon="skip-forward" title="Auto skip outro" value={preferences.autoSkipOutro} onValueChange={(autoSkipOutro) => setPlayerPreferences({ autoSkipOutro })} />
    <SheetAction icon="timer-outline" title="Sleep timer" detail={playback.sleepAtEpisodeEnd ? 'End of episode' : playback.sleepEndsAt ? 'Timer active' : 'Off'} onPress={() => onOpen('sleep')} />
    <SheetAction icon="information-outline" title="Connection" detail={`${playback.status.peers} peers · ${playback.status.seeds || 0} seeds · ${(playback.status.downloadRate / 1024 / 1024).toFixed(1)} MB/s`} />
    <SheetAction icon="stethoscope" title="Diagnostics" detail={playback.status.failureStage || playback.status.connectionStage || 'Engine status'} onPress={() => onOpen('diagnostics')} />
  </>;
}

function SpeedSheet({ playback, onClose }: { playback: Playback; onClose: () => void }) {
  return <>
    <SheetTitle title="Playback speed" onBack={onClose} />
    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => <TrackButton key={rate} selected={Math.abs(playback.player.playbackRate - rate) < 0.01} label={`${rate}×`} onPress={() => playback.setPlaybackRate(rate)} />)}
  </>;
}

function VideoSheet({ value, onChange, onClose }: { value: VideoFit; onChange: (value: VideoFit) => void; onClose: () => void }) {
  return <>
    <SheetTitle title="Video fit" onBack={onClose} />
    <TrackButton selected={value === 'contain'} label="Fit · show the whole picture" onPress={() => onChange('contain')} />
    <TrackButton selected={value === 'cover'} label="Fill · crop the edges" onPress={() => onChange('cover')} />
    <Text variant="bodySmall" style={styles.muted}>Fit preserves subtitles and the original aspect ratio. Fill removes side bars on wider phones by cropping the top and bottom.</Text>
  </>;
}

function SubtitleAppearanceSheet({ onClose }: { onClose: () => void }) {
  const style = useAppStore((state) => state.playerPreferences.subtitleStyle);
  const setPlayerPreferences = useAppStore((state) => state.setPlayerPreferences);
  const effective = effectiveSubtitleStyle(style);
  const update = (patch: Partial<SubtitleStylePreferences>) => setPlayerPreferences({ subtitleStyle: { ...patch, custom: true } });
  const reset = () => setPlayerPreferences({ subtitleStyle: STREAMNYAA_SUBTITLE_DEFAULT });
  return <>
    <SheetTitle title="Subtitle appearance" onBack={onClose} />
    <View style={styles.subtitlePreset}>
      <MaterialCommunityIcons name="format-font" size={24} color={tokens.color.brandBright} />
      <View style={styles.sheetActionCopy}><Text variant="labelLarge" style={styles.semibold}>StreamNyaa default</Text><Text variant="bodySmall" style={styles.muted}>Semibold, warm white text and a dark readability outline</Text></View>
    </View>
    <ChoiceGroup title="Size" value={effective.fontSize} choices={[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large'], ['extra_large', 'XL']]} onChange={(fontSize) => update({ fontSize })} />
    <ChoiceGroup title="Position" value={effective.position} choices={[['low', 'Low'], ['normal', 'Normal'], ['high', 'High']]} onChange={(position) => update({ position })} />
    <ChoiceGroup title="Text" value={effective.textColor} choices={[['white', 'White'], ['yellow', 'Yellow'], ['red', 'Red'], ['cyan', 'Cyan']]} onChange={(textColor) => update({ textColor })} />
    <ChoiceGroup title="Outline" value={effective.outline} choices={[['none', 'Off'], ['medium', 'Default outline']]} onChange={(outline) => update({ outline })} />
    <ChoiceGroup title="Background" value={effective.background} choices={[['off', 'Off'], ['light', 'Light'], ['dark', 'Dark']]} onChange={(background) => update({ background })} />
    <Button mode="outlined" icon="restore" contentStyle={styles.choiceButtonContent} onPress={reset}>Reset StreamNyaa default</Button>
  </>;
}

function EpisodesSheet({ playback, onClose }: { playback: Playback; onClose: () => void }) {
  const total = Math.min(Number(playback.anime?.episodes || playback.episode + 12), 500);
  const start = Math.max(1, playback.episode - 8);
  const end = Math.min(total, start + 20);
  return <><Text variant="titleLarge" style={styles.semibold}>Episodes</Text><View style={styles.episodeGrid}>{Array.from({ length: end - start + 1 }, (_, index) => start + index).map((item) => <Button key={item} mode={item === playback.episode ? 'contained' : 'outlined'} style={styles.episodeButton} onPress={() => { onClose(); void playback.changeEpisode(item); }}>{item}</Button>)}</View></>;
}

function SourcesSheet({ playback, onClose }: { playback: Playback; onClose: () => void }) {
  return <><Text variant="titleLarge" style={styles.semibold}>Playback releases</Text><Text variant="bodySmall" style={styles.muted}>Automatic playback tries up to three ranked releases. Pick one to override it.</Text>{playback.sources.slice(0, 12).map((item) => <Pressable key={`${item.infoHash}-${item.title}`} style={styles.sourceRow} onPress={() => { onClose(); void playback.selectSource(item); }} accessibilityRole="button"><View style={styles.sourceCopy}><Text variant="labelLarge" numberOfLines={2} style={styles.semibold}>{item.title}</Text><Text variant="labelSmall" style={styles.muted}>{item.seeders} seeders · {item.size || 'size unknown'} · {sourceQualityBucket(item.title).replace('other', 'Auto')}</Text></View>{playback.source?.infoHash === item.infoHash ? <MaterialCommunityIcons name="check-circle" size={22} color={tokens.color.brandBright} /> : <MaterialCommunityIcons name="play-circle-outline" size={24} color="#FFFFFF" />}</Pressable>)}</>;
}

function TracksSheet({ playback, onClose }: { playback: Playback; onClose: () => void }) {
  return <><Text variant="titleLarge" style={styles.semibold}>Audio</Text>{playback.availableAudioTracks.length ? playback.availableAudioTracks.map((track, index) => <TrackButton key={track.id || `${track.language}-${index}`} selected={playback.selectedAudioTrack?.id === track.id} label={track.label || track.name || track.language || `Audio ${index + 1}`} onPress={() => playback.setAudioTrack(track)} />) : <Text variant="bodyMedium" style={styles.muted}>This release exposes one default audio track.</Text>}<Text variant="titleLarge" style={styles.sectionTitle}>Subtitles</Text><TrackButton selected={!playback.selectedSubtitleTrack} label="Off" onPress={() => playback.setSubtitleTrack(null)} />{playback.availableSubtitleTracks.map((track, index) => <TrackButton key={track.id || `${track.language}-${index}`} selected={playback.selectedSubtitleTrack?.id === track.id} label={track.label || track.name || track.language || `Subtitle ${index + 1}`} onPress={() => playback.setSubtitleTrack(track)} />)}<Button onPress={onClose}>Done</Button></>;
}

function SleepSheet({ playback, onClose }: { playback: Playback; onClose: () => void }) {
  const choose = (value: number | null | 'episode') => { playback.setSleepTimer(value); onClose(); };
  return <><Text variant="titleLarge" style={styles.semibold}>Sleep timer</Text>{([15, 30, 45, 60] as const).map((minutes) => <SheetAction key={minutes} icon="timer-outline" title={`${minutes} minutes`} onPress={() => choose(minutes)} />)}<SheetAction icon="skip-next-outline" title="End of episode" onPress={() => choose('episode')} /><SheetAction icon="timer-off-outline" title="Turn off timer" onPress={() => choose(null)} /></>;
}

function DiagnosticsSheet({ playback, onClose }: { playback: Playback; onClose: () => void }) {
  const [health, setHealth] = useState<EngineHealthReport>();
  const [diagnostics, setDiagnostics] = useState<EngineDiagnostic[]>([]);
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([TorrentEngine.getEngineHealth(), TorrentEngine.getDiagnostics()]).then(([nextHealth, nextDiagnostics]) => {
      if (!active) return;
      setHealth(nextHealth);
      setDiagnostics(nextDiagnostics);
    });
    return () => { active = false; };
  }, []);
  const shareReport = async () => {
    setSharing(true);
    try {
      const report = await buildSupportReport({
        playback: {
          animeId: playback.anime?.id,
          episode: playback.episode,
          source: playback.source,
          phase: playback.phase,
          currentTime: playback.currentTime,
          duration: playback.duration,
          status: playback.status,
        },
      });
      await Share.share({ title: 'StreamNyaa playback diagnostics', message: JSON.stringify(report, null, 2) });
    } finally {
      setSharing(false);
    }
  };
  return <>
    <View style={styles.sheetTitleRow}>
      <Text variant="titleLarge" style={styles.semibold}>Playback diagnostics</Text>
      <IconButton icon="close" onPress={onClose} accessibilityLabel="Close diagnostics" />
    </View>
    <Text variant="bodySmall" style={styles.muted}>No account data, access tokens, or full magnet links are included.</Text>
    <View style={styles.diagnosticGrid}>
      <DiagnosticValue label="Stage" value={playback.status.failureStage || playback.status.connectionStage || 'idle'} />
      <DiagnosticValue label="Peers" value={String(playback.status.peers)} />
      <DiagnosticValue label="DHT nodes" value={String(playback.status.dhtNodes || 0)} />
      <DiagnosticValue label="Native engine" value={health?.nativeLibraryLoaded ? 'Loaded' : health ? 'Unavailable' : 'Checking'} />
      <DiagnosticValue label="Worker" value={health?.serviceConnected ? 'Connected' : health ? 'Disconnected' : 'Checking'} />
      <DiagnosticValue label="Loopback" value={health?.loopbackReachable ? 'Available' : health ? 'Unavailable' : 'Checking'} />
    </View>
    {diagnostics.slice(-6).reverse().map((entry) => <View key={`${entry.at}-${entry.code}`} style={styles.diagnosticRow}><Text variant="labelMedium" style={styles.semibold}>{entry.code}</Text><Text variant="bodySmall" style={styles.muted}>{entry.stage} · {entry.message}</Text></View>)}
    <Button mode="contained" icon="share-variant-outline" loading={sharing} disabled={sharing} onPress={() => void shareReport()}>Share diagnostics</Button>
  </>;
}

function DiagnosticValue({ label, value }: { label: string; value: string }) {
  return <View style={styles.diagnosticValue}><Text variant="labelSmall" style={styles.muted}>{label}</Text><Text variant="labelLarge" numberOfLines={1} style={styles.semibold}>{value}</Text></View>;
}

function SheetTitle({ title, onBack }: { title: string; onBack: () => void }) {
  return <View style={styles.sheetTitleRow}><IconButton icon="arrow-left" size={22} onPress={onBack} accessibilityLabel={`Back from ${title}`} /><Text variant="titleLarge" style={[styles.semibold, styles.sheetTitle]}>{title}</Text></View>;
}

function ChoiceGroup({ title, value, choices, onChange }: { title: string; value: string; choices: ReadonlyArray<readonly [string, string]>; onChange: (value: string) => void }) {
  return <View style={styles.choiceGroup}><Text variant="labelLarge" style={styles.semibold}>{title}</Text><View style={styles.choiceRow}>{choices.map(([choice, label]) => {
    const selected = value === choice;
    return <Pressable key={choice} accessibilityRole="radio" accessibilityLabel={`${title}: ${label}`} accessibilityState={{ selected }} onPress={() => onChange(choice)} style={({ pressed }) => [styles.choiceButton, selected ? styles.choiceButtonSelected : styles.choiceButtonUnselected, pressed && styles.playerControlPressed]}><Text variant="labelLarge" style={[styles.choiceButtonLabel, selected && styles.choiceButtonLabelSelected]}>{label}</Text></Pressable>;
  })}</View></View>;
}

function SheetAction({ icon, title, detail, onPress }: { icon: string; title: string; detail?: string; onPress?: () => void }) {
  return <Pressable style={styles.sheetAction} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}><MaterialCommunityIcons name={icon as any} size={24} color="#E11D48" /><View style={styles.sheetActionCopy}><Text variant="labelLarge" style={styles.semibold}>{title}</Text>{detail ? <Text variant="bodySmall" style={styles.muted}>{detail}</Text> : null}</View>{onPress ? <MaterialCommunityIcons name="chevron-right" size={23} color="#A9A2A6" /> : null}</Pressable>;
}

function SheetToggle({ icon, title, detail, value, onValueChange }: { icon: string; title: string; detail?: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return <Pressable style={styles.sheetAction} onPress={() => onValueChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }}><MaterialCommunityIcons name={icon as any} size={24} color="#E11D48" /><View style={styles.sheetActionCopy}><Text variant="labelLarge" style={styles.semibold}>{title}</Text>{detail ? <Text variant="bodySmall" style={styles.muted}>{detail}</Text> : null}</View><View pointerEvents="none"><Switch value={value} /></View></Pressable>;
}

function TrackButton({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return <Pressable style={styles.trackButton} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}><MaterialCommunityIcons name={selected ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={selected ? tokens.color.brandBright : tokens.color.textMuted} /><Text variant="bodyLarge" style={styles.trackLabel}>{label}</Text></Pressable>;
}

function PlayerIconButton({
  icon,
  iconSize,
  containerSize,
  accessibilityLabel,
  onPress,
  filled = false,
  disabled = false,
  style,
}: {
  icon: string;
  iconSize: number;
  containerSize: number;
  accessibilityLabel: string;
  onPress: () => void;
  filled?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.playerIconButton,
        { width: containerSize, height: containerSize, borderRadius: containerSize / 2 },
        filled && styles.playerIconButtonFilled,
        disabled && styles.playerControlDisabled,
        pressed && !disabled && styles.playerControlPressed,
        style,
      ]}
    >
      <MaterialCommunityIcons name={icon as any} size={iconSize} color="#FFFFFF" />
    </Pressable>
  );
}

function PlayerLabelButton({ label, compact, onPress }: { label: string; compact: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Choose episode, current ${label}`}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.playerLabelButton, compact && styles.playerLabelButtonCompact, pressed && styles.playerControlPressed]}
    >
      <MaterialCommunityIcons name="format-list-numbered" size={20} color="#FFFFFF" />
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.playerLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  playerRoot: { width: '100%', backgroundColor: '#000000', overflow: 'hidden' },
  embeddedPlayer: { aspectRatio: 16 / 9 },
  fullscreenPlayer: { flex: 1, width: '100%', height: '100%' },
  fullscreen: { flex: 1, width: '100%', height: '100%', backgroundColor: '#000000' },
  tapZone: { flex: 1 },
  tapLayer: { flexDirection: 'row' },
  loading: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 9, backgroundColor: '#070708' },
  loadingMark: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.brand },
  loadingTitle: { color: '#F7F4F5', fontWeight: '600', textAlign: 'center' },
  loadingDetail: { color: '#AAA4A7', textAlign: 'center' },
  loadingActions: { minHeight: 48, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 },
  controls: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.46)', justifyContent: 'space-between' },
  topBar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.32)' },
  titleCopy: { flex: 1, minWidth: 0 },
  playerTitle: { color: '#FFFFFF', fontWeight: '600' },
  playerMeta: { color: '#C7C1C4', marginTop: 2 },
  centerControls: { position: 'absolute', left: 0, right: 0, top: 48, bottom: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  preparingOverlay: { position: 'absolute', alignSelf: 'center', top: '35%', minWidth: 148, maxWidth: '68%', alignItems: 'center', gap: 3, paddingHorizontal: 14, paddingVertical: 9, borderRadius: tokens.radius.control, backgroundColor: 'rgba(5,5,6,0.84)' },
  preparingTitle: { color: '#FFFFFF', fontWeight: '600' },
  preparingDetail: { color: '#C7C1C4' },
  bottomControls: { marginTop: 'auto', backgroundColor: 'rgba(0,0,0,0.32)' },
  seekTouch: { height: 22, justifyContent: 'center' },
  seekTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)' },
  seekBuffered: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.45)', borderRadius: 2 },
  seekProgress: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: tokens.color.brandBright, borderRadius: 2 },
  seekThumb: { position: 'absolute', top: -4, width: 12, height: 12, marginLeft: -6, borderRadius: 6, backgroundColor: tokens.color.brandBright },
  controlRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowActions: { flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  time: { flexShrink: 1, color: '#FFFFFF', fontVariant: ['tabular-nums'], lineHeight: 16 },
  playerIconButton: { flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  playerIconButtonFilled: { backgroundColor: 'rgba(225,29,72,0.94)' },
  playerControlPressed: { backgroundColor: 'rgba(255,255,255,0.16)' },
  playerControlDisabled: { opacity: 0.34 },
  playerLabelButton: { minWidth: 48, maxWidth: 116, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8, borderRadius: tokens.radius.control },
  playerLabelButtonCompact: { width: 48, paddingHorizontal: 3, gap: 2 },
  playerLabel: { flexShrink: 1, color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '600' },
  unlock: { position: 'absolute', top: '50%', marginTop: -24 },
  skipButton: { position: 'absolute', minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: tokens.radius.pill, borderWidth: StyleSheet.hairlineWidth, backgroundColor: 'rgba(5,5,6,0.92)' },
  skipAccent: { width: 3, height: 18, borderRadius: 2 },
  skipLabel: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '600', letterSpacing: 0.1 },
  nextEpisode: { position: 'absolute', minWidth: 180, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 12, borderRadius: tokens.radius.card, backgroundColor: 'rgba(12,12,14,0.94)' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.58)' },
  sideSheetBackdrop: { alignItems: 'flex-end', justifyContent: 'center' },
  sheet: { maxHeight: '78%', marginHorizontal: 0, borderTopLeftRadius: tokens.radius.card, borderTopRightRadius: tokens.radius.card, paddingBottom: 12 },
  sideSheet: { width: '46%', maxWidth: 440, height: '100%', maxHeight: '100%', borderTopRightRadius: 0, borderBottomLeftRadius: tokens.radius.card },
  sheetContent: { padding: 18, gap: 10 },
  sheetTitleRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { flex: 1 },
  sheetAction: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
  sheetActionCopy: { flex: 1, gap: 2 },
  playerSettingError: { color: tokens.color.brandBright, marginTop: -6, paddingHorizontal: 4 },
  rateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
  subtitlePreset: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, borderRadius: tokens.radius.control, backgroundColor: 'rgba(225,29,72,0.08)' },
  choiceGroup: { gap: 8, paddingVertical: 3 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceButton: { minWidth: 72, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: tokens.radius.control, borderWidth: StyleSheet.hairlineWidth },
  choiceButtonSelected: { backgroundColor: tokens.color.brandDeep, borderColor: tokens.color.brandBright },
  choiceButtonUnselected: { backgroundColor: 'transparent', borderColor: tokens.color.outline },
  choiceButtonLabel: { color: tokens.color.textMuted },
  choiceButtonLabelSelected: { color: '#FFFFFF', fontWeight: '600' },
  choiceButtonContent: { minHeight: 48 },
  episodeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  episodeButton: { minWidth: 56 },
  sourceRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.color.outline },
  sourceCopy: { flex: 1, gap: 4 },
  trackButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  trackLabel: { flex: 1 },
  diagnosticGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: tokens.color.outline, paddingVertical: 8 },
  diagnosticValue: { width: '50%', minHeight: 52, justifyContent: 'center', gap: 3 },
  diagnosticRow: { minHeight: 48, justifyContent: 'center', gap: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.color.outline },
  sectionTitle: { fontWeight: '600', marginTop: 10 },
  semibold: { fontWeight: '600' },
  muted: { color: tokens.color.textMuted },
});
