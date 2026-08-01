import { FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SegmentedButtons } from 'react-native-paper';
import { AnimeCard } from '../components/AnimeCard';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { searchAnime } from '../services/anilist';
import { useAppStore } from '../store/useAppStore';
import type { RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Catalog'>;

export function CatalogScreen({ route, navigation }: Props) {
  const { width } = useWindowDimensions();
  const [sort, setSort] = useState(route.params.sort || 'POPULARITY_DESC');
  const includeAdult = useAppStore((state) => state.nsfwMode);
  const columns = width >= 720 ? 5 : width >= 520 ? 4 : 3;
  const cardWidth = Math.floor((width - 32 - (columns - 1) * 12) / columns);
  const query = useQuery({
    queryKey: ['catalog', route.params.genre, route.params.season, route.params.year, sort, includeAdult],
    queryFn: ({ signal }) => searchAnime({
      genre: route.params.genre,
      season: route.params.season,
      year: route.params.year,
      sort,
      includeAdult,
    }, signal),
  });

  return (
    <Screen title={route.params.title} subtitle="The same AniList catalog used by StreamNyaa Desktop" scroll={false}>
      <SegmentedButtons
        value={sort}
        onValueChange={(value) => setSort(value as typeof sort)}
        buttons={[
          { value: 'POPULARITY_DESC', label: 'Popular' },
          { value: 'TRENDING_DESC', label: 'Trending' },
          { value: 'SCORE_DESC', label: 'Top rated' },
        ]}
        density="small"
      />
      {query.isLoading ? <StateView loading message="Loading catalog…" /> : query.isError ? <StateView title="Catalog unavailable" message={query.error.message} onRetry={() => void query.refetch()} /> : query.data?.items.length ? (
        <FlatList
          data={query.data.items}
          numColumns={columns}
          key={columns}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <AnimeCard anime={item} width={cardWidth} onPress={() => navigation.navigate('Anime', { animeId: item.id, title: item.title })} />}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          initialNumToRender={columns * 3}
          maxToRenderPerBatch={columns * 2}
          windowSize={5}
          removeClippedSubviews
        />
      ) : <StateView title="No titles found" message="Try another catalog or content setting." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: tokens.spacing.xxl, gap: tokens.spacing.lg },
  row: { gap: tokens.spacing.md },
});
