import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text, useTheme } from 'react-native-paper';
import { ContinueWatchingRail } from '../components/ContinueWatchingRail';
import { HomeDiscoveryRail } from '../components/HomeDiscoveryRail';
import { HomeTopBar, type HomeFilter } from '../components/HomeTopBar';
import { StateView } from '../components/StateView';
import { TrendingAnimeRow } from '../components/TrendingAnimeRow';
import { Screen } from '../components/Screen';
import { useAuth } from '../context/AuthContext';
import { watchRouteParams } from '../lib/mediaNavigation';
import { fetchHomeFeed } from '../services/anilist';
import { searchAnimeSources } from '../services/sources';
import { useAppStore } from '../store/useAppStore';
import type { Anime, MainTabParamList, PlaybackHistoryItem, RootStackParamList } from '../types';
import { tokens } from '../theme';
import { TorrentEngine } from '../native/TorrentEngine';

type Props = CompositeScreenProps<BottomTabScreenProps<MainTabParamList, 'Home'>, NativeStackScreenProps<RootStackParamList>>;

export function HomeScreen({ navigation }: Props) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const [filter, setFilter] = useState<HomeFilter>('for-you');
  const [cacheReady, setCacheReady] = useState(false);
  const nsfwMode = useAppStore((state) => state.nsfwMode);
  const history = useAppStore((state) => state.history);
  const audio = useAppStore((state) => state.audioPreference);
  const setAudio = useAppStore((state) => state.setAudioPreference);
  const resourcePolicy = useAppStore((state) => state.resourcePolicy);
  const runtimeProfile = useMemo(() => TorrentEngine.getRuntimeProfile(), []);
  const resolvedProfile = resourcePolicy.performanceProfile === 'auto' ? runtimeProfile.resolvedProfile : resourcePolicy.performanceProfile;
  const homeCacheKey = `streamnyaa.home.v1.${nsfwMode ? 'all' : 'safe'}`;

  useEffect(() => {
    let cancelled = false;
    setCacheReady(false);
    void AsyncStorage.getItem(homeCacheKey).then((raw) => {
      if (!raw || cancelled) return;
      const cached = JSON.parse(raw) as { savedAt?: number; data?: unknown };
      if (!cached.data || !cached.savedAt || Date.now() - cached.savedAt > 24 * 60 * 60 * 1000) return;
      queryClient.setQueryData(['home', nsfwMode], cached.data, { updatedAt: cached.savedAt });
    }).catch(() => undefined).finally(() => { if (!cancelled) setCacheReady(true); });
    return () => { cancelled = true; };
  }, [homeCacheKey, nsfwMode, queryClient]);

  const query = useQuery({ queryKey: ['home', nsfwMode], queryFn: ({ signal }) => fetchHomeFeed(nsfwMode, signal), staleTime: 15 * 60 * 1000, enabled: cacheReady });

  useEffect(() => {
    if (!query.data || query.isFetching) return;
    void AsyncStorage.setItem(homeCacheKey, JSON.stringify({ savedAt: Date.now(), data: query.data })).catch(() => undefined);
  }, [homeCacheKey, query.data, query.isFetching]);

  const openAnime = useCallback((anime: Anime) => navigation.navigate('Watch', { ...watchRouteParams(anime), autoPlay: true }), [navigation]);
  const openHistory = useCallback((item: PlaybackHistoryItem) => navigation.navigate('Watch', {
    anime: { id: Number(item.animeId), title: item.animeTitle, cover: item.image },
    episode: item.episode,
    resumeSeconds: item.resumeSeconds,
    autoPlay: true,
    source: { title: item.sourceTitle, magnet: item.magnet, infoHash: '', seeders: 0, leechers: 0 },
  }), [navigation]);

  const discoveryItems = useMemo(() => {
    if (!query.data) return [];
    if (filter === 'latest') return query.data.latest;
    if (filter === 'trending') return query.data.trending;
    if (filter === 'dubbed') return query.data.popular;
    return [...query.data.trending.slice(0, 3), ...query.data.popular].filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);
  }, [filter, query.data]);

  const feedItems = useMemo(() => {
    if (!query.data) return [];
    if (filter === 'latest') return query.data.latest;
    if (filter === 'trending') return query.data.trending;
    if (filter === 'dubbed') return query.data.popular;
    return query.data.airing.length ? query.data.airing : query.data.trending;
  }, [filter, query.data]);

  const sectionTitle = filter === 'latest' ? 'Latest releases' : filter === 'dubbed' ? 'Popular with dub preference' : 'Trending now';
  const avatarUrl = String(auth.user?.user_metadata?.avatar_url || auth.user?.user_metadata?.picture || '') || undefined;
  const artworkById = useMemo(() => {
    const map = new Map<string, string>();
    if (!query.data) return map;
    [...query.data.latest, ...query.data.trending, ...query.data.popular, ...query.data.airing].forEach((anime) => {
      const artwork = anime.banner || anime.cover;
      if (!artwork) return;
      map.set(String(anime.id), artwork);
      if (anime.malId) map.set(String(anime.malId), artwork);
    });
    return map;
  }, [query.data]);

  useEffect(() => {
    const candidate = discoveryItems[0];
    if (!candidate) return undefined;
    const timer = setTimeout(() => {
      void queryClient.prefetchQuery({
        queryKey: ['playback-sources', candidate.id, 1, audio, resolvedProfile, resourcePolicy.balancedFileSize],
        queryFn: ({ signal }) => searchAnimeSources(candidate, 1, audio, { signal, pages: 1, wide: false }),
        staleTime: 5 * 60 * 1000,
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [audio, discoveryItems, queryClient, resolvedProfile, resourcePolicy.balancedFileSize, resourcePolicy.batterySaver]);

  const chooseFilter = useCallback((next: HomeFilter) => {
    setFilter(next);
    if (next === 'dubbed' && audio !== 'dual-preferred') setAudio('dual-preferred');
  }, [audio, setAudio]);

  if (query.isLoading) return <Screen><StateView loading message="Loading your home feed…" /></Screen>;
  if (query.isError || !query.data) return <Screen><StateView title="Home feed unavailable" message={query.error?.message} onRetry={() => void query.refetch()} /></Screen>;

  const constrained = resolvedProfile === 'constrained';
  const discoveryTitle = filter === 'trending' ? 'Rising today' : filter === 'latest' ? 'New this week' : filter === 'dubbed' ? 'Dub-ready picks' : 'Quick picks';
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <LinearGradient colors={['rgba(92,3,23,0.18)', theme.colors.background]} locations={[0, 0.22]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <FlatList
        data={feedItems.slice(0, constrained ? 10 : 14)}
        keyExtractor={(item) => `home-feed-${item.metadataProvider || 'media'}-${item.id}`}
        renderItem={({ item }) => <TrendingAnimeRow anime={item} onPress={() => openAnime(item)} />}
        ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />}
        ListHeaderComponent={(
          <View style={styles.headerContent}>
            <HomeTopBar
              activeFilter={filter}
              avatarUrl={avatarUrl}
              onFilter={chooseFilter}
              onOpenSearch={() => navigation.navigate('Explore')}
              onOpenHistory={() => navigation.navigate('History')}
              onOpenSchedule={() => navigation.navigate('Schedule')}
              onOpenProfile={() => navigation.navigate('Profile')}
            />
            <ContinueWatchingRail items={history} imageFor={(item) => artworkById.get(item.animeId) || item.image} onPress={openHistory} onSeeAll={() => navigation.navigate('History')} />
            <HomeDiscoveryRail title={discoveryTitle} items={discoveryItems} onPress={openAnime} />
            <View style={styles.sectionHeading}><Text variant="titleLarge" style={styles.heading}>{sectionTitle}</Text><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{feedItems.length} titles</Text></View>
          </View>
        )}
        ListFooterComponent={<View style={styles.footer} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={theme.colors.primary} colors={[theme.colors.primary]} progressBackgroundColor={theme.colors.surfaceVariant} />}
        showsVerticalScrollIndicator={false}
        initialNumToRender={constrained ? 4 : 5}
        maxToRenderPerBatch={constrained ? 3 : 5}
        updateCellsBatchingPeriod={constrained ? 48 : 32}
        windowSize={constrained ? 5 : 7}
        removeClippedSubviews
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingHorizontal: tokens.spacing.lg },
  headerContent: { gap: tokens.spacing.lg, paddingBottom: tokens.spacing.sm },
  sectionHeading: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.md },
  heading: { fontWeight: '600', letterSpacing: -0.25 },
  divider: { height: StyleSheet.hairlineWidth },
  footer: { height: tokens.spacing.xxl },
});
