import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text, useTheme } from 'react-native-paper';
import { ContinueWatchingRail } from '../components/ContinueWatchingRail';
import { FeaturedCarousel } from '../components/FeaturedCarousel';
import { HomeTopBar, type HomeFilter } from '../components/HomeTopBar';
import { StateView } from '../components/StateView';
import { TrendingAnimeRow } from '../components/TrendingAnimeRow';
import { Screen } from '../components/Screen';
import { useAuth } from '../context/AuthContext';
import { sourceQueriesForAnime } from '../lib/sourceDiscovery';
import { watchRouteParams } from '../lib/mediaNavigation';
import { fetchHomeFeed } from '../services/anilist';
import { searchAnimeSources } from '../services/sources';
import { useAppStore } from '../store/useAppStore';
import type { Anime, MainTabParamList, PlaybackHistoryItem, RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = CompositeScreenProps<BottomTabScreenProps<MainTabParamList, 'Home'>, NativeStackScreenProps<RootStackParamList>>;

export function HomeScreen({ navigation }: Props) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const { height, width } = useWindowDimensions();
  const [filter, setFilter] = useState<HomeFilter>('for-you');
  const nsfwMode = useAppStore((state) => state.nsfwMode);
  const history = useAppStore((state) => state.history);
  const library = useAppStore((state) => state.library);
  const audio = useAppStore((state) => state.audioPreference);
  const setAudio = useAppStore((state) => state.setAudioPreference);
  const resourcePolicy = useAppStore((state) => state.resourcePolicy);
  const toggleBookmark = useAppStore((state) => state.toggleBookmark);
  const query = useQuery({ queryKey: ['home', nsfwMode], queryFn: ({ signal }) => fetchHomeFeed(nsfwMode, signal), staleTime: 15 * 60 * 1000 });

  const openAnime = useCallback((anime: Anime) => navigation.navigate('Watch', { ...watchRouteParams(anime), autoPlay: true }), [navigation]);
  const openHistory = useCallback((item: PlaybackHistoryItem) => navigation.navigate('Watch', {
    anime: { id: Number(item.animeId), title: item.animeTitle, cover: item.image },
    episode: item.episode,
    resumeSeconds: item.resumeSeconds,
    autoPlay: true,
    source: { title: item.sourceTitle, magnet: item.magnet, infoHash: '', seeders: 0, leechers: 0 },
  }), [navigation]);

  const heroItems = useMemo(() => {
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
  const savedIds = useMemo(() => new Set(library.filter((item) => item.bookmarked).map((item) => item.animeId)), [library]);
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
    const candidate = heroItems[0];
    if (!candidate) return undefined;
    const sourceQueries = sourceQueriesForAnime(candidate, 1, audio);
    const timer = setTimeout(() => {
      void queryClient.prefetchQuery({
        queryKey: ['watch-sources', sourceQueries, resourcePolicy.batterySaver],
        queryFn: ({ signal }) => searchAnimeSources(candidate, 1, audio, { signal, pages: 1, wide: false }),
        staleTime: 5 * 60 * 1000,
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [audio, heroItems, queryClient, resourcePolicy.batterySaver]);

  const chooseFilter = useCallback((next: HomeFilter) => {
    setFilter(next);
    if (next === 'dubbed' && audio !== 'dual-preferred') setAudio('dual-preferred');
  }, [audio, setAudio]);

  if (query.isLoading) return <Screen><StateView loading message="Loading your home feed…" /></Screen>;
  if (query.isError || !query.data) return <Screen><StateView title="Home feed unavailable" message={query.error?.message} onRetry={() => void query.refetch()} /></Screen>;

  const contentWidth = width - tokens.spacing.lg * 2;
  const heroHeight = Math.max(310, Math.min(390, height * 0.46));
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <LinearGradient colors={['rgba(92,3,23,0.18)', theme.colors.background]} locations={[0, 0.22]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <FlatList
        data={feedItems.slice(0, 14)}
        keyExtractor={(item) => `home-feed-${item.metadataProvider || 'media'}-${item.id}`}
        renderItem={({ item }) => <TrendingAnimeRow anime={item} onPress={() => openAnime(item)} />}
        ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />}
        ListHeaderComponent={(
          <View style={styles.headerContent}>
            <HomeTopBar activeFilter={filter} avatarUrl={avatarUrl} onFilter={chooseFilter} onOpenSchedule={() => navigation.navigate('Schedule')} onOpenProfile={() => navigation.navigate('Profile')} />
            <FeaturedCarousel
              items={heroItems}
              width={contentWidth}
              height={heroHeight}
              onOpen={openAnime}
              onWatch={openAnime}
              onToggleSave={toggleBookmark}
              isSaved={(anime) => savedIds.has(String(anime.malId || anime.id))}
            />
            <ContinueWatchingRail items={history} imageFor={(item) => artworkById.get(item.animeId) || item.image} onPress={openHistory} onSeeAll={() => navigation.navigate('History')} />
            <View style={styles.sectionHeading}><Text variant="titleLarge" style={styles.heading}>{sectionTitle}</Text><Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{feedItems.length} titles</Text></View>
          </View>
        )}
        ListFooterComponent={<View style={styles.footer} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={theme.colors.primary} colors={[theme.colors.primary]} progressBackgroundColor={theme.colors.surfaceVariant} />}
        showsVerticalScrollIndicator={false}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={32}
        windowSize={7}
        removeClippedSubviews
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingHorizontal: tokens.spacing.lg },
  headerContent: { gap: tokens.spacing.xl, paddingBottom: tokens.spacing.md },
  sectionHeading: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.md },
  heading: { fontWeight: '600', letterSpacing: -0.25 },
  divider: { height: StyleSheet.hairlineWidth },
  footer: { height: tokens.spacing.xxl },
});
