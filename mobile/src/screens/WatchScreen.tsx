import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import { ImageBackground } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEventListener } from 'expo';
import { useQuery } from '@tanstack/react-query';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Chip, IconButton, Menu, Modal, Portal, ProgressBar, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { AnimeShelf } from '../components/AnimeShelf';
import { EpisodeRail } from '../components/EpisodeRail';
import { Screen } from '../components/Screen';
import { SourceRow } from '../components/SourceRow';
import { StateView } from '../components/StateView';
import { WatchHero } from '../components/WatchHero';
import { watchRouteParams, mangaRouteParams } from '../lib/mediaNavigation';
import { mobileSourceCompatibilityScore, sourceAllowedByMode, type MobileSourceMode } from '../lib/mobileSourcePolicy';
import { TorrentEngine } from '../native/TorrentEngine';
import { fetchAnimeDetails, fetchAnimeEpisodes } from '../services/anilist';
import { searchAnimeSources } from '../services/sources';
import { sourceQueriesForAnime } from '../lib/sourceDiscovery';
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
  const [sourceMode, setSourceMode] = useState<MobileSourceMode>('balanced');
  const [sortMenu, setSortMenu] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [episodePickerOpen, setEpisodePickerOpen] = useState(false);
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
  const sourceFailures = useAppStore((state) => state.sourceFailures);
  const recordSourceFailure = useAppStore((state) => state.recordSourceFailure);
  const clearSourceFailure = useAppStore((state) => state.clearSourceFailure);

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
  const notYetAired = /NOT.*YET|UPCOMING/i.test(String(anime.status || ''));
  const episodePage = Math.floor((episode - 1) / 100) + 1;
  const episodeMetadata = useQuery({
    queryKey: ['anime-episodes', anime.malId, episodePage],
    queryFn: ({ signal }) => fetchAnimeEpisodes(Number(anime.malId), episodePage, signal),
    enabled: Boolean(anime.malId),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const saved = library.find((item) => item.animeId === String(anime.malId || anime.id));
  const sourceQueries = useMemo(() => sourceQueriesForAnime(anime, episode, audio), [anime, audio, episode]);
  const queryText = sourceQueries.join('|');
  const sources = useQuery({
    queryKey: ['watch-sources', sourceQueries, resourcePolicy.batterySaver],
    queryFn: ({ signal }) => searchAnimeSources(anime, episode, audio, {
      signal,
      pages: resourcePolicy.batterySaver ? 1 : 2,
      wide: !resourcePolicy.batterySaver,
    }),
    enabled: !notYetAired,
  });
  const visibleSources = useMemo(() => {
    const allSources = sources.data || [];
    const hasMatchScores = allSources.some((source) => Number(source.matchScore || 0) > 0);
    return allSources
    .filter((source) => sourceAllowedByMode(source, sourceMode, hasMatchScores))
    .filter((source) => quality === 'auto' || sourceQualityBucket(source.title) === quality)
    .filter((source) => sourceFilter === 'all' || (sourceFilter === 'trusted' ? source.trusted : !source.remake))
    .sort((left, right) => sourceSort === 'seeders'
      ? right.seeders - left.seeders
      : sourceSort === 'size'
        ? parseSizeBytes(left.size) - parseSizeBytes(right.size)
        : mobileSourceCompatibilityScore(right, resourcePolicy.batterySaver, anime) - mobileSourceCompatibilityScore(left, resourcePolicy.batterySaver, anime));
  }, [anime, quality, resourcePolicy.batterySaver, sourceFilter, sourceMode, sourceSort, sources.data]);
  const recommendedSource = useMemo(() => {
    const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return visibleSources.find((source) => {
      const failure = sourceFailures[sourceId(source)];
      return source.seeders > 0 && (!failure || Date.parse(failure.lastFailedAt) < recentCutoff);
    }) || visibleSources.find((source) => source.seeders > 0) || visibleSources[0];
  }, [sourceFailures, visibleSources]);
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
      const next = await TorrentEngine.startStream(source.magnet, `episode:${episode}`, {
        wifiOnly: resourcePolicy.wifiOnly,
        maxCacheMiB: resourcePolicy.maxCacheMiB,
        batterySaver: resourcePolicy.batterySaver,
        metadataUrls: source.metadataUrls,
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
      recordSourceFailure(sourceId(source), message);
      setStatus({ ...idleStatus, state: 'error', message, error: message });
    } finally {
      starting.current = false;
      if (mounted.current) setIsStarting(false);
    }
  }, [episode, player, recordSourceFailure, resourcePolicy.batterySaver, resourcePolicy.maxCacheMiB, resourcePolicy.wifiOnly]);

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
    const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    Object.entries(sourceFailures).forEach(([key, failure]) => { if (Date.parse(failure.lastFailedAt) >= recentCutoff) failedSources.current.add(key); });
  }, [sourceFailures]);

  useEffect(() => {
    playbackSnapshot.current = { ...playbackSnapshot.current, selected, episode };
    setEpisodeDraft(String(episode));
  }, [episode, selected]);

  useEffect(() => {
    if (!isStarting && !selected && (route.params.autoPlay || autoOpen || pendingAutoNext) && recommendedSource) {
      setPendingAutoNext(false);
      void start(recommendedSource);
    }
  }, [autoOpen, isStarting, pendingAutoNext, recommendedSource, route.params.autoPlay, selected, start]);

  useEffect(() => {
    if (status.state !== 'error' || !visibleSources.length || automaticRetries.current >= 3) return;
    if (selected) {
      const id = sourceId(selected);
      if (!failedSources.current.has(id)) recordSourceFailure(id, status.error || status.message || 'Playback failed.');
      failedSources.current.add(id);
    }
    const backup = selectBackupSource(visibleSources, failedSources.current);
    if (!backup) return;
    automaticRetries.current += 1;
    const timer = setTimeout(() => void start(backup, true), 900);
    return () => clearTimeout(timer);
  }, [recordSourceFailure, selected, start, status.error, status.message, status.state, visibleSources]);

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
    if (selected) clearSourceFailure(sourceId(selected));
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
    setEpisodePickerOpen(false);
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

  const preparingPlayback = status.state === 'metadata' || status.state === 'buffering';
  const activeSource = selected || recommendedSource;
  const activeQuality = sourceQualityBucket(activeSource?.title || '').replace('other', 'Auto');

  return (
    <Screen safeTop contentContainerStyle={styles.screen}>
      {!selected ? <WatchHero
        anime={anime}
        episode={episode}
        bookmarked={Boolean(saved?.bookmarked)}
        liked={Boolean(saved?.liked)}
        sourceLoading={sources.isLoading || isStarting}
        canPlay={Boolean(recommendedSource) && !isStarting}
        onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs')}
        onPlay={() => recommendedSource && void start(recommendedSource)}
        onBookmark={() => toggleBookmark(anime)}
        onLike={() => toggleLike(anime)}
        onTrailer={anime.trailerId ? () => void Linking.openURL(`https://www.youtube.com/watch?v=${anime.trailerId}`) : undefined}
      /> : (
        <View style={styles.playerToolbar}>
          <IconButton icon="arrow-left" onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs')} accessibilityLabel="Go back" />
          <View style={styles.playerToolbarCopy}><Text variant="titleMedium" numberOfLines={1} style={styles.semibold}>{anime.title}</Text><Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Episode {episode}</Text></View>
          <IconButton icon={saved?.bookmarked ? 'bookmark' : 'bookmark-outline'} onPress={() => toggleBookmark(anime)} accessibilityLabel={saved?.bookmarked ? 'Remove bookmark' : 'Bookmark'} />
        </View>
      )}

      {selected ? (
        <>
          <View style={styles.player}>
            {status.streamUrl ? (
              <VideoView style={StyleSheet.absoluteFill} player={player} nativeControls contentFit="contain" surfaceType="surfaceView" allowsPictureInPicture startsPictureInPictureAutomatically={resourcePolicy.allowBackgroundPlayback} onPictureInPictureStart={() => { pipActive.current = true; }} onPictureInPictureStop={() => { pipActive.current = false; }} />
            ) : (
              <ImageBackground source={anime.banner || anime.cover} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk">
                <LinearGradient colors={['rgba(3,3,4,0.52)', 'rgba(3,3,4,0.96)']} style={StyleSheet.absoluteFill} />
                <View style={styles.playerState}>
                  <StateView compact loading={preparingPlayback} title={status.state === 'error' ? 'Playback needs attention' : `Preparing episode ${episode}`} message={status.state === 'error' ? status.error || status.message : 'StreamNyaa is testing the fastest available playback path.'} />
                </View>
              </ImageBackground>
            )}
          </View>
          {preparingPlayback ? <View style={styles.preparing}><View style={styles.preparingCopy}><Text variant="titleSmall" style={styles.semibold}>Preparing video</Text><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>A healthier backup is selected automatically if this release stalls.</Text></View><ProgressBar indeterminate={status.bufferedPercent <= 0} progress={Math.max(status.bufferedPercent, status.progress) / 100} /></View> : null}
          {status.state === 'error' ? <View style={[styles.playbackError, { borderColor: theme.colors.outlineVariant }]}><View style={styles.playbackErrorCopy}><Text variant="titleSmall" style={styles.semibold}>This release could not start</Text><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{status.error || status.message}</Text></View><Button mode="contained-tonal" onPress={() => recommendedSource && void start(recommendedSource)}>Retry</Button><Button mode="text" onPress={() => setSourcePickerOpen(true)}>Advanced</Button></View> : null}
        </>
      ) : null}

      {!selected && !sources.isLoading && (sources.isError || !recommendedSource) ? (
        <View style={[styles.sourceNotice, { borderColor: theme.colors.outlineVariant }]}>
          <View style={styles.sourceNoticeCopy}><Text variant="titleSmall" style={styles.semibold}>Playback is not ready</Text><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{sources.isError ? sources.error.message : 'No active release was available for this episode.'}</Text></View>
          <Button compact mode="contained-tonal" onPress={() => void sources.refetch()}>Try again</Button>
          <Button compact mode="text" onPress={() => setSourcePickerOpen(true)}>Advanced</Button>
        </View>
      ) : null}

      <EpisodeRail current={episode} total={anime.episodes} details={episodeMetadata.data?.episodes} onSelect={(value) => changeEpisode(value)} />
      <View style={styles.episodeNavigation}>
        <IconButton icon="chevron-left" mode="contained-tonal" size={20} disabled={episode <= 1} onPress={() => changeEpisode(episode - 1)} accessibilityLabel="Previous episode" />
        <Button compact mode="text" icon="format-list-numbered" onPress={() => { setEpisodeDraft(String(episode)); setEpisodePickerOpen(true); }}>Episode {episode}</Button>
        <IconButton icon="chevron-right" mode="contained-tonal" size={20} onPress={() => changeEpisode(episode + 1)} accessibilityLabel="Next episode" />
      </View>

      <View style={styles.watchActions}>
        <Button mode={saved?.bookmarked ? 'contained-tonal' : 'text'} icon={saved?.bookmarked ? 'check' : 'plus'} onPress={() => toggleBookmark(anime)}>My List</Button>
        <Button mode={saved?.liked ? 'contained-tonal' : 'text'} icon={saved?.liked ? 'heart' : 'heart-outline'} onPress={() => toggleLike(anime)}>Like</Button>
        <Button mode="text" icon="share-variant-outline" onPress={() => void Share.share({ title: anime.title, message: `${anime.title} · Episode ${episode}` })}>Share</Button>
        <Button mode="text" icon="tune-variant" onPress={() => setSourcePickerOpen(true)}>Advanced</Button>
      </View>

      {anime.description ? <View style={styles.about}><Text variant="titleLarge" style={styles.semibold}>About</Text><Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 22 }}>{anime.description}</Text></View> : null}

      {anime.genres?.length ? <View style={styles.genres}>{anime.genres.slice(0, 6).map((genre) => <Chip key={genre} compact mode="outlined" onPress={() => navigation.navigate('Catalog', { title: `${genre} anime`, genre })}>{genre}</Chip>)}</View> : null}
      {anime.relations?.length ? <AnimeShelf title="More from this story" items={anime.relations} onPress={openRelated} /> : null}
      {anime.recommendations?.length ? <AnimeShelf title="Because you chose this" items={anime.recommendations} onPress={openRelated} /> : null}

      <Portal>
        <Modal visible={episodePickerOpen} onDismiss={() => setEpisodePickerOpen(false)} contentContainerStyle={[styles.episodeSheet, { backgroundColor: theme.colors.surface }]}>
          <Text variant="titleLarge" style={styles.semibold}>Jump to episode</Text>
          <TextInput value={episodeDraft} onChangeText={setEpisodeDraft} onSubmitEditing={jumpToEpisode} keyboardType="number-pad" mode="outlined" autoFocus label="Episode number" />
          <View style={styles.episodeSheetActions}><Button onPress={() => setEpisodePickerOpen(false)}>Cancel</Button><Button mode="contained" onPress={jumpToEpisode}>Open episode</Button></View>
        </Modal>
        <Modal visible={sourcePickerOpen} onDismiss={() => setSourcePickerOpen(false)} contentContainerStyle={[styles.sourceSheet, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.sheetHeading}>
            <View style={styles.sourceHeadingCopy}><Text variant="titleLarge" style={styles.semibold}>Playback options</Text><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Episode {episode} · {activeQuality} · {status.peers} peers · {(status.downloadRate / 1024 / 1024).toFixed(1)} MB/s</Text></View>
            <Button compact onPress={() => setSourcePickerOpen(false)}>Done</Button>
          </View>
          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <SegmentedButtons value={audio} onValueChange={(value) => setAudio(value as typeof audio)} buttons={[{ value: 'sub-preferred', label: 'Sub' }, { value: 'dual-preferred', label: 'Dual' }, { value: 'dub-only', label: 'Dub' }]} density="small" />
            <SegmentedButtons value={sourceMode} onValueChange={(value) => setSourceMode(value as MobileSourceMode)} buttons={[{ value: 'strict', label: 'Exact' }, { value: 'balanced', label: 'Balanced' }, { value: 'broad', label: 'Broad' }]} density="small" />
            <SegmentedButtons value={quality} onValueChange={setQuality} buttons={[{ value: 'auto', label: 'Best' }, { value: '1080p', label: '1080p' }, { value: '720p', label: '720p' }, { value: '2160p', label: '4K' }]} density="small" />
            <View style={styles.sourceTools}>
              <Chip selected={sourceFilter === 'trusted'} mode="outlined" icon="check-decagram-outline" onPress={() => setSourceFilter(sourceFilter === 'trusted' ? 'all' : 'trusted')}>Trusted</Chip>
              <Chip selected={sourceFilter === 'no-remakes'} mode="outlined" icon="shield-check-outline" onPress={() => setSourceFilter(sourceFilter === 'no-remakes' ? 'all' : 'no-remakes')}>No remakes</Chip>
              <Menu visible={sortMenu} onDismiss={() => setSortMenu(false)} anchor={<Button compact mode="text" icon="sort" onPress={() => setSortMenu(true)}>{sourceSort === 'best' ? 'Best match' : sourceSort === 'seeders' ? 'Seeders' : 'Smallest'}</Button>}>
                {([['best', 'Best match'], ['seeders', 'Most seeders'], ['size', 'Smallest size']] as const).map(([value, label]) => <Menu.Item key={value} title={label} leadingIcon={sourceSort === value ? 'check' : undefined} onPress={() => { setSourceSort(value); setSortMenu(false); }} />)}
              </Menu>
            </View>
            <View style={[styles.diagnostics, { borderColor: theme.colors.outlineVariant }]}><Text variant="labelLarge" style={styles.semibold}>Connection details</Text><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{status.message}{status.waitSeconds ? ` · ${status.waitSeconds}s elapsed` : ''}</Text></View>
            <Button mode="outlined" icon="download-outline" onPress={() => { setSourcePickerOpen(false); navigation.navigate('Downloads', { anime, episode }); }}>Browse every release</Button>
            {sources.isLoading ? <StateView loading message="Checking compatible releases..." /> : sources.isError ? <StateView title="Release check failed" message={sources.error.message} onRetry={() => void sources.refetch()} /> : visibleSources.length ? visibleSources.slice(0, resourcePolicy.batterySaver ? 6 : 10).map((source) => <SourceRow key={`${source.infoHash}-${source.title}`} source={source} onPlay={() => { setSourcePickerOpen(false); void start(source); }} onShare={() => void Share.share({ message: source.magnet })} />) : <StateView title="No release found" message="Try Best quality or another audio mode." />}
          </ScrollView>
        </Modal>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: tokens.spacing.lg },
  player: { aspectRatio: 16 / 9, marginHorizontal: -tokens.spacing.lg, overflow: 'hidden', backgroundColor: '#050506' },
  playerToolbar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -tokens.spacing.sm },
  playerToolbarCopy: { flex: 1 },
  playerState: { flex: 1, justifyContent: 'center' },
  preparing: { gap: tokens.spacing.sm, paddingVertical: tokens.spacing.md },
  preparingCopy: { gap: 3 },
  playbackError: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  playbackErrorCopy: { width: '100%', gap: 3 },
  sourceNotice: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: tokens.spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: tokens.spacing.md },
  sourceNoticeCopy: { flex: 1, gap: 3 },
  episodeNavigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.sm },
  sourceHeadingCopy: { flex: 1, gap: 3 },
  watchActions: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: tokens.spacing.xs },
  about: { gap: tokens.spacing.sm },
  episodeSheet: { marginHorizontal: tokens.spacing.xl, borderRadius: tokens.radius.card, padding: tokens.spacing.lg, gap: tokens.spacing.lg },
  episodeSheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: tokens.spacing.sm },
  sourceSheet: { marginHorizontal: tokens.spacing.md, maxHeight: '88%', borderRadius: tokens.radius.card, overflow: 'hidden' },
  sheetHeading: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, padding: tokens.spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.color.outlineSoft },
  sheetContent: { gap: tokens.spacing.md, padding: tokens.spacing.lg, paddingBottom: tokens.spacing.xxl },
  sourceTools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacing.sm },
  diagnostics: { gap: 4, padding: tokens.spacing.md, borderRadius: tokens.radius.card, borderWidth: StyleSheet.hairlineWidth },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  semibold: { fontWeight: '600', flexShrink: 1 },
});
