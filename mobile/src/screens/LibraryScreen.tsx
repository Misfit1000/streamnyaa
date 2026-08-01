import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Searchbar, SegmentedButtons } from 'react-native-paper';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AnimeCard } from '../components/AnimeCard';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { useAppStore } from '../store/useAppStore';
import type { MainTabParamList, RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = CompositeScreenProps<BottomTabScreenProps<MainTabParamList, 'Library'>, NativeStackScreenProps<RootStackParamList>>;

export function LibraryScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const library = useAppStore((state) => state.library);
  const [section, setSection] = useState<'saved' | 'liked'>('saved');
  const [query, setQuery] = useState('');
  const columns = width >= 720 ? 5 : width >= 520 ? 4 : 3;
  const cardWidth = Math.floor((width - 32 - (columns - 1) * 12) / columns);
  const items = useMemo(() => library.filter((item) => (section === 'saved' ? item.bookmarked : item.liked) && item.animeTitle.toLowerCase().includes(query.trim().toLowerCase())), [library, query, section]);

  return (
    <Screen title="Library" subtitle="Saved anime sync with your StreamNyaa account" scroll={false}>
      <SegmentedButtons value={section} onValueChange={(value) => setSection(value as typeof section)} buttons={[{ value: 'saved', label: `Saved (${library.filter((item) => item.bookmarked).length})` }, { value: 'liked', label: `Liked (${library.filter((item) => item.liked).length})` }]} />
      {library.length ? <Searchbar value={query} onChangeText={setQuery} placeholder="Search library" style={styles.search} /> : null}
      {items.length ? <FlatList data={items} numColumns={columns} key={columns} keyExtractor={(item) => item.animeId} renderItem={({ item }) => <AnimeCard anime={item.anime} width={cardWidth} onPress={() => navigation.navigate('Anime', { animeId: item.anime.id, title: item.anime.title })} />} columnWrapperStyle={styles.row} contentContainerStyle={styles.list} /> : <StateView title={query ? 'No matching anime' : 'Your library is empty'} message={query ? 'Try another title.' : 'Save or like an anime and it will appear here on every signed-in device.'} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { borderRadius: tokens.radius.control },
  list: { paddingBottom: tokens.spacing.xxl, gap: tokens.spacing.lg },
  row: { gap: tokens.spacing.md },
});
