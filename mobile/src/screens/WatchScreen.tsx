import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, IconButton, Text, useTheme } from 'react-native-paper';
import { AnimeShelf } from '../components/AnimeShelf';
import { EpisodeRail } from '../components/EpisodeRail';
import { PlaybackSurface } from '../components/PlaybackSurface';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { TrailerModal } from '../components/TrailerModal';
import { usePlayback } from '../context/PlaybackContext';
import { mangaRouteParams, watchRouteParams } from '../lib/mediaNavigation';
import { fetchAnimeDetails, fetchAnimeEpisodes } from '../services/anilist';
import { useAppStore } from '../store/useAppStore';
import type { Anime, RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Watch'>;

export function WatchScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const playback = usePlayback();
  const routeAnime = route.params.anime;
  const requestedEpisode = route.params.episode || 1;
  const startKey = `${routeAnime.id}:${requestedEpisode}:${route.params.source?.infoHash || ''}`;
  const startedRef = useRef('');
  const resumeAfterTrailerRef = useRef(false);
  const [trailerVisible, setTrailerVisible] = useState(false);
  const library = useAppStore((state) => state.library);
  const autoOpenBestSource = useAppStore((state) => state.autoOpenBestSource);
  const toggleBookmark = useAppStore((state) => state.toggleBookmark);
  const toggleLike = useAppStore((state) => state.toggleLike);

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
  const episode = playback.anime?.id === anime.id ? playback.episode : requestedEpisode;
  const episodePage = Math.floor((episode - 1) / 100) + 1;
  const episodeMetadata = useQuery({
    queryKey: ['anime-episodes', anime.malId, episodePage],
    queryFn: ({ signal }) => fetchAnimeEpisodes(Number(anime.malId), episodePage, signal),
    enabled: Boolean(anime.malId),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const saved = library.find((item) => item.animeId === String(anime.malId || anime.id));
  const notYetAired = /NOT.*YET|UPCOMING/i.test(String(anime.status || ''));
  const activeSession = playback.anime?.id === anime.id && playback.episode === requestedEpisode;
  const requestedSourceId = route.params.source?.infoHash || route.params.source?.magnet;
  const activeSourceId = playback.source?.infoHash || playback.source?.magnet;
  const requestedSessionActive = activeSession && (!requestedSourceId || requestedSourceId === activeSourceId);
  const shouldAutoStart = Boolean(route.params.source || route.params.autoPlay || autoOpenBestSource);
  const playbackMetadataReady = !details.isPending;

  const beginPlayback = useCallback(() => {
    if (!playbackMetadataReady || notYetAired || startedRef.current === startKey) return;
    startedRef.current = startKey;
    void playback.startPlayback({
      anime,
      episode: requestedEpisode,
      source: route.params.source,
      resumeSeconds: route.params.resumeSeconds,
    });
  }, [anime, notYetAired, playback.startPlayback, playbackMetadataReady, requestedEpisode, route.params.resumeSeconds, route.params.source, startKey]);

  useEffect(() => {
    if (shouldAutoStart && playbackMetadataReady && !requestedSessionActive) beginPlayback();
  }, [beginPlayback, playbackMetadataReady, requestedSessionActive, shouldAutoStart]);

  useFocusEffect(useCallback(() => {
    playback.expand();
    return () => playback.minimize();
  }, [playback.expand, playback.minimize]));

  const leavePlayer = () => {
    playback.minimize();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Tabs');
  };

  const related = useMemo(() => (anime.recommendations || anime.relations || []).filter((item) => item.id !== anime.id).slice(0, 12), [anime]);
  const activeEpisodeMetadata = episodeMetadata.data?.episodes.find((item: { number: number }) => item.number === episode);
  const openRelated = (item: Anime) => {
    if (item.mediaType === 'MANGA') navigation.push('Manga', mangaRouteParams(item));
    else navigation.replace('Watch', watchRouteParams(item));
  };
  const selectEpisode = (value: number) => {
    if (playback.anime?.id === anime.id) void playback.changeEpisode(value);
    else void playback.startPlayback({ anime, episode: value });
  };
  const playerVisible = activeSession || shouldAutoStart || startedRef.current === startKey;
  const showToolbar = !playerVisible || !playback.status.streamUrl;
  const browseSources = () => navigation.navigate('Downloads', { anime, episode });
  const openTrailer = () => {
    resumeAfterTrailerRef.current = playback.playing;
    if (playback.playing) playback.pause();
    setTrailerVisible(true);
  };
  const closeTrailer = () => {
    setTrailerVisible(false);
    if (resumeAfterTrailerRef.current) playback.play();
    resumeAfterTrailerRef.current = false;
  };

  return (
    <Screen safeTop contentContainerStyle={styles.screen}>
      {showToolbar ? <View style={styles.toolbar}>
        <IconButton icon="arrow-left" size={24} onPress={leavePlayer} accessibilityLabel="Minimize player and go back" />
        <View style={styles.toolbarCopy}>
          <Text variant="titleMedium" numberOfLines={1} style={styles.semibold}>{anime.title}</Text>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Episode {episode}</Text>
        </View>
        <IconButton icon={saved?.liked ? 'heart' : 'heart-outline'} onPress={() => toggleLike(anime)} accessibilityLabel={saved?.liked ? 'Unlike title' : 'Like title'} />
        <IconButton icon={saved?.bookmarked ? 'bookmark' : 'bookmark-outline'} onPress={() => toggleBookmark(anime)} accessibilityLabel={saved?.bookmarked ? 'Remove bookmark' : 'Save title'} />
      </View> : null}

      {notYetAired ? <StateView title="Not available yet" message="This title has not started airing, so there is no playable episode source." /> : playerVisible ? <PlaybackSurface onBrowseSources={browseSources} onMinimize={leavePlayer} /> : (
        <View style={[styles.ready, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
          <View style={styles.readyMark}><MaterialCommunityIcons name="play" size={34} color="#FFFFFF" /></View>
          <View style={styles.readyCopy}>
            <Text variant="titleMedium" style={styles.semibold}>Episode {requestedEpisode} is ready</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Play finds and starts the best compatible release automatically.</Text>
          </View>
          <Button mode="contained" icon="play" loading={!playbackMetadataReady} disabled={!playbackMetadataReady} contentStyle={styles.playContent} onPress={beginPlayback}>
            {playbackMetadataReady ? 'Play' : 'Preparing'}
          </Button>
        </View>
      )}

      <View style={styles.episodeSummary}>
        <View style={styles.episodeCopy}>
          <Text variant="labelMedium" style={{ color: theme.colors.primary }}>Episode {episode}</Text>
          <Text variant="titleMedium" numberOfLines={1} style={styles.semibold}>{activeEpisodeMetadata?.title || anime.title}</Text>
        </View>
        <IconButton icon="skip-previous" size={24} disabled={episode <= 1} onPress={() => selectEpisode(episode - 1)} accessibilityLabel="Previous episode" />
        <IconButton icon="skip-next" size={24} disabled={Boolean(anime.episodes && episode >= anime.episodes)} onPress={() => selectEpisode(episode + 1)} accessibilityLabel="Next episode" />
      </View>

      <EpisodeRail current={episode} total={anime.episodes} details={episodeMetadata.data?.episodes} onSelect={selectEpisode} />

      <View style={styles.secondaryActions}>
        {anime.trailerId ? <Button mode="text" icon="youtube" onPress={openTrailer}>Trailer</Button> : null}
        <Button mode="text" icon="access-point" onPress={browseSources}>Releases</Button>
        <Button mode="text" icon="share-variant-outline" onPress={() => void Share.share({ title: anime.title, message: `${anime.title} · Episode ${episode}` })}>Share</Button>
      </View>

      {related.length ? <View style={styles.related}><AnimeShelf title="More like this" items={related} onPress={openRelated} /></View> : null}
      {anime.trailerId ? <TrailerModal visible={trailerVisible} trailerId={anime.trailerId} title={anime.title} onClose={closeTrailer} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, gap: tokens.spacing.lg },
  toolbar: { minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  toolbarCopy: { flex: 1, minWidth: 0, gap: 2 },
  ready: { marginHorizontal: tokens.spacing.md, minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12, padding: tokens.spacing.lg, borderWidth: StyleSheet.hairlineWidth, borderRadius: tokens.radius.card },
  readyMark: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 32, backgroundColor: tokens.color.brand },
  readyCopy: { maxWidth: 300, alignItems: 'center', gap: 4 },
  playContent: { minHeight: 48, paddingHorizontal: 18 },
  episodeSummary: { minHeight: 62, flexDirection: 'row', alignItems: 'center', paddingHorizontal: tokens.spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: tokens.color.outlineSoft },
  episodeCopy: { flex: 1, minWidth: 0, gap: 3 },
  secondaryActions: { flexDirection: 'row', justifyContent: 'center', gap: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
  related: { paddingLeft: tokens.spacing.lg },
  semibold: { fontWeight: '600' },
});
