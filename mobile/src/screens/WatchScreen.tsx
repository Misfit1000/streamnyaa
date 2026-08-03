import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Share, StyleSheet, View } from 'react-native';
import { useEventListener } from 'expo';
import { useQuery } from '@tanstack/react-query';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Chip, Menu, ProgressBar, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { Screen } from '../components/Screen';
import { SourceRow } from '../components/SourceRow';
import { StateView } from '../components/StateView';
import { TorrentEngine } from '../native/TorrentEngine';
import { searchSources, sourceQuery } from '../services/sources';
import { useAppStore } from '../store/useAppStore';
import type { RootStackParamList, TorrentSource, TorrentStreamStatus } from '../types';
import { tokens } from '../theme';
import { parseSizeBytes, selectBackupSource, sourceQualityBucket } from '../../../shared/sources';

type Props = NativeStackScreenProps<RootStackParamList, 'Watch'>;
const idleStatus: TorrentStreamStatus = { state: 'idle', message: 'Choose a source to begin.', progress: 0, bufferedPercent: 0, peers: 0, downloadRate: 0 };
const sourceId = (source: TorrentSource) => source.infoHash || source.magnet;

export function WatchScreen({ route }: Props) {
  const theme = useTheme();
  const anime = route.params.anime;
  const [episode, setEpisode] = useState(route.params.episode || 1);
  const [episodeDraft, setEpisodeDraft] = useState(String(route.params.episode || 1));
  const [selected, setSelected] = useState<TorrentSource | undefined>(route.params.source);
  const [pendingAutoNext, setPendingAutoNext] = useState(false);
  const [status, setStatus] = useState<TorrentStreamStatus>(idleStatus);
  const [quality, setQuality] = useState('auto');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'trusted' | 'no-remakes'>('all');
  const [sourceSort, setSourceSort] = useState<'best' | 'seeders' | 'size'>('best');
  const [sortMenu, setSortMenu] = useState(false);
  const failedSources = useRef(new Set<string>());
  const automaticRetries = useRef(0);
  const starting = useRef(false);
  const lastProgressSave = useRef(0);
  const routeSourceStarted = useRef('');
  const playbackSnapshot = useRef({ selected: route.params.source, episode: route.params.episode || 1, currentTime: 0, duration: 0 });
  const pipActive = useRef(false);
  const pausedForBackground = useRef(false);
  const audio = useAppStore((state) => state.audioPreference);
  const setAudio = useAppStore((state) => state.setAudioPreference);
  const autoOpen = useAppStore((state) => state.autoOpenBestSource);
  const autoNext = useAppStore((state) => state.autoPlayNext);
  const playerPreferences = useAppStore((state) => state.playerPreferences);
  const resourcePolicy = useAppStore((state) => state.resourcePolicy);
  const saveProgress = useAppStore((state) => state.saveProgress);
  const queryText = useMemo(() => sourceQuery(anime.title, episode, audio), [anime.title, audio, episode]);
  const sources = useQuery({
    queryKey: ['watch-sources', queryText, resourcePolicy.batterySaver],
    queryFn: ({ signal }) => searchSources(queryText, {
      signal,
      pages: resourcePolicy.batterySaver ? 1 : 2,
      wide: !resourcePolicy.batterySaver,
    }),
  });
  const visibleSources = useMemo(() => (sources.data || [])
    .filter((source) => quality === 'auto' || sourceQualityBucket(source.title) === quality)
    .filter((source) => sourceFilter === 'all' || (sourceFilter === 'trusted' ? source.trusted : !source.remake))
    .sort((left, right) => sourceSort === 'seeders'
      ? right.seeders - left.seeders
      : sourceSort === 'size'
        ? parseSizeBytes(left.size) - parseSizeBytes(right.size)
        : Number(right.sourceScore || 0) - Number(left.sourceScore || 0)), [quality, sourceFilter, sourceSort, sources.data]);
  const player = useVideoPlayer(null, (instance) => { instance.timeUpdateEventInterval = 5; });

  const persistProgress = useCallback(() => {
    const snapshot = playbackSnapshot.current;
    if (!snapshot.selected || snapshot.currentTime <= 0) return;
    saveProgress({
      key: `${anime.id}::${snapshot.episode}`,
      animeId: String(anime.id), animeTitle: anime.title, episode: snapshot.episode,
      sourceTitle: snapshot.selected.title, magnet: snapshot.selected.magnet, image: anime.cover,
      progressPercent: snapshot.duration ? Math.min(100, (snapshot.currentTime / snapshot.duration) * 100) : 0,
      resumeSeconds: snapshot.currentTime, durationSeconds: snapshot.duration, updatedAt: new Date().toISOString(),
    });
    lastProgressSave.current = Date.now();
  }, [anime.cover, anime.id, anime.title, saveProgress]);

  const start = useCallback(async (source: TorrentSource, automatic = false) => {
    if (starting.current) return;
    starting.current = true;
    if (!automatic) automaticRetries.current = 0;
    setSelected(source);
    setStatus({ ...idleStatus, state: 'metadata', message: 'Connecting to peers and loading metadata…' });
    try {
      player.pause();
      await TorrentEngine.stop(false);
      const next = await TorrentEngine.startStream(source.magnet, undefined, {
        wifiOnly: resourcePolicy.wifiOnly,
        maxCacheMiB: resourcePolicy.maxCacheMiB,
        batterySaver: resourcePolicy.batterySaver,
      });
      if (next.state === 'error') throw new Error(next.error || next.message);
      setStatus(next);
    } catch (error) {
      failedSources.current.add(sourceId(source));
      const message = error instanceof Error ? error.message : 'The source could not be opened.';
      setStatus({ ...idleStatus, state: 'error', message, error: message });
    } finally {
      starting.current = false;
    }
  }, [player, resourcePolicy.batterySaver, resourcePolicy.maxCacheMiB, resourcePolicy.wifiOnly]);

  useEffect(() => {
    const subscription = TorrentEngine.addStatusListener(setStatus);
    return () => { persistProgress(); subscription?.remove(); void TorrentEngine.stop(false); };
  }, [persistProgress]);

  useEffect(() => {
    if (!route.params.source) return;
    const id = sourceId(route.params.source);
    if (routeSourceStarted.current === id) return;
    routeSourceStarted.current = id;
    void start(route.params.source);
  }, [route.params.source, start]);

  useEffect(() => {
    failedSources.current.clear();
    automaticRetries.current = 0;
  }, [queryText]);

  useEffect(() => {
    playbackSnapshot.current = { ...playbackSnapshot.current, selected, episode };
    setEpisodeDraft(String(episode));
  }, [episode, selected]);

  useEffect(() => {
    if (!selected && (autoOpen || pendingAutoNext) && visibleSources[0]) {
      setPendingAutoNext(false);
      void start(visibleSources[0]);
    }
  }, [autoOpen, pendingAutoNext, selected, start, visibleSources]);

  useEffect(() => {
    if (status.state !== 'error' || !visibleSources.length || automaticRetries.current >= 2) return;
    if (selected) failedSources.current.add(sourceId(selected));
    const backup = selectBackupSource(visibleSources, failedSources.current);
    if (!backup) return;
    automaticRetries.current += 1;
    const timer = setTimeout(() => void start(backup, true), 800);
    return () => clearTimeout(timer);
  }, [selected, start, status.state, visibleSources]);

  useEffect(() => {
    if (!status.streamUrl) return;
    void player.replaceAsync({ uri: status.streamUrl, contentType: 'progressive' })
      .then(() => {
        player.playbackRate = playerPreferences.playbackSpeed;
        player.volume = Math.min(1, playerPreferences.volume / 100);
        player.muted = playerPreferences.muted;
        player.play();
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Android could not decode this source.';
        setStatus({ ...idleStatus, state: 'error', message, error: message });
      });
  }, [player, playerPreferences.muted, playerPreferences.playbackSpeed, playerPreferences.volume, status.streamUrl]);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (!selected || currentTime <= 0) return;
    playbackSnapshot.current = { selected, episode, currentTime, duration: Number(player.duration || 0) };
    const interval = resourcePolicy.batterySaver ? 15000 : 10000;
    if (Date.now() - lastProgressSave.current < interval) return;
    persistProgress();
  });

  useEventListener(player, 'sourceLoad', () => {
    const resume = Number(route.params.resumeSeconds || 0);
    if (resume > 0 && player.currentTime < 2) player.currentTime = resume;
  });

  useEventListener(player, 'statusChange', ({ status: playerStatus, error }) => {
    if (playerStatus !== 'error') return;
    const message = error?.message || 'Android could not play this file. Trying another source may help.';
    setStatus({ ...idleStatus, state: 'error', message, error: message });
  });

  useEffect(() => {
    let backgroundTimer: ReturnType<typeof setTimeout> | undefined;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (backgroundTimer) clearTimeout(backgroundTimer);
        if (pausedForBackground.current) {
          pausedForBackground.current = false;
          void TorrentEngine.resume();
          if (status.streamUrl) player.play();
        }
        return;
      }
      if (resourcePolicy.allowBackgroundPlayback || pipActive.current) return;
      backgroundTimer = setTimeout(() => {
        if (pipActive.current) return;
        pausedForBackground.current = true;
        player.pause();
        void TorrentEngine.pause();
      }, 1500);
    });
    return () => {
      if (backgroundTimer) clearTimeout(backgroundTimer);
      subscription.remove();
    };
  }, [player, resourcePolicy.allowBackgroundPlayback, status.streamUrl]);

  useEventListener(player, 'playToEnd', () => {
    persistProgress();
    if (!autoNext) return;
    void TorrentEngine.stop(false);
    setSelected(undefined);
    setStatus(idleStatus);
    setPendingAutoNext(true);
    setEpisode((value) => value + 1);
  });

  const nextEpisode = () => {
    persistProgress();
    player.pause();
    void TorrentEngine.stop(false);
    setPendingAutoNext(false); setSelected(undefined); setStatus(idleStatus); setEpisode((value) => value + 1);
  };

  const jumpToEpisode = () => {
    const parsed = Number.parseInt(episodeDraft, 10);
    const maximum = Number(anime.episodes || Number.MAX_SAFE_INTEGER);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setEpisodeDraft(String(episode));
      return;
    }
    const next = Math.min(parsed, maximum);
    if (next === episode) return;
    persistProgress();
    player.pause();
    void TorrentEngine.stop(false);
    setPendingAutoNext(false);
    setSelected(undefined);
    setStatus(idleStatus);
    setEpisode(next);
  };

  return (
    <Screen title={anime.title} subtitle={`Episode ${episode}`} safeTop={false}>
      <View style={[styles.player, { backgroundColor: '#070607' }]}>
        {status.streamUrl ? <VideoView style={StyleSheet.absoluteFill} player={player} nativeControls contentFit="contain" surfaceType="surfaceView" allowsPictureInPicture startsPictureInPictureAutomatically={resourcePolicy.allowBackgroundPlayback} onPictureInPictureStart={() => { pipActive.current = true; }} onPictureInPictureStop={() => { pipActive.current = false; }} /> : <StateView compact loading={['metadata', 'buffering'].includes(status.state)} title={status.state === 'error' ? 'Playback could not start' : 'Ready for a source'} message={status.error || status.message} />}
      </View>
      {selected ? (
        <View style={[styles.streamStatus, { backgroundColor: theme.colors.surfaceVariant }]}>
          <View style={styles.statusTitle}><Text variant="titleSmall" style={styles.semibold} numberOfLines={1}>{status.fileName || selected.title}</Text><Chip compact>{status.peers} peers</Chip></View>
          <ProgressBar progress={Math.max(status.bufferedPercent, status.progress) / 100} />
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{status.message} · {(status.downloadRate / 1024 / 1024).toFixed(1)} MB/s</Text>
        </View>
      ) : null}
      <View style={styles.episodeControls}>
        <Button mode="outlined" disabled={episode <= 1} onPress={() => { persistProgress(); player.pause(); setPendingAutoNext(false); setEpisode((value) => Math.max(1, value - 1)); setSelected(undefined); setStatus(idleStatus); void TorrentEngine.stop(false); }}>Previous</Button>
        <Text variant="titleMedium" style={styles.semibold}>Episode {episode}</Text>
        <Button mode="outlined" onPress={nextEpisode}>Next</Button>
      </View>
      <View style={styles.episodeJump}>
        <TextInput value={episodeDraft} onChangeText={setEpisodeDraft} onSubmitEditing={jumpToEpisode} keyboardType="number-pad" mode="outlined" dense label="Episode number" style={styles.episodeInput} />
        <Button mode="contained-tonal" icon="arrow-right" onPress={jumpToEpisode}>Jump</Button>
      </View>
      {autoNext ? <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>The next ranked source will open when this episode ends.</Text> : null}
      <Text variant="titleMedium" style={styles.semibold}>Available sources</Text>
      <SegmentedButtons value={audio} onValueChange={(value) => setAudio(value as typeof audio)} buttons={[{ value: 'sub-preferred', label: 'Sub' }, { value: 'dual-preferred', label: 'Dual' }, { value: 'dub-only', label: 'Dub' }]} density="small" />
      <SegmentedButtons value={quality} onValueChange={setQuality} buttons={[{ value: 'auto', label: 'Best' }, { value: '1080p', label: '1080p' }, { value: '720p', label: '720p' }, { value: '2160p', label: '4K' }]} density="small" />
      <View style={styles.sourceTools}>
        <Chip selected={sourceFilter === 'trusted'} mode="outlined" icon="check-decagram-outline" onPress={() => setSourceFilter(sourceFilter === 'trusted' ? 'all' : 'trusted')}>Trusted</Chip>
        <Chip selected={sourceFilter === 'no-remakes'} mode="outlined" icon="shield-check-outline" onPress={() => setSourceFilter(sourceFilter === 'no-remakes' ? 'all' : 'no-remakes')}>No remakes</Chip>
        <Menu visible={sortMenu} onDismiss={() => setSortMenu(false)} anchor={<Button compact mode="text" icon="sort" onPress={() => setSortMenu(true)}>{sourceSort === 'best' ? 'Best match' : sourceSort === 'seeders' ? 'Seeders' : 'Smallest'}</Button>}>
          {([['best', 'Best match'], ['seeders', 'Most seeders'], ['size', 'Smallest size']] as const).map(([value, label]) => <Menu.Item key={value} title={label} leadingIcon={sourceSort === value ? 'check' : undefined} onPress={() => { setSourceSort(value); setSortMenu(false); }} />)}
        </Menu>
      </View>
      {sources.isLoading ? <StateView loading message="Finding the best matching releases…" /> : sources.isError ? <StateView title="Source search failed" message={sources.error.message} onRetry={() => void sources.refetch()} /> : visibleSources.length ? visibleSources.slice(0, 8).map((source) => <SourceRow key={`${source.infoHash}-${source.title}`} source={source} onPlay={() => void start(source)} onShare={() => void Share.share({ message: source.magnet })} />) : <StateView title="No source found" message="Try Best quality, another audio mode, or Source Search." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  player: { aspectRatio: 16 / 9, borderRadius: tokens.radius.card, overflow: 'hidden' },
  streamStatus: { padding: tokens.spacing.md, borderRadius: tokens.radius.card, gap: tokens.spacing.sm },
  statusTitle: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  episodeControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  episodeJump: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  episodeInput: { flex: 1 },
  sourceTools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacing.sm },
  semibold: { fontWeight: '600', flexShrink: 1 },
});
