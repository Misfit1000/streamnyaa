import { useCallback } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { IconButton, ProgressBar, Text, useTheme } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { AnimeShelf } from '../components/AnimeShelf';
import { FeaturedCarousel } from '../components/FeaturedCarousel';
import { fetchHomeFeed } from '../services/anilist';
import { animeRouteParams } from '../lib/mediaNavigation';
import { useAppStore } from '../store/useAppStore';
import type { Anime, MainTabParamList, RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = CompositeScreenProps<BottomTabScreenProps<MainTabParamList, 'Home'>, NativeStackScreenProps<RootStackParamList>>;

export function HomeScreen({ navigation }: Props) {
  const theme = useTheme();
  const { height, width } = useWindowDimensions();
  const nsfwMode = useAppStore((state) => state.nsfwMode);
  const history = useAppStore((state) => state.history);
  const query = useQuery({ queryKey: ['home', nsfwMode], queryFn: ({ signal }) => fetchHomeFeed(nsfwMode, signal), staleTime: 15 * 60 * 1000 });
  const openAnime = useCallback((anime: Anime) => navigation.navigate('Anime', animeRouteParams(anime)), [navigation]);
  const carouselWidth = Math.max(280, width - tokens.spacing.lg * 2);
  const carouselHeight = Math.max(300, Math.min(390, height * 0.48));
  const recent = history[0];

  if (query.isLoading) return <Screen title="StreamNyaa" subtitle="Preparing your home feed"><StateView loading message="Loading this season’s anime…" /></Screen>;
  if (query.isError || !query.data) return <Screen title="StreamNyaa" subtitle="Anime, sources, and progress in one place"><StateView title="Home feed unavailable" message={query.error?.message} onRetry={() => void query.refetch()} /></Screen>;

  return (
    <Screen
      title="StreamNyaa"
      subtitle="Anime, sources, and progress in one place"
      action={<View style={styles.headerActions}><IconButton icon="magnify" mode="contained-tonal" onPress={() => navigation.navigate('Explore')} accessibilityLabel="Search" /><IconButton icon="account-circle-outline" onPress={() => navigation.navigate('Profile')} accessibilityLabel="Profile" /></View>}
    >
      <FeaturedCarousel items={query.data.trending} width={carouselWidth} height={carouselHeight} onOpen={openAnime} onWatch={(anime) => navigation.navigate('Watch', { anime })} />

      {recent ? (
        <Pressable style={({ pressed }) => [styles.continue, { backgroundColor: tokens.color.glass, borderColor: theme.colors.outlineVariant, opacity: pressed ? 0.78 : 1 }]} onPress={() => navigation.navigate('History')} accessibilityRole="button" accessibilityLabel={`Continue ${recent.animeTitle}, episode ${recent.episode}`} accessibilityHint="Opens watch history">
          <Image source={recent.image} style={[styles.continuePoster, { backgroundColor: theme.colors.surfaceVariant }]} contentFit="cover" cachePolicy="memory-disk" />
          <View style={styles.continueCopy}>
            <View style={styles.continueLabel}><MaterialCommunityIcons name="play-circle" size={16} color={theme.colors.primary} /><Text variant="labelMedium" style={{ color: theme.colors.primary }}>Continue watching</Text></View>
            <Text variant="titleMedium" numberOfLines={1} style={styles.semibold}>{recent.animeTitle}</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Episode {recent.episode} · {Math.round(recent.progressPercent)}% watched</Text>
            <ProgressBar progress={Math.max(0, Math.min(1, recent.progressPercent / 100))} style={styles.progress} />
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
        </Pressable>
      ) : null}

      <AnimeShelf title="Trending now" items={query.data.trending} onPress={openAnime} />
      <AnimeShelf title="Popular picks" items={query.data.popular} onPress={openAnime} />
      <AnimeShelf title="Airing this season" items={query.data.airing} onPress={openAnime} />
      <AnimeShelf title="Coming soon" items={query.data.upcoming} onPress={openAnime} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  continue: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, padding: tokens.spacing.md, borderRadius: tokens.radius.card, borderWidth: StyleSheet.hairlineWidth },
  continuePoster: { width: 54, height: 76, borderRadius: tokens.radius.control },
  continueCopy: { flex: 1, gap: 4 },
  continueLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  semibold: { fontWeight: '600' },
  progress: { height: 3, borderRadius: tokens.radius.pill, marginTop: tokens.spacing.xs },
});
