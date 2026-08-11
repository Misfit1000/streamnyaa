import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useEventListener } from 'expo';
import { useVideoPlayer, type AudioTrack, type SubtitleTrack, type VideoPlayer } from 'expo-video';
import { queryClient } from '../lib/queryClient';
import { minimumRequiredCacheMiB, rankMobileSources, sourcesWithinCacheLimit } from '../lib/mobileSourcePolicy';
import { nextRecoverySource } from '../lib/playbackRecovery';
import { equivalentTrack, preferredTrackIndexes } from '../lib/trackSelection';
import { TorrentEngine } from '../native/TorrentEngine';
import { fetchSkipIntervals } from '../services/aniskip';
import { searchAnimeSources } from '../services/sources';
import { useAppStore } from '../store/useAppStore';
import type { Anime, SkipInterval, TorrentSource, TorrentStreamStatus } from '../types';

export type PlaybackPhase = 'idle' | 'discovering' | 'connecting' | 'buffering' | 'playing' | 'paused' | 'recovering' | 'minimized' | 'failed';
export type PlaybackPresentation = 'hidden' | 'full' | 'mini';

type StartPlaybackRequest = {
  anime: Anime;
  episode?: number;
  source?: TorrentSource;
  resumeSeconds?: number;
  force?: boolean;
};

type PlaybackContextValue = {
  player: VideoPlayer;
  anime?: Anime;
  episode: number;
  source?: TorrentSource;
  sources: TorrentSource[];
  status: TorrentStreamStatus;
  phase: PlaybackPhase;
  presentation: PlaybackPresentation;
  currentTime: number;
  duration: number;
  bufferedPosition: number;
  playing: boolean;
  availableAudioTracks: AudioTrack[];
  availableSubtitleTracks: SubtitleTrack[];
  selectedAudioTrack: AudioTrack | null;
  selectedSubtitleTrack: SubtitleTrack | null;
  activeSkip?: SkipInterval;
  nextEpisodeCountdown: number | null;
  sleepEndsAt: number | null;
  sleepAtEpisodeEnd: boolean;
  resolvedProfile: 'standard' | 'constrained';
  startPlayback: (request: StartPlaybackRequest) => Promise<void>;
  selectSource: (source: TorrentSource) => Promise<void>;
  changeEpisode: (episode: number, automatic?: boolean) => Promise<void>;
  play: () => void;
  pause: () => void;
  seekBy: (seconds: number) => void;
  seekTo: (seconds: number) => void;
  minimize: () => void;
  expand: () => void;
  close: () => Promise<void>;
  retry: () => Promise<void>;
  setPipActive: (active: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setAudioTrack: (track: AudioTrack | null) => void;
  setSubtitleTrack: (track: SubtitleTrack | null) => void;
  skipActiveSegment: () => void;
  cancelNextEpisode: () => void;
  setSleepTimer: (minutes: number | null | 'episode') => void;
};

const idleStatus: TorrentStreamStatus = {
  state: 'idle',
  message: 'Choose an episode to begin.',
  progress: 0,
  bufferedPercent: 0,
  peers: 0,
  downloadRate: 0,
};

const PlaybackContext = createContext<PlaybackContextValue | null>(null);
const sourceId = (source: TorrentSource) => source.infoHash || source.magnet;

export function PlaybackProvider({ children }: PropsWithChildren) {
  const resourcePolicy = useAppStore((state) => state.resourcePolicy);
  const playerPreferences = useAppStore((state) => state.playerPreferences);
  const audioPreference = useAppStore((state) => state.audioPreference);
  const saveProgress = useAppStore((state) => state.saveProgress);
  const recordSourceFailure = useAppStore((state) => state.recordSourceFailure);
  const clearSourceFailure = useAppStore((state) => state.clearSourceFailure);
  const nativeProfile = useMemo(() => TorrentEngine.getRuntimeProfile(), []);
  const resolvedProfile = resourcePolicy.performanceProfile === 'auto'
    ? nativeProfile.resolvedProfile
    : resourcePolicy.performanceProfile;
  const player = useVideoPlayer(null);
  const [anime, setAnime] = useState<Anime>();
  const [episode, setEpisode] = useState(1);
  const [source, setSource] = useState<TorrentSource>();
  const [sources, setSources] = useState<TorrentSource[]>([]);
  const [status, setStatus] = useState<TorrentStreamStatus>(idleStatus);
  const [phase, setPhase] = useState<PlaybackPhase>('idle');
  const [presentation, setPresentation] = useState<PlaybackPresentation>('hidden');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPosition, setBufferedPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [availableAudioTracks, setAvailableAudioTracks] = useState<AudioTrack[]>([]);
  const [availableSubtitleTracks, setAvailableSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<AudioTrack | null>(null);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<SubtitleTrack | null>(null);
  const [skipIntervals, setSkipIntervals] = useState<SkipInterval[]>([]);
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState<number | null>(null);
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);
  const [sleepAtEpisodeEnd, setSleepAtEpisodeEnd] = useState(false);
  const presentationRef = useRef<PlaybackPresentation>('hidden');
  const generation = useRef(0);
  const sessionRef = useRef<{ anime?: Anime; episode: number; source?: TorrentSource; currentTime: number; duration: number }>({ episode: 1, currentTime: 0, duration: 0 });
  const candidatesRef = useRef<TorrentSource[]>([]);
  const failedRef = useRef(new Set<string>());
  const attemptsRef = useRef(0);
  const recoveryRef = useRef(false);
  const mountedRef = useRef(true);
  const loadedStreamRef = useRef('');
  const resumeSecondsRef = useRef(0);
  const lastProgressSaveRef = useRef(0);
  const prefetchKeyRef = useRef('');
  const skippedIntervalsRef = useRef(new Set<string>());
  const pipActiveRef = useRef(false);
  const pausedForBackgroundRef = useRef(false);
  const pausedForNetworkRef = useRef(false);
  const playbackDesiredRef = useRef(false);
  const playerReadRetriesRef = useRef(0);
  const playerReadRecoveryRef = useRef(false);
  const requestedAudioTrackRef = useRef<AudioTrack | null | undefined>(undefined);
  const requestedSubtitleTrackRef = useRef<SubtitleTrack | null | undefined>(undefined);
  const startCandidateRef = useRef<(candidate: TorrentSource, automatic?: boolean) => Promise<void>>(async () => undefined);
  presentationRef.current = presentation;

  useEffect(() => {
    player.timeUpdateEventInterval = resolvedProfile === 'constrained' ? 1 : 0.5;
    player.bufferOptions = resolvedProfile === 'constrained'
      ? { preferredForwardBufferDuration: 10, minBufferForPlayback: 2, maxBufferBytes: 16 * 1024 * 1024, prioritizeTimeOverSizeThreshold: true }
      : { preferredForwardBufferDuration: 20, minBufferForPlayback: 2, maxBufferBytes: 32 * 1024 * 1024, prioritizeTimeOverSizeThreshold: true };
    player.staysActiveInBackground = resourcePolicy.allowBackgroundPlayback;
    player.showNowPlayingNotification = Boolean(anime);
  }, [anime, player, resolvedProfile, resourcePolicy.allowBackgroundPlayback]);

  const persistProgress = useCallback(() => {
    const snapshot = sessionRef.current;
    if (!snapshot.anime || !snapshot.source || snapshot.currentTime <= 0) return;
    saveProgress({
      key: `${snapshot.anime.id}::${snapshot.episode}`,
      animeId: String(snapshot.anime.id),
      animeTitle: snapshot.anime.title,
      episode: snapshot.episode,
      sourceTitle: snapshot.source.title,
      magnet: snapshot.source.magnet,
      image: snapshot.anime.cover,
      progressPercent: snapshot.duration ? Math.min(100, snapshot.currentTime / snapshot.duration * 100) : 0,
      resumeSeconds: snapshot.currentTime,
      durationSeconds: snapshot.duration,
      updatedAt: new Date().toISOString(),
    });
    lastProgressSaveRef.current = Date.now();
  }, [saveProgress]);

  const failCurrentSource = useCallback((reason: string, failureStage?: string, failureCode?: string) => {
    if (recoveryRef.current) return;
    const active = sessionRef.current.source;
    if (active) {
      failedRef.current.add(sourceId(active));
      recordSourceFailure(sourceId(active), reason);
    }
    const next = nextRecoverySource(candidatesRef.current, failedRef.current, attemptsRef.current);
    if (!next) {
      setPhase('failed');
      setStatus((previous) => ({
        ...previous,
        state: 'error',
        connectionStage: 'failed',
        message: reason,
        error: reason,
        failureStage: failureStage || previous.failureStage || 'all-sources',
        failureCode: failureCode || previous.failureCode || 'ALL_SOURCES_FAILED',
      }));
      return;
    }
    recoveryRef.current = true;
    setPhase('recovering');
    setStatus((previous) => ({ ...previous, message: `Trying another release after: ${reason}` }));
    const retryGeneration = generation.current;
    setTimeout(() => {
      recoveryRef.current = false;
      if (!mountedRef.current || retryGeneration !== generation.current) return;
      void startCandidateRef.current(next, true);
    }, 650);
  }, [recordSourceFailure]);

  const startCandidate = useCallback(async (candidate: TorrentSource, automatic = false) => {
    const activeAnime = sessionRef.current.anime;
    const activeEpisode = sessionRef.current.episode;
    if (!activeAnime) return;
    const requestGeneration = generation.current;
    attemptsRef.current += 1;
    playbackDesiredRef.current = true;
    playerReadRetriesRef.current = 0;
    playerReadRecoveryRef.current = false;
    requestedAudioTrackRef.current = undefined;
    requestedSubtitleTrackRef.current = undefined;
    setSource(candidate);
    setAvailableAudioTracks([]);
    setAvailableSubtitleTracks([]);
    setSelectedAudioTrack(null);
    setSelectedSubtitleTrack(null);
    sessionRef.current.source = candidate;
    setPhase(automatic ? 'recovering' : 'connecting');
    setStatus({ ...idleStatus, state: 'metadata', connectionStage: 'engine-start', message: automatic ? `Trying release ${attemptsRef.current} of 3…` : 'Starting peer discovery…' });
    loadedStreamRef.current = '';
    player.pause();
    await player.replaceAsync(null).catch(() => undefined);
    try {
      const result = await TorrentEngine.startStream(candidate.magnet, `episode:${activeEpisode}`, {
        wifiOnly: resourcePolicy.wifiOnly,
        maxCacheMiB: resourcePolicy.maxCacheMiB,
        batterySaver: resourcePolicy.batterySaver || resolvedProfile === 'constrained',
        performanceProfile: resolvedProfile,
        animeId: String(activeAnime.id),
        animeTitle: activeAnime.title,
        episode: activeEpisode,
        sourceTitle: candidate.title,
        infoHash: candidate.infoHash,
        torrentUrl: candidate.link,
        metadataUrls: candidate.metadataUrls,
      });
      if (!mountedRef.current || requestGeneration !== generation.current) return;
      if (!result.ok) {
        failCurrentSource(result.error.message, result.error.stage, result.error.errorCode);
        return;
      }
      const next = result.value;
      if (next.state === 'error') {
        failCurrentSource(next.error || next.message, next.failureStage, next.failureCode);
        return;
      }
      setStatus(next);
    } catch (error) {
      if (requestGeneration !== generation.current) return;
      failCurrentSource(error instanceof Error ? error.message : 'The release could not start.', 'native-bridge', 'START_EXCEPTION');
    }
  }, [failCurrentSource, player, resolvedProfile, resourcePolicy.batterySaver, resourcePolicy.maxCacheMiB, resourcePolicy.wifiOnly]);
  startCandidateRef.current = startCandidate;

  const discoverSources = useCallback(async (targetAnime: Anime, targetEpisode: number) => {
    const queryKey = ['playback-sources', targetAnime.id, targetEpisode, audioPreference, resolvedProfile, resourcePolicy.balancedFileSize];
    const discovered = await queryClient.fetchQuery({
      queryKey,
      queryFn: ({ signal }) => searchAnimeSources(targetAnime, targetEpisode, audioPreference, {
        signal,
        pages: 1,
        wide: false,
        timeoutMs: resolvedProfile === 'constrained' || resourcePolicy.batterySaver ? 7_000 : 9_000,
      }),
      staleTime: 10 * 60 * 1000,
    });
    const eligible = sourcesWithinCacheLimit(discovered, resourcePolicy.maxCacheMiB);
    if (discovered.length && !eligible.length) {
      const requiredMiB = minimumRequiredCacheMiB(discovered);
      throw new Error(requiredMiB
        ? `The smallest release needs ${requiredMiB} MB, above the ${resourcePolicy.maxCacheMiB} MB streaming-cache limit.`
        : `Available releases are larger than the ${resourcePolicy.maxCacheMiB} MB streaming-cache limit.`);
    }
    return rankMobileSources(eligible, {
      batterySaver: resourcePolicy.batterySaver,
      constrained: resolvedProfile === 'constrained',
      balancedFileSize: resourcePolicy.balancedFileSize,
      anime: targetAnime,
      episode: targetEpisode,
    });
  }, [audioPreference, resolvedProfile, resourcePolicy.balancedFileSize, resourcePolicy.batterySaver, resourcePolicy.maxCacheMiB]);

  const startPlayback = useCallback(async (request: StartPlaybackRequest) => {
    const targetEpisode = Math.max(1, request.episode || 1);
    const sameSession = sessionRef.current.anime?.id === request.anime.id && sessionRef.current.episode === targetEpisode && sessionRef.current.source;
    setPresentation('full');
    if (sameSession && !request.force && (!request.source || sourceId(request.source) === sourceId(sessionRef.current.source!))) return;

    persistProgress();
    generation.current += 1;
    playbackDesiredRef.current = true;
    const requestGeneration = generation.current;
    attemptsRef.current = 0;
    failedRef.current.clear();
    recoveryRef.current = false;
    loadedStreamRef.current = '';
    prefetchKeyRef.current = '';
    skippedIntervalsRef.current.clear();
    resumeSecondsRef.current = Number(request.resumeSeconds || 0);
    setAnime(request.anime);
    setEpisode(targetEpisode);
    setSource(undefined);
    setSources([]);
    setCurrentTime(0);
    setDuration(0);
    setBufferedPosition(0);
    setSkipIntervals([]);
    setNextEpisodeCountdown(null);
    setPhase('discovering');
    setStatus({ ...idleStatus, state: 'metadata', connectionStage: 'engine-start', message: 'Finding the best mobile release…' });
    sessionRef.current = { anime: request.anime, episode: targetEpisode, source: undefined, currentTime: 0, duration: 0 };
    try {
      const ranked = await discoverSources(request.anime, targetEpisode);
      if (!mountedRef.current || requestGeneration !== generation.current) return;
      const candidates = request.source
        ? [request.source, ...ranked.filter((candidate) => sourceId(candidate) !== sourceId(request.source!))]
        : ranked;
      candidatesRef.current = candidates;
      setSources(candidates);
      if (!candidates.length) {
        setPhase('failed');
        setStatus({ ...idleStatus, state: 'error', connectionStage: 'failed', message: 'No compatible release was found for this episode.', error: 'No compatible release was found for this episode.' });
        return;
      }
      await startCandidate(candidates[0]!);
    } catch (error) {
      if (requestGeneration !== generation.current) return;
      if (request.source) {
        candidatesRef.current = [request.source];
        setSources([request.source]);
        await startCandidate(request.source);
        return;
      }
      const message = error instanceof Error ? error.message : 'Source discovery failed.';
      setPhase('failed');
      setStatus({ ...idleStatus, state: 'error', connectionStage: 'failed', message, error: message });
    }
  }, [discoverSources, persistProgress, startCandidate]);

  const changeEpisode = useCallback(async (nextEpisode: number, automatic = false) => {
    const activeAnime = sessionRef.current.anime;
    if (!activeAnime) return;
    const maximum = Number(activeAnime.episodes || Number.MAX_SAFE_INTEGER);
    const safeEpisode = Math.max(1, Math.min(nextEpisode, maximum));
    if (safeEpisode === sessionRef.current.episode) return;
    setNextEpisodeCountdown(null);
    await startPlayback({ anime: activeAnime, episode: safeEpisode, force: true });
    if (automatic) setPresentation('full');
  }, [startPlayback]);

  const close = useCallback(async () => {
    persistProgress();
    generation.current += 1;
    playbackDesiredRef.current = false;
    playerReadRecoveryRef.current = false;
    setPresentation('hidden');
    setPhase('idle');
    setPlaying(false);
    setAnime(undefined);
    setSource(undefined);
    setSources([]);
    setStatus(idleStatus);
    sessionRef.current = { episode: 1, currentTime: 0, duration: 0 };
    player.pause();
    await player.replaceAsync(null).catch(() => undefined);
    await TorrentEngine.stop(false).catch(() => undefined);
  }, [persistProgress, player]);

  useEffect(() => {
    mountedRef.current = true;
    const subscription = TorrentEngine.addStatusListener((next) => {
      if (!mountedRef.current) return;
      setStatus(next);
      if (next.state === 'error') failCurrentSource(next.error || next.message, next.failureStage, next.failureCode);
      else if (next.state === 'paused') {
        setPhase('paused');
        if (/connection|wi-fi/i.test(next.message) && player.playing) {
          pausedForNetworkRef.current = true;
          player.pause();
        }
      } else if (next.state === 'buffering' || next.state === 'metadata' || next.state === 'ready') {
        setPhase(next.state === 'ready' && player.playing ? (presentationRef.current === 'mini' ? 'minimized' : 'playing') : 'buffering');
        if (pausedForNetworkRef.current && /restored|resumed/i.test(next.message)) {
          pausedForNetworkRef.current = false;
          player.play();
        }
      }
    });
    return () => {
      mountedRef.current = false;
      persistProgress();
      subscription?.remove();
      void TorrentEngine.stop(false);
    };
  }, [failCurrentSource, persistProgress, player]);

  useEffect(() => {
    if (!status.streamUrl || loadedStreamRef.current === status.streamUrl || !anime || !source) return;
    loadedStreamRef.current = status.streamUrl;
    const streamGeneration = generation.current;
    void player.replaceAsync({
      uri: status.streamUrl,
      contentType: 'progressive',
      metadata: { title: `${anime.title} · Episode ${episode}`, artist: 'StreamNyaa', artwork: anime.cover },
    }).then(() => {
      if (streamGeneration !== generation.current) return;
      player.playbackRate = playerPreferences.playbackSpeed;
      player.volume = Math.min(1, playerPreferences.volume / 100);
      player.muted = playerPreferences.muted;
      player.play();
    }).catch((error) => failCurrentSource(error instanceof Error ? error.message : 'Android could not decode this release.'));
  }, [anime, episode, failCurrentSource, player, playerPreferences.muted, playerPreferences.playbackSpeed, playerPreferences.volume, source, status.streamUrl]);

  useEventListener(player, 'timeUpdate', ({ currentTime: nextTime, bufferedPosition: nextBuffered }) => {
    const nextDuration = Number(player.duration || 0);
    setCurrentTime(nextTime);
    setDuration(nextDuration);
    setBufferedPosition(Math.max(0, nextBuffered));
    sessionRef.current.currentTime = nextTime;
    sessionRef.current.duration = nextDuration;
    const saveEvery = resolvedProfile === 'constrained' || resourcePolicy.batterySaver ? 15_000 : 10_000;
    if (nextTime > 0 && Date.now() - lastProgressSaveRef.current >= saveEvery) persistProgress();

    const activeAnime = sessionRef.current.anime;
    const currentEpisode = sessionRef.current.episode;
    if (activeAnime && nextDuration > 0 && nextTime / nextDuration >= 0.7) {
      const prefetchKey = `${activeAnime.id}:${currentEpisode + 1}:${audioPreference}`;
      if (prefetchKeyRef.current !== prefetchKey && (!activeAnime.episodes || currentEpisode < activeAnime.episodes)) {
        prefetchKeyRef.current = prefetchKey;
        void queryClient.prefetchQuery({
          queryKey: ['playback-sources', activeAnime.id, currentEpisode + 1, audioPreference, resolvedProfile, resourcePolicy.balancedFileSize],
          queryFn: ({ signal }) => searchAnimeSources(activeAnime, currentEpisode + 1, audioPreference, { signal, pages: 1, wide: false }),
          staleTime: 10 * 60 * 1000,
        });
      }
    }

    skipIntervals.forEach((interval) => {
      const key = `${interval.type}:${interval.startSeconds}:${interval.endSeconds}`;
      if (skippedIntervalsRef.current.has(key) || nextTime < interval.startSeconds || nextTime >= interval.endSeconds) return;
      const automatic = interval.type === 'op' ? playerPreferences.autoSkipIntro : playerPreferences.autoSkipOutro;
      if (automatic) {
        skippedIntervalsRef.current.add(key);
        player.currentTime = interval.endSeconds;
      }
    });
  });

  useEventListener(player, 'sourceLoad', ({ duration: loadedDuration, availableAudioTracks: audioTracks, availableSubtitleTracks: subtitleTracks }) => {
    setDuration(loadedDuration);
    setAvailableAudioTracks(audioTracks);
    setAvailableSubtitleTracks(subtitleTracks);
    const preferred = preferredTrackIndexes(audioTracks, subtitleTracks, audioPreference);
    const requestedAudio = requestedAudioTrackRef.current;
    const requestedSubtitle = requestedSubtitleTrackRef.current;
    const nextAudio = requestedAudio === undefined
      ? (preferred.audioIndex >= 0 ? audioTracks[preferred.audioIndex] || null : player.audioTrack)
      : requestedAudio === null ? null : equivalentTrack(audioTracks, requestedAudio) || player.audioTrack;
    const nextSubtitle = requestedSubtitle === undefined
      ? (preferred.subtitleIndex >= 0 ? subtitleTracks[preferred.subtitleIndex] || null : null)
      : requestedSubtitle === null ? null : equivalentTrack(subtitleTracks, requestedSubtitle) || null;
    player.audioTrack = nextAudio;
    player.subtitleTrack = nextSubtitle;
    setSelectedAudioTrack(nextAudio);
    setSelectedSubtitleTrack(nextSubtitle);
    const resume = resumeSecondsRef.current;
    resumeSecondsRef.current = 0;
    if (resume > 0 && player.currentTime < 2) player.currentTime = Math.min(resume, Math.max(0, loadedDuration - 5));
    const activeSource = sessionRef.current.source;
    if (activeSource) clearSourceFailure(sourceId(activeSource));
    const malId = Number(sessionRef.current.anime?.malId || 0);
    const currentEpisode = sessionRef.current.episode;
    if (malId > 0 && loadedDuration > 0) {
      void queryClient.fetchQuery({
        queryKey: ['aniskip', malId, currentEpisode, Math.round(loadedDuration)],
        queryFn: ({ signal }) => fetchSkipIntervals(malId, currentEpisode, loadedDuration, signal),
        staleTime: 24 * 60 * 60 * 1000,
      }).then(setSkipIntervals).catch(() => setSkipIntervals([]));
    }
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    setPlaying(isPlaying);
    const wasDesired = playbackDesiredRef.current;
    if (isPlaying) {
      playbackDesiredRef.current = true;
      setPhase(presentation === 'mini' ? 'minimized' : 'playing');
      if (!wasDesired) void TorrentEngine.resume();
    } else if (!wasDesired) {
      setPhase('paused');
    } else if (AppState.currentState !== 'active' && !pipActiveRef.current) {
      playbackDesiredRef.current = false;
      setPhase('paused');
      if (loadedStreamRef.current && !pausedForNetworkRef.current) void TorrentEngine.pause();
    } else if (loadedStreamRef.current && !playerReadRecoveryRef.current) {
      // `playingChange(false)` also fires while Media3 refills its playback
      // buffer. Pausing libtorrent here starves the loopback HTTP response and
      // turns a normal rebuffer into a socket timeout. Keep downloading until
      // playback resumes; explicit in-app/background pauses set
      // playbackDesiredRef to false before pausing the player.
      setPhase('buffering');
    }
  });

  useEventListener(player, 'statusChange', ({ status: playerStatus, error }) => {
    if (playerStatus !== 'error' || !loadedStreamRef.current || playerReadRecoveryRef.current) return;
    const reason = error?.message || 'Android could not decode this release.';
    const streamUrl = loadedStreamRef.current;
    const transientReadFailure = /socket|timeout|connection reset|source error|unexpected end/i.test(reason);
    if (!transientReadFailure || playerReadRetriesRef.current >= 1 || !sessionRef.current.anime || !sessionRef.current.source) {
      failCurrentSource(reason);
      return;
    }

    playerReadRetriesRef.current += 1;
    playerReadRecoveryRef.current = true;
    playbackDesiredRef.current = true;
    resumeSecondsRef.current = sessionRef.current.currentTime;
    loadedStreamRef.current = '';
    setPhase('recovering');
    setStatus((previous) => ({ ...previous, message: 'Restoring the local video connection…' }));
    void TorrentEngine.resume();
    void player.replaceAsync(null)
      .then(() => player.replaceAsync({
        uri: streamUrl,
        contentType: 'progressive',
        metadata: {
          title: `${sessionRef.current.anime?.title || 'StreamNyaa'} · Episode ${sessionRef.current.episode}`,
          artist: 'StreamNyaa',
          artwork: sessionRef.current.anime?.cover,
        },
      }))
      .then(() => {
        loadedStreamRef.current = streamUrl;
        playerReadRecoveryRef.current = false;
        player.play();
      })
      .catch((recoveryError) => {
        playerReadRecoveryRef.current = false;
        failCurrentSource(recoveryError instanceof Error ? recoveryError.message : reason);
      });
  });

  useEventListener(player, 'playToEnd', () => {
    persistProgress();
    if (sleepAtEpisodeEnd) {
      setSleepAtEpisodeEnd(false);
      playbackDesiredRef.current = false;
      player.pause();
      void TorrentEngine.pause();
      return;
    }
    const activeAnime = sessionRef.current.anime;
    const activeEpisode = sessionRef.current.episode;
    if (playerPreferences.autoNextEpisode && activeAnime && (!activeAnime.episodes || activeEpisode < activeAnime.episodes)) setNextEpisodeCountdown(10);
  });

  useEffect(() => {
    if (nextEpisodeCountdown === null) return;
    if (nextEpisodeCountdown <= 0) {
      setNextEpisodeCountdown(null);
      void changeEpisode(sessionRef.current.episode + 1, true);
      return;
    }
    const timer = setTimeout(() => setNextEpisodeCountdown((value) => value === null ? null : value - 1), 1_000);
    return () => clearTimeout(timer);
  }, [changeEpisode, nextEpisodeCountdown]);

  useEffect(() => {
    if (!sleepEndsAt) return;
    const remaining = sleepEndsAt - Date.now();
    if (remaining <= 0) {
      setSleepEndsAt(null);
      playbackDesiredRef.current = false;
      player.pause();
      void TorrentEngine.pause();
      return;
    }
    const timer = setTimeout(() => {
      setSleepEndsAt(null);
      playbackDesiredRef.current = false;
      player.pause();
      void TorrentEngine.pause();
    }, remaining);
    return () => clearTimeout(timer);
  }, [player, sleepEndsAt]);

  useEffect(() => {
    let backgroundTimer: ReturnType<typeof setTimeout> | undefined;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (backgroundTimer) clearTimeout(backgroundTimer);
        if (pausedForBackgroundRef.current) {
          pausedForBackgroundRef.current = false;
          playbackDesiredRef.current = true;
          void TorrentEngine.resume();
          player.play();
        }
        return;
      }
      if (resourcePolicy.allowBackgroundPlayback || pipActiveRef.current) return;
      backgroundTimer = setTimeout(() => {
        if (pipActiveRef.current || !player.playing) return;
        pausedForBackgroundRef.current = true;
        playbackDesiredRef.current = false;
        player.pause();
        void TorrentEngine.pause();
      }, 1_500);
    });
    return () => {
      if (backgroundTimer) clearTimeout(backgroundTimer);
      subscription.remove();
    };
  }, [player, resourcePolicy.allowBackgroundPlayback]);

  const activeSkip = useMemo(() => skipIntervals.find((interval) => currentTime >= interval.startSeconds && currentTime < interval.endSeconds), [currentTime, skipIntervals]);
  const play = useCallback(() => { playbackDesiredRef.current = true; player.play(); void TorrentEngine.resume(); }, [player]);
  const pause = useCallback(() => { playbackDesiredRef.current = false; player.pause(); void TorrentEngine.pause(); }, [player]);
  const seekBy = useCallback((seconds: number) => player.seekBy(seconds), [player]);
  const seekTo = useCallback((seconds: number) => { player.currentTime = Math.max(0, Math.min(seconds, Number(player.duration || seconds))); }, [player]);
  const selectSource = useCallback(async (candidate: TorrentSource) => {
    failedRef.current.delete(sourceId(candidate));
    attemptsRef.current = 0;
    candidatesRef.current = [candidate, ...candidatesRef.current.filter((item) => sourceId(item) !== sourceId(candidate))];
    resumeSecondsRef.current = currentTime;
    await startCandidate(candidate);
  }, [currentTime, startCandidate]);
  const retry = useCallback(async () => {
    const active = sessionRef.current.source || candidatesRef.current[0];
    if (!active) {
      const activeAnime = sessionRef.current.anime;
      if (activeAnime) await startPlayback({ anime: activeAnime, episode: sessionRef.current.episode, force: true });
      return;
    }
    failedRef.current.delete(sourceId(active));
    attemptsRef.current = 0;
    await startCandidate(active);
  }, [startCandidate, startPlayback]);
  const setPlaybackRate = useCallback((rate: number) => {
    player.playbackRate = rate;
    useAppStore.getState().setPlayerPreferences({ playbackSpeed: rate });
  }, [player]);
  const setAudioTrack = useCallback((track: AudioTrack | null) => {
    requestedAudioTrackRef.current = track;
    player.audioTrack = track;
    setSelectedAudioTrack(track);
  }, [player]);
  const setSubtitleTrack = useCallback((track: SubtitleTrack | null) => {
    requestedSubtitleTrackRef.current = track;
    player.subtitleTrack = track;
    setSelectedSubtitleTrack(track);
  }, [player]);
  const skipActiveSegment = useCallback(() => {
    if (!activeSkip) return;
    skippedIntervalsRef.current.add(`${activeSkip.type}:${activeSkip.startSeconds}:${activeSkip.endSeconds}`);
    player.currentTime = activeSkip.endSeconds;
  }, [activeSkip, player]);
  const setSleepTimer = useCallback((value: number | null | 'episode') => {
    if (value === 'episode') {
      setSleepEndsAt(null);
      setSleepAtEpisodeEnd(true);
    } else {
      setSleepAtEpisodeEnd(false);
      setSleepEndsAt(value ? Date.now() + value * 60_000 : null);
    }
  }, []);
  const minimize = useCallback(() => {
    if (!sessionRef.current.anime) return;
    setPresentation('mini');
    setPhase(player.playing ? 'minimized' : 'paused');
  }, [player]);
  const expand = useCallback(() => {
    if (sessionRef.current.anime) setPresentation('full');
  }, []);

  const value = useMemo<PlaybackContextValue>(() => ({
    player, anime, episode, source, sources, status, phase, presentation, currentTime, duration, bufferedPosition, playing,
    availableAudioTracks, availableSubtitleTracks, selectedAudioTrack, selectedSubtitleTrack, activeSkip,
    nextEpisodeCountdown, sleepEndsAt, sleepAtEpisodeEnd, resolvedProfile, startPlayback, selectSource, changeEpisode,
    play, pause, seekBy, seekTo,
    minimize,
    expand,
    close, retry,
    setPipActive: (active) => { pipActiveRef.current = active; },
    setPlaybackRate, setAudioTrack, setSubtitleTrack, skipActiveSegment,
    cancelNextEpisode: () => setNextEpisodeCountdown(null),
    setSleepTimer,
  }), [activeSkip, anime, availableAudioTracks, availableSubtitleTracks, bufferedPosition, changeEpisode, close, currentTime, duration, episode, expand, minimize, nextEpisodeCountdown, pause, phase, play, player, playing, presentation, resolvedProfile, retry, seekBy, seekTo, selectSource, selectedAudioTrack, selectedSubtitleTrack, setAudioTrack, setPlaybackRate, setSleepTimer, setSubtitleTrack, skipActiveSegment, sleepAtEpisodeEnd, sleepEndsAt, source, sources, startPlayback, status]);

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export function usePlayback() {
  const context = useContext(PlaybackContext);
  if (!context) throw new Error('usePlayback must be used inside PlaybackProvider.');
  return context;
}
