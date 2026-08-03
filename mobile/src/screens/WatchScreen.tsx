import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Share, StyleSheet, View } from 'react-native';
import { ImageBackground } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEventListener } from 'expo';
import { useQuery } from '@tanstack/react-query';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Chip, Menu, ProgressBar, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { AnimeShelf } from '../components/AnimeShelf';
import { EpisodeRail } from '../components/EpisodeRail';
import { Screen } from '../components/Screen';
import { SourceRow } from '../components/SourceRow';
import { StateView } from '../components/StateView';
import { WatchHero } from '../components/WatchHero';
import { watchRouteParams, mangaRouteParams } from '../lib/mediaNavigation';
import { TorrentEngine } from '../native/TorrentEngine';
import { fetchAnimeDetails } from '../services/anilist';
import { searchSources, sourceQuery } from '../services/sources';
import { useAppStore } from '../store/useAppStore';
import type { Anime, RootStackParamList, TorrentSource, TorrentStreamStatus } from '../types';
import { tokens } from '../theme';
import { parseSizeBytes, selectBackupSource, sourceQualityBucket } from '../../../shared/sources';

type Props = NativeStackScreenProps<RootStackParamList, 'Watch'>;
const idleStatus: TorrentStreamStatus = { state: 'idle', message: 'Pick a release or play the best match.', progress: 0, bufferedPercent: 0, peers: 0, downloadRate: 0 };
const sourceId = (source: TorrentSource) => source.infoHash || source.magnet;

export function WatchScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const routeAnime = route.params.anime;
  const [episode, setEpisode] = useState(route.params.episode || 1);
  const [episodeDraft, setEpisodeDraft] = useState(String(route.params.episode || 1));
  const [selected, setSelected] = useState<TorrentSource | undefined>(route.params.source);
  const [pendingAutoNext, setPendingAutoNext] = useState(false);
  const [status, setStatus] = useState<TorrentStreamStatus>(idleStatus);
  const [quality, setQuality] = useState('auto');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'trusted' | 'no-remakes'>('all');
  const [sourceSort, setSourceSort] = useState<'best' | 'seeders' | 'size'>('best');
  const [sortMenu, setSortMenu] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const failedSources = useRef(new Set<string>());
  const automaticRetries = useRef(0);
  const starting = useRef(false);
  const mounted = useRef(true);
  const playbackGeneration = useRef(0);
  const lastProgressSave = useRef(0);
  const routeSourceStarted = useRef('');
  const resumeApplied = useRef(false);
  const playbackSnapshot = useRef({ selected: route.params.source, episode: route.params.episode || 1, currentTime: 0, duration: 0 });
  const pipActive = useRef(false);
  const pausedForBackground = useRef(false);
  const audio = useAppStore((state) => state.audioPreference);
  const setAudio = useAppStore((state) => state.setAudioPreference);
  const autoOpen = useAppStore((state) => state.autoOpenBestSource);
  const autoNext = useAppStore((state) => state.autoPlayNext);
  const playerPreferences = useAppStore((state) => state.playerPreferences);
  const resourcePolicy = useAppStore((state) => state.resourcePolicy);
  const library = useAppStore((state) => state.library);
  const toggleBookmark = useAppStore((state) => state.toggleBookmark);
  const toggleLike = useAppStore((state) => state.toggleLike);
  const saveProgress = useAppStore((state) => state.saveProgress);

  const details = useQuery({
    queryKey: ['anime', routeAnime.id, routeAnime.anilistId, routeAnime.malId, routeAnime.kitsuId],
    queryFn: ({ signal }) => fetchAnimeDetails(routeAnime.anilistId || routeAnime.id, {
      anilistId: routeAnime.anilistId,
      malId: routeAnime.malId,
      kitsuId: routeAnime.kitsuId,
      title: routeAnime.title,
    }, signal),
    staleTime: 30 * 60 * 1000,
  });
  const anime = details.data || routeAnime;
  const saved = library.find((item) => item.animeId === String(anime.malId || anime.id));
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
  const player = useVideoPlayer(null, (instance) => { instance.timeUpdateEventInterval = resourcePolicy.batterySaver ? 8 : 5; });

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

  const releasePlayerAndEngine = useCallback(async () => {
    playbackGeneration.current += 1;
    player.pause();
    await player.replaceAsync(null).catch(() => undefined);
    await TorrentEngine.stop(false).catch(() => undefined);
  }, [player]);

  const start = useCallback(async (source: TorrentSource, automatic = false) => {
    if (starting.current) return;
    starting.current = true;
    setIsStarting(true);
    const generation = ++playbackGeneration.current;
    if (!automatic) automaticRetries.current = 0;
    setSelected(source);
    setStatus({ ...idleStatus, state: 'metadata', message: 'Connecting to peers and loading metadata...' });
    try {
      player.pause();
      await player.replaceAsync(null).catch(() => undefined);
      await TorrentEngine.stop(false).catch(() => undefined);
      if (!mounted.current || generation !== playbackGeneration.current) return;
      const next = await TorrentEngine.startStream(source.magnet, undefined, {
        wifiOnly: resourcePolicy.wifiOnly,
        maxCacheMiB: resourcePolicy.maxCacheMiB,
        batterySaver: resourcePolicy.batterySaver,
      });
      if (!mounted.current || generation !== playbackGeneration.current) {
        await TorrentEngine.stop(false).catch(() => undefined);
        return;
      }
      if (next.state === 'error') throw new Error(next.error || next.message);
      setStatus(next);
    } catch (error) {
      if (generation !== playbackGeneration.current) return;
      failedSources.current.add(sourceId(source));
      const message = error instanceof Error ? error.message : 'The source could not be opened.';
      setStatus({ ...idleStatus, state: 'error', message, error: message });
    } finally {
      starting.current = false;
      if (mounted.current) setIsStarting(false);
    }
  }, [player, resourcePolicy.batterySaver, resourcePolicy.maxCacheMiB, resourcePolicy.wifiOnly]);

  const changeEpisode = useCallback((next: number, openAutomatically = false) => {
    const maximum = Number(anime.episodes || Number.MAX_SAFE_INTEGER);
    const safeEpisode = Math.max(1, Math.min(next, maximum));
    if (safeEpisode === episode) return;
    persistProgress();
    setPendingAutoNext(openAutomatically);
    setSelected(undefined);
    setStatus(idleStatus);
    setEpisode(safeEpisode);
    setEpisodeDraft(String(safeEpisode));
    void releasePlayerAndEngine();
  }, [anime.episodes, episode, persistProgress, releasePlayerAndEngine]);

  useEffect(() => {
    mounted.current = true;
    const subscription = TorrentEngine.addStatusListener((next) => { if (mounted.current) setStatus(next); });
    return () => {
      mounted.current = false;
      persistProgress();
      subscription?.remove();
      void releasePlayerAndEngine();
    };
  }, [releasePlayerAndEngine]);

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
    if (!isStarting && !selected && (autoOpen || pendingAutoNext) && visibleSources[0]) {
      setPendingAutoNext(false);
      void start(visibleSources[0]);
    }
  }, [autoOpen, isStarting, pendingAutoNext, selected, start, visibleSources]);

  useEffect(() => {
    if (status.state !== 'error' || !visibleSources.length || automaticRetries.current >= 2) return;
    if (selected) failedSources.current.add(sourceId(selected));
    const backup = selectBackupSource(visibleSources, failedSources.current);
    if (!backup) return;
    automaticRetries.current += 1;
    const timer = setTimeout(() => void start(backup, true), 900);
    return () => clearTimeout(timer);
  }, [selected, start, status.state, visibleSources]);

  useEffect(() => {
    if (!status.streamUrl) return;
    const generation = playbackGeneration.current;
    let cancelled = false;
    void player.replaceAsync({ uri: status.streamUrl, contentType: 'progressive' })
      .then(() => {
        if (cancelled || !mounted.current || generation !== playbackGeneration.current) return;
        player.playbackRate = playerPreferences.playbackSpeed;
        player.volume = Math.min(1, playerPreferences.volume / 100);
        player.muted = playerPreferences.muted;
        player.play();
      })
      .catch((error) => {
        if (cancelled || generation !== playbackGeneration.current) return;
        const message = error instanceof Error ? error.message : 'Android could not decode this source.';
        setStatus({ ...idleStatus, state: 'error', message, error: message });
      });
    return () => { cancelled = true; };
  }, [player, playerPreferences.muted, playerPreferences.playbackSpeed, playerPreferences.volume, status.streamUrl]);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (!selected || currentTime <= 0) return;
    playbackSnapshot.current = { selected, episode, currentTime, duration: Number(player.duration || 0) };
    const interval = resourcePolicy.batterySaver ? 15000 : 10000;
    if (Date.now() - lastProgressSave.current >= interval) persistProgress();
  });

  useEventListener(player, 'sourceLoad', () => {
    if (resumeApplied.current) return;
    resumeApplied.current = true;
    const resume = Number(route.params.resumeSeconds || 0);
    if (resume > 0 && player.currentTime < 2) player.currentTime = resume;
  });

  useEventListener(player, 'statusChange', ({ status: playerStatus, error }) => {
    if (playerStatus !== 'error' || !status.streamUrl) return;
    const message = error?.message || 'Android could not play this file. A backup source will be tried.';
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
      }, 1200);
    });
    return () => {
      if (backgroundTimer) clearTimeout(backgroundTimer);
      subscription.remove();
    };
  }, [player, resourcePolicy.allowBackgroundPlayback, status.streamUrl]);

  useEventListener(player, 'playToEnd', () => {
    persistProgress();
    if (autoNext) changeEpisode(episode + 1, true);
  });

  const jumpToEpisode = () => {
    const parsed = Number.parseInt(episodeDraft, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setEpisodeDraft(String(episode));
      return;
    }
    changeEpisode(parsed);
  };

  const openRelated = (item: Anime) => {
    persistProgress();
    setSelected(undefined);
    setStatus(idleStatus);
    void releasePlayerAndEngine().then(() => {
      if (!mounted.current) return;
      if (item.mediaType === 'MANGA') navigation.push('Manga', mangaRouteParams(item));
      else navigation.replace('Watch', watchRouteParams(item));
    });
  };

  return (
    <Screen safeTop contentContainerStyle={styles.screen}>
      <WatchHero
        anime={anime}
        episode={episode}
        bookmarked={Boolean(saved?.bookmarked)}
        liked={Boolean(saved?.liked)}
        sourceLoading={sources.isLoading || isStarting}
        canPlay={Boolean(visibleSources[0]) && !isStarting}
        onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs')}
        onPlay={() => visibleSources[0] && void start(visibleSources[0])}
        onBookmark={() => toggleBookmark(anime)}
        onLike={() => toggleLike(anime)}
        onTrailer={anime.trailerId ? () => void Linking.openURL(`https://www.youtube.com/watch?v=${anime.trailerId}`) : undefined}
      />

      <View style={[styles.player, { borderColor: theme.colors.outlineVariant }]}>
        {status.streamUrl ? (
          <VideoView style={StyleSheet.absoluteFill} player={player} nativeControls contentFit="contain" surfaceType="surfaceView" allowsPictureInPicture startsPictureInPictureAutomatically={resourcePolicy.allowBackgroundPlayback} onPictureInPictureStart={() => { pipActive.current = true; }} onPictureInPictureStop={() => { pipActive.current = false; }} />
        ) : (
          <ImageBackground source={anime.banner || anime.cover} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk">
            <LinearGradient colors={['rgba(3,3,4,0.58)', 'rgba(3,3,4,0.94)']} style={StyleSheet.absoluteFill} />
            <View style={styles.playerState}><StateView compact loading={['metadata', 'buffering'].includes(status.state)} title={status.state === 'error' ? 'Playback recovered safely' : `Episode ${episode} ready`} message={status.error || status.message} /></View>
          </ImageBackground>
        )}
      </View>

      {selected ? (
        <View style={[styles.streamStatus, { backgroundColor: tokens.color.glass, borderColor: theme.colors.outlineVariant }]}>
          <View style={styles.statusTitle}><Text variant="titleSmall" style={styles.semibold} numberOfLines={1}>{status.fileName || selected.title}</Text><Chip compact>{status.peers} peers</Chip></View>
          <ProgressBar progress={Math.max(status.bufferedPercent, status.progress) / 100} />
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{status.message} · {(status.downloadRate / 1024 / 1024).toFixed(1)} MB/s</Text>
        </View>
      ) : null}

      <EpisodeRail current={episode} total={anime.episodes} onSelect={(value) => changeEpisode(value)} />
      <View style={styles.episodeNavigation}>
        <Button compact mode="outlined" icon="chevron-left" disabled={episode <= 1} onPress={() => changeEpisode(episode - 1)}>Previous</Button>
        <Text variant="titleMedium" style={styles.semibold}>Episode {episode}</Text>
        <Button compact mode="outlined" contentStyle={styles.nextContent} onPress={() => changeEpisode(episode + 1)}>Next</Button>
      </View>
      <View style={styles.episodeJump}>
        <TextInput value={episodeDraft} onChangeText={setEpisodeDraft} onSubmitEditing={jumpToEpisode} keyboardType="number-pad" mode="outlined" dense label="Jump to episode" style={styles.episodeInput} />
        <Button mode="contained-tonal" icon="arrow-right" onPress={jumpToEpisode}>Go</Button>
      </View>
      {autoNext ? <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Auto-next will choose the best healthy release after this episode.</Text> : null}

      <View style={styles.sourceHeading}>
        <View style={styles.sourceHeadingCopy}><Text variant="titleLarge" style={styles.semibold}>Sources for episode {episode}</Text><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Ranked by match, health, and playback compatibility</Text></View>
        <Button compact mode="text" icon="download" onPress={() => navigation.navigate('Downloads', { anime, episode })}>Downloads</Button>
      </View>
      <SegmentedButtons value={audio} onValueChange={(value) => setAudio(value as typeof audio)} buttons={[{ value: 'sub-preferred', label: 'Sub' }, { value: 'dual-preferred', label: 'Dual' }, { value: 'dub-only', label: 'Dub' }]} density="small" />
      <SegmentedButtons value={quality} onValueChange={setQuality} buttons={[{ value: 'auto', label: 'Best' }, { value: '1080p', label: '1080p' }, { value: '720p', label: '720p' }, { value: '2160p', label: '4K' }]} density="small" />
      <View style={styles.sourceTools}>
        <Chip selected={sourceFilter === 'trusted'} mode="outlined" icon="check-decagram-outline" onPress={() => setSourceFilter(sourceFilter === 'trusted' ? 'all' : 'trusted')}>Trusted</Chip>
        <Chip selected={sourceFilter === 'no-remakes'} mode="outlined" icon="shield-check-outline" onPress={() => setSourceFilter(sourceFilter === 'no-remakes' ? 'all' : 'no-remakes')}>No remakes</Chip>
        <Menu visible={sortMenu} onDismiss={() => setSortMenu(false)} anchor={<Button compact mode="text" icon="sort" onPress={() => setSortMenu(true)}>{sourceSort === 'best' ? 'Best match' : sourceSort === 'seeders' ? 'Seeders' : 'Smallest'}</Button>}>
          {([['best', 'Best match'], ['seeders', 'Most seeders'], ['size', 'Smallest size']] as const).map(([value, label]) => <Menu.Item key={value} title={label} leadingIcon={sourceSort === value ? 'check' : undefined} onPress={() => { setSourceSort(value); setSortMenu(false); }} />)}
        </Menu>
      </View>
      {sources.isLoading ? <StateView loading message="Finding the best matching releases..." /> : sources.isError ? <StateView title="Source search failed" message={sources.error.message} onRetry={() => void sources.refetch()} /> : visibleSources.length ? visibleSources.slice(0, resourcePolicy.batterySaver ? 6 : 10).map((source) => <SourceRow key={`${source.infoHash}-${source.title}`} source={source} onPlay={() => void start(source)} onShare={() => void Share.share({ message: source.magnet })} />) : <StateView title="No source found" message="Try Best quality, another audio mode, or the broader Source Search." />}

      {anime.genres?.length ? <View style={styles.genres}>{anime.genres.slice(0, 6).map((genre) => <Chip key={genre} compact mode="outlined" onPress={() => navigation.navigate('Catalog', { title: `${genre} anime`, genre })}>{genre}</Chip>)}</View> : null}
      {anime.relations?.length ? <AnimeShelf title="More from this story" items={anime.relations} onPress={openRelated} /> : null}
      {anime.recommendations?.length ? <AnimeShelf title="Because you chose this" items={anime.recommendations} onPress={openRelated} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: tokens.spacing.xl },
  player: { aspectRatio: 16 / 9, borderRadius: tokens.radius.card, overflow: 'hidden', backgroundColor: '#050506', borderWidth: StyleSheet.hairlineWidth },
  playerState: { flex: 1, justifyContent: 'center' },
  streamStatus: { padding: tokens.spacing.md, borderRadius: tokens.radius.card, borderWidth: StyleSheet.hairlineWidth, gap: tokens.spacing.sm },
  statusTitle: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  episodeNavigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.sm },
  episodeJump: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  episodeInput: { flex: 1, minWidth: 74 },
  nextContent: { flexDirection: 'row-reverse' },
  sourceHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.md },
  sourceHeadingCopy: { flex: 1, gap: 3 },
  sourceTools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacing.sm },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  semibold: { fontWeight: '600', flexShrink: 1 },
});
