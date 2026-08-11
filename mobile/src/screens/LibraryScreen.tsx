import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Button, Chip, ProgressBar, Searchbar, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AnimeCard } from '../components/AnimeCard';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { useAppStore } from '../store/useAppStore';
import { watchRouteParams } from '../lib/mediaNavigation';
import type { Anime, MainTabParamList, PlaybackHistoryItem, RootStackParamList } from '../types';
import { tokens } from '../theme';
import { isPlaybackComplete } from '../../../shared/account';

type Props = CompositeScreenProps<BottomTabScreenProps<MainTabParamList, 'Library'>, NativeStackScreenProps<RootStackParamList>>;
type Section = 'watching' | 'completed' | 'saved' | 'liked';

export function LibraryScreen({ navigation }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const library = useAppStore((state) => state.library);
  const history = useAppStore((state) => state.history);
  const [section, setSection] = useState<Section>('watching');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<'newest' | 'title' | 'score'>('newest');
  const columns = width >= 720 ? 5 : width >= 520 ? 4 : width >= 380 ? 3 : 2;
  const cardWidth = Math.floor((width - tokens.spacing.lg * 2 - (columns - 1) * tokens.spacing.md) / columns);
  const counts = useMemo(() => {
    let saved = 0; let liked = 0; let completed = 0;
    library.forEach((item) => { if (item.bookmarked) saved += 1; if (item.liked) liked += 1; });
    history.forEach((item) => { if (isPlaybackComplete(item.progressPercent, item.resumeSeconds, item.durationSeconds)) completed += 1; });
    return { saved, liked, completed, watching: history.length - completed };
  }, [history, library]);
  const mediaItems = useMemo(() => library
    .filter((item) => (section === 'saved' ? item.bookmarked : item.liked) && item.animeTitle.toLowerCase().includes(deferredQuery.trim().toLowerCase()))
    .sort((left, right) => sort === 'title'
      ? left.animeTitle.localeCompare(right.animeTitle)
      : sort === 'score'
        ? Number(right.anime.score || 0) - Number(left.anime.score || 0)
        : Date.parse(right.updatedAt) - Date.parse(left.updatedAt)), [deferredQuery, library, section, sort]);
  const progressItems = useMemo(() => history
    .filter((item) => {
      const complete = isPlaybackComplete(item.progressPercent, item.resumeSeconds, item.durationSeconds);
      if (section === 'watching' && complete) return false;
      if (section === 'completed' && !complete) return false;
      return `${item.animeTitle} ${item.sourceTitle}`.toLowerCase().includes(deferredQuery.trim().toLowerCase());
    })
    .sort((left, right) => sort === 'title'
      ? left.animeTitle.localeCompare(right.animeTitle)
      : sort === 'score'
        ? right.progressPercent - left.progressPercent
        : Date.parse(right.updatedAt) - Date.parse(left.updatedAt)), [deferredQuery, history, section, sort]);
  const showsProgress = section === 'watching' || section === 'completed';
  const total = showsProgress ? progressItems.length : mediaItems.length;

  const resume = (item: PlaybackHistoryItem) => {
    const anime: Anime = { id: Number(item.animeId), title: item.animeTitle, cover: item.image };
    navigation.navigate('Watch', {
      anime,
      episode: item.episode,
      resumeSeconds: item.resumeSeconds,
      source: { title: item.sourceTitle, magnet: item.magnet, infoHash: '', seeders: 0, leechers: 0 },
    });
  };

  return (
    <Screen title="Library" scroll={false}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sections}>
        {([
          { id: 'watching', label: 'Watching', count: counts.watching, icon: 'play-circle-outline' },
          { id: 'completed', label: 'Completed', count: counts.completed, icon: 'check-circle-outline' },
          { id: 'saved', label: 'Saved', count: counts.saved, icon: 'bookmark-outline' },
          { id: 'liked', label: 'Liked', count: counts.liked, icon: 'heart-outline' },
        ] as const).map((item) => <Chip key={item.id} selected={section === item.id} icon={item.icon} mode="outlined" onPress={() => setSection(item.id)}>{item.label} {item.count}</Chip>)}
      </ScrollView>
      {(history.length || library.length) ? <Searchbar value={query} onChangeText={setQuery} placeholder={`Search ${showsProgress ? 'progress' : 'library'}`} style={styles.search} /> : null}
      {(history.length || library.length) ? <SegmentedButtons value={sort} onValueChange={(value) => setSort(value as typeof sort)} buttons={[{ value: 'newest', label: 'Newest' }, { value: 'title', label: 'Title' }, { value: 'score', label: showsProgress ? 'Progress' : 'Score' }]} density="small" /> : null}
      {showsProgress ? progressItems.length ? (
        <FlatList data={progressItems} keyExtractor={(item) => item.key} contentContainerStyle={styles.list} ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />} renderItem={({ item }) => (
          <View style={styles.progressRow}>
            <Image source={item.image} style={styles.poster} contentFit="cover" cachePolicy="memory-disk" recyclingKey={`${item.key}-${item.image}`} />
            <View style={styles.progressCopy}>
              <Text variant="titleSmall" style={styles.semibold} numberOfLines={1}>{item.animeTitle}</Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>Episode {item.episode} · {Math.round(item.progressPercent)}%</Text>
              <ProgressBar progress={Math.max(0, Math.min(1, item.progressPercent / 100))} />
            </View>
            <Button compact mode="contained-tonal" icon="play" onPress={() => resume(item)}>{section === 'completed' ? 'Replay' : 'Resume'}</Button>
          </View>
        )} initialNumToRender={7} maxToRenderPerBatch={6} windowSize={5} removeClippedSubviews keyboardShouldPersistTaps="handled" />
      ) : <StateView title={query ? 'No matching progress' : section === 'completed' ? 'Nothing completed yet' : 'Nothing in progress'} message={query ? 'Try another title.' : section === 'completed' ? 'Finished episodes appear here automatically.' : 'Start an episode and it will be ready to resume here.'} /> : mediaItems.length ? (
        <FlatList data={mediaItems} numColumns={columns} key={columns} keyExtractor={(item) => item.animeId} renderItem={({ item }) => <AnimeCard anime={item.anime} width={cardWidth} onPress={() => navigation.navigate('Watch', watchRouteParams(item.anime))} />} columnWrapperStyle={styles.row} contentContainerStyle={styles.grid} initialNumToRender={columns * 2} maxToRenderPerBatch={columns * 2} updateCellsBatchingPeriod={40} windowSize={5} removeClippedSubviews keyboardShouldPersistTaps="handled" />
      ) : <StateView title={query ? 'No matching anime' : `No ${section} anime`} message={query ? 'Try another title.' : `Titles you ${section === 'saved' ? 'bookmark' : 'like'} appear here and sync after sign-in.`} />}
      {total > 0 ? <Text variant="labelSmall" style={[styles.count, { color: theme.colors.onSurfaceVariant }]}>{total} {total === 1 ? 'item' : 'items'} in this view</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sections: { gap: tokens.spacing.sm, paddingRight: tokens.spacing.lg },
  search: { borderRadius: tokens.radius.control },
  list: { paddingBottom: tokens.spacing.xxl },
  grid: { paddingBottom: tokens.spacing.xxl, gap: tokens.spacing.lg },
  row: { gap: tokens.spacing.md },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.md },
  poster: { width: 48, height: 68, borderRadius: tokens.radius.control },
  progressCopy: { flex: 1, gap: tokens.spacing.xs },
  divider: { height: StyleSheet.hairlineWidth },
  semibold: { fontWeight: '600' },
  count: { textAlign: 'center' },
});
