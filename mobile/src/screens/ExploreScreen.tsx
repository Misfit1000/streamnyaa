import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Chip, Searchbar, SegmentedButtons, Text } from 'react-native-paper';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AnimeCard } from '../components/AnimeCard';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { fetchGenres, searchAnime } from '../services/anilist';
import { useAppStore } from '../store/useAppStore';
import type { MainTabParamList, RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = CompositeScreenProps<BottomTabScreenProps<MainTabParamList, 'Explore'>, NativeStackScreenProps<RootStackParamList>>;

export function ExploreScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const [text, setText] = useState('');
  const [queryText, setQueryText] = useState('');
  const [sort, setSort] = useState<'TRENDING_DESC' | 'POPULARITY_DESC' | 'SCORE_DESC'>('TRENDING_DESC');
  const [genre, setGenre] = useState('');
  const includeAdult = useAppStore((state) => state.nsfwMode);
  const columns = width >= 720 ? 5 : width >= 520 ? 4 : 3;
  const cardWidth = Math.floor((width - 32 - (columns - 1) * 12) / columns);
  const genres = useQuery({ queryKey: ['genres'], queryFn: fetchGenres, staleTime: 24 * 60 * 60 * 1000 });
  const results = useQuery({
    queryKey: ['explore', queryText, genre, sort, includeAdult],
    queryFn: () => searchAnime({ query: queryText, genre, sort, includeAdult }),
  });
  const filters = useMemo(() => (genres.data || []).slice(0, 12), [genres.data]);

  return (
    <Screen title="Explore" subtitle="Search titles or browse by mood" scroll={false}>
      <Searchbar value={text} onChangeText={setText} onSubmitEditing={() => setQueryText(text.trim())} placeholder="Search anime" style={styles.search} />
      <SegmentedButtons value={sort} onValueChange={(value) => setSort(value as typeof sort)} buttons={[{ value: 'TRENDING_DESC', label: 'Trending' }, { value: 'POPULARITY_DESC', label: 'Popular' }, { value: 'SCORE_DESC', label: 'Top rated' }]} density="small" />
      <FlatList horizontal data={filters} keyExtractor={(item) => item} renderItem={({ item }) => <Chip selected={genre === item} onPress={() => setGenre(genre === item ? '' : item)} compact>{item}</Chip>} ItemSeparatorComponent={() => <View style={{ width: 8 }} />} showsHorizontalScrollIndicator={false} style={styles.chips} />
      {results.isLoading ? <StateView loading message="Searching AniList…" /> : results.isError ? <StateView title="Search unavailable" message={results.error.message} onRetry={() => void results.refetch()} /> : results.data?.items.length ? (
        <FlatList data={results.data.items} numColumns={columns} key={columns} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <AnimeCard anime={item} width={cardWidth} onPress={() => navigation.navigate('Anime', { animeId: item.id, title: item.title })} />} columnWrapperStyle={styles.row} contentContainerStyle={styles.results} showsVerticalScrollIndicator={false} />
      ) : <StateView title="No anime found" message="Try another title or remove a filter." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { borderRadius: tokens.radius.control },
  chips: { flexGrow: 0 },
  results: { paddingBottom: tokens.spacing.xxl, gap: tokens.spacing.lg },
  row: { gap: tokens.spacing.md },
});
