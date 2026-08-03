import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Searchbar, SegmentedButtons } from 'react-native-paper';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AnimeCard } from '../components/AnimeCard';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { useAppStore } from '../store/useAppStore';
import { animeRouteParams } from '../lib/mediaNavigation';
import type { MainTabParamList, RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = CompositeScreenProps<BottomTabScreenProps<MainTabParamList, 'Library'>, NativeStackScreenProps<RootStackParamList>>;

export function LibraryScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const library = useAppStore((state) => state.library);
  const [section, setSection] = useState<'saved' | 'liked'>('saved');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<'newest' | 'title' | 'score'>('newest');
  const columns = width >= 720 ? 5 : width >= 520 ? 4 : width >= 380 ? 3 : 2;
  const cardWidth = Math.floor((width - 32 - (columns - 1) * 12) / columns);
  const counts = useMemo(() => {
    let saved = 0; let liked = 0;
    library.forEach((item) => { if (item.bookmarked) saved += 1; if (item.liked) liked += 1; });
    return { saved, liked };
  }, [library]);
  const items = useMemo(() => library
    .filter((item) => (section === 'saved' ? item.bookmarked : item.liked) && item.animeTitle.toLowerCase().includes(deferredQuery.trim().toLowerCase()))
    .sort((left, right) => sort === 'title'
      ? left.animeTitle.localeCompare(right.animeTitle)
      : sort === 'score'
        ? Number(right.anime.score || 0) - Number(left.anime.score || 0)
        : Date.parse(right.updatedAt) - Date.parse(left.updatedAt)), [deferredQuery, library, section, sort]);

  return (
    <Screen title="Library" subtitle="Saved anime sync with your StreamNyaa account" scroll={false}>
      <SegmentedButtons value={section} onValueChange={(value) => setSection(value as typeof section)} buttons={[{ value: 'saved', label: `Saved (${counts.saved})` }, { value: 'liked', label: `Liked (${counts.liked})` }]} />
      {library.length ? <Searchbar value={query} onChangeText={setQuery} placeholder="Search library" style={styles.search} /> : null}
      {library.length ? <SegmentedButtons value={sort} onValueChange={(value) => setSort(value as typeof sort)} buttons={[{ value: 'newest', label: 'Newest' }, { value: 'title', label: 'Title' }, { value: 'score', label: 'Score' }]} density="small" /> : null}
      {items.length ? <FlatList data={items} numColumns={columns} key={columns} keyExtractor={(item) => item.animeId} renderItem={({ item }) => <AnimeCard anime={item.anime} width={cardWidth} onPress={() => navigation.navigate('Anime', animeRouteParams(item.anime))} />} columnWrapperStyle={styles.row} contentContainerStyle={styles.list} initialNumToRender={columns * 2} maxToRenderPerBatch={columns * 2} updateCellsBatchingPeriod={40} windowSize={5} removeClippedSubviews keyboardShouldPersistTaps="handled" /> : <StateView title={query ? 'No matching anime' : 'Your library is empty'} message={query ? 'Try another title.' : 'Save or like an anime and it will appear here on every signed-in device.'} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { borderRadius: tokens.radius.control },
  list: { paddingBottom: tokens.spacing.xxl, gap: tokens.spacing.lg },
  row: { gap: tokens.spacing.md },
});
