import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Button, Chip, Menu, Searchbar, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AnimeCard } from '../components/AnimeCard';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { fetchGenres, searchMedia } from '../services/anilist';
import { animeRouteParams, mangaRouteParams } from '../lib/mediaNavigation';
import { useAppStore } from '../store/useAppStore';
import type { MainTabParamList, RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = CompositeScreenProps<BottomTabScreenProps<MainTabParamList, 'Explore'>, NativeStackScreenProps<RootStackParamList>>;

export function ExploreScreen({ navigation }: Props) {
  const theme = useTheme();
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
  const columns = width >= 720 ? 5 : width >= 520 ? 4 : width >= 380 ? 3 : 2;
  const cardWidth = Math.floor((width - tokens.spacing.lg * 2 - (columns - 1) * tokens.spacing.md) / columns);
  const genres = useQuery({ queryKey: ['genres'], queryFn: ({ signal }) => fetchGenres(signal), staleTime: 24 * 60 * 60 * 1000 });
  const results = useQuery({
    queryKey: ['explore', mediaType, queryText, genre, format, status, sort, includeAdult],
    queryFn: ({ signal }) => searchMedia({ query: queryText, genre, format, status, sort, includeAdult, mediaType }, signal),
    staleTime: 10 * 60 * 1000,
  });
  const filters = useMemo(() => (genres.data || []).slice(0, 16), [genres.data]);
  const hasFilters = Boolean(format || status || genre);
  const submit = () => setQueryText(text.trim());

  return (
    <Screen title="Explore" subtitle="Search the catalog or browse by genre" scroll={false}>
      <Searchbar value={text} onChangeText={setText} onSubmitEditing={submit} onClearIconPress={() => { setText(''); setQueryText(''); }} placeholder={mediaType === 'ANIME' ? 'Search anime' : 'Search manga'} style={[styles.search, { backgroundColor: tokens.color.glass, borderColor: theme.colors.outlineVariant }]} inputStyle={styles.searchInput} />
      <SegmentedButtons value={mediaType} onValueChange={(value) => setMediaType(value as typeof mediaType)} buttons={[{ value: 'ANIME', label: 'Anime', icon: 'television-play' }, { value: 'MANGA', label: 'Manga', icon: 'book-open-page-variant-outline' }]} density="small" />
      <SegmentedButtons value={sort} onValueChange={(value) => setSort(value as typeof sort)} buttons={[{ value: 'TRENDING_DESC', label: 'Trending' }, { value: 'POPULARITY_DESC', label: 'Popular' }, { value: 'SCORE_DESC', label: 'Top rated' }]} density="small" />
      <View style={styles.filterRow}>
        <Menu visible={formatMenu} onDismiss={() => setFormatMenu(false)} anchor={<Button compact mode={format ? 'contained-tonal' : 'outlined'} icon="movie-filter-outline" onPress={() => setFormatMenu(true)}>{format ? format.replaceAll('_', ' ') : 'Format'}</Button>}>
          <Menu.Item title="Any format" onPress={() => { setFormat(''); setFormatMenu(false); }} />
          {(mediaType === 'ANIME' ? ['TV', 'MOVIE', 'OVA', 'ONA', 'TV_SHORT'] : ['MANGA', 'NOVEL', 'ONE_SHOT']).map((value) => <Menu.Item key={value} title={value.replaceAll('_', ' ')} onPress={() => { setFormat(value); setFormatMenu(false); }} />)}
        </Menu>
        <Menu visible={statusMenu} onDismiss={() => setStatusMenu(false)} anchor={<Button compact mode={status ? 'contained-tonal' : 'outlined'} icon="progress-clock" onPress={() => setStatusMenu(true)}>{status ? status.replaceAll('_', ' ') : 'Status'}</Button>}>
          <Menu.Item title="Any status" onPress={() => { setStatus(''); setStatusMenu(false); }} />
          {['RELEASING', 'FINISHED', 'NOT_YET_RELEASED'].map((value) => <Menu.Item key={value} title={value.replaceAll('_', ' ')} onPress={() => { setStatus(value); setStatusMenu(false); }} />)}
        </Menu>
        {hasFilters ? <Button compact icon="close" onPress={() => { setFormat(''); setStatus(''); setGenre(''); }}>Clear</Button> : null}
      </View>
      {filters.length ? <FlatList horizontal data={filters} keyExtractor={(item) => item} renderItem={({ item }) => <Chip selected={genre === item} onPress={() => setGenre(genre === item ? '' : item)} compact mode="outlined">{item}</Chip>} ItemSeparatorComponent={() => <View style={styles.chipGap} />} showsHorizontalScrollIndicator={false} style={styles.chips} /> : null}
      {results.data ? <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{results.data.items.length} results · {results.data.provider} metadata</Text> : null}
      {results.isLoading ? <StateView loading message="Searching the catalog…" /> : results.isError ? <StateView title="Search unavailable" message={results.error.message} onRetry={() => void results.refetch()} /> : results.data?.items.length ? (
        <FlatList data={results.data.items} numColumns={columns} key={`${mediaType}-${columns}`} keyExtractor={(item) => `${item.metadataProvider}-${item.id}`} renderItem={({ item }) => <AnimeCard anime={item} width={cardWidth} onPress={() => item.mediaType === 'MANGA' ? navigation.navigate('Manga', mangaRouteParams(item)) : navigation.navigate('Anime', animeRouteParams(item))} />} columnWrapperStyle={styles.row} contentContainerStyle={styles.results} showsVerticalScrollIndicator={false} initialNumToRender={columns * 2} maxToRenderPerBatch={columns * 2} updateCellsBatchingPeriod={40} windowSize={5} removeClippedSubviews keyboardShouldPersistTaps="handled" />
      ) : <StateView title={`No ${mediaType === 'ANIME' ? 'anime' : 'manga'} found`} message="Try another title or clear a filter." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { borderRadius: tokens.radius.control, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { minHeight: 48 },
  chips: { flexGrow: 0 },
  chipGap: { width: tokens.spacing.sm },
  filterRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: tokens.spacing.sm },
  results: { paddingBottom: tokens.spacing.xxl, gap: tokens.spacing.xl },
  row: { gap: tokens.spacing.md },
});
