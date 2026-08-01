import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Button, Chip, Menu, Searchbar, SegmentedButtons } from 'react-native-paper';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AnimeCard } from '../components/AnimeCard';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { fetchGenres, searchMedia } from '../services/anilist';
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
  const [mediaType, setMediaType] = useState<'ANIME' | 'MANGA'>('ANIME');
  const [format, setFormat] = useState('');
  const [status, setStatus] = useState('');
  const [formatMenu, setFormatMenu] = useState(false);
  const [statusMenu, setStatusMenu] = useState(false);
  const includeAdult = useAppStore((state) => state.nsfwMode);
  const columns = width >= 720 ? 5 : width >= 520 ? 4 : 3;
  const cardWidth = Math.floor((width - 32 - (columns - 1) * 12) / columns);
  const genres = useQuery({ queryKey: ['genres'], queryFn: fetchGenres, staleTime: 24 * 60 * 60 * 1000 });
  const results = useQuery({
    queryKey: ['explore', mediaType, queryText, genre, format, status, sort, includeAdult],
    queryFn: () => searchMedia({ query: queryText, genre, format, status, sort, includeAdult, mediaType }),
  });
  const filters = useMemo(() => (genres.data || []).slice(0, 12), [genres.data]);

  return (
    <Screen title="Explore" subtitle="Search titles or browse by mood" scroll={false}>
      <Searchbar value={text} onChangeText={setText} onSubmitEditing={() => setQueryText(text.trim())} placeholder={mediaType === 'ANIME' ? 'Search anime' : 'Search manga'} style={styles.search} />
      <SegmentedButtons value={mediaType} onValueChange={(value) => setMediaType(value as typeof mediaType)} buttons={[{ value: 'ANIME', label: 'Anime' }, { value: 'MANGA', label: 'Manga' }]} density="small" />
      <SegmentedButtons value={sort} onValueChange={(value) => setSort(value as typeof sort)} buttons={[{ value: 'TRENDING_DESC', label: 'Trending' }, { value: 'POPULARITY_DESC', label: 'Popular' }, { value: 'SCORE_DESC', label: 'Top rated' }]} density="small" />
      <View style={styles.filterRow}>
        <Menu visible={formatMenu} onDismiss={() => setFormatMenu(false)} anchor={<Button compact mode="outlined" icon="movie-filter-outline" onPress={() => setFormatMenu(true)}>{format ? format.replaceAll('_', ' ') : 'Format'}</Button>}>
          <Menu.Item title="Any format" onPress={() => { setFormat(''); setFormatMenu(false); }} />
          {(mediaType === 'ANIME' ? ['TV', 'MOVIE', 'OVA', 'ONA', 'TV_SHORT'] : ['MANGA', 'NOVEL', 'ONE_SHOT']).map((value) => <Menu.Item key={value} title={value.replaceAll('_', ' ')} onPress={() => { setFormat(value); setFormatMenu(false); }} />)}
        </Menu>
        <Menu visible={statusMenu} onDismiss={() => setStatusMenu(false)} anchor={<Button compact mode="outlined" icon="progress-clock" onPress={() => setStatusMenu(true)}>{status ? status.replaceAll('_', ' ') : 'Status'}</Button>}>
          <Menu.Item title="Any status" onPress={() => { setStatus(''); setStatusMenu(false); }} />
          {['RELEASING', 'FINISHED', 'NOT_YET_RELEASED'].map((value) => <Menu.Item key={value} title={value.replaceAll('_', ' ')} onPress={() => { setStatus(value); setStatusMenu(false); }} />)}
        </Menu>
        {format || status || genre ? <Button compact onPress={() => { setFormat(''); setStatus(''); setGenre(''); }}>Reset</Button> : null}
      </View>
      <FlatList horizontal data={filters} keyExtractor={(item) => item} renderItem={({ item }) => <Chip selected={genre === item} onPress={() => setGenre(genre === item ? '' : item)} compact>{item}</Chip>} ItemSeparatorComponent={() => <View style={{ width: 8 }} />} showsHorizontalScrollIndicator={false} style={styles.chips} />
      {results.isLoading ? <StateView loading message="Searching AniList…" /> : results.isError ? <StateView title="Search unavailable" message={results.error.message} onRetry={() => void results.refetch()} /> : results.data?.items.length ? (
        <FlatList data={results.data.items} numColumns={columns} key={`${mediaType}-${columns}`} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <AnimeCard anime={item} width={cardWidth} onPress={() => item.mediaType === 'MANGA' ? navigation.navigate('Manga', { mangaId: item.id, title: item.title }) : navigation.navigate('Anime', { animeId: item.id, title: item.title })} />} columnWrapperStyle={styles.row} contentContainerStyle={styles.results} showsVerticalScrollIndicator={false} />
      ) : <StateView title={`No ${mediaType === 'ANIME' ? 'anime' : 'manga'} found`} message="Try another title or remove a filter." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { borderRadius: tokens.radius.control },
  chips: { flexGrow: 0 },
  filterRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: tokens.spacing.sm },
  results: { paddingBottom: tokens.spacing.xxl, gap: tokens.spacing.lg },
  row: { gap: tokens.spacing.md },
});
