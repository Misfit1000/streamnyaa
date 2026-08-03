import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Button, Chip, Divider, Modal, Portal, Searchbar, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AnimeCard } from '../components/AnimeCard';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { fetchGenres, searchMedia, type AnimeSearchFilters } from '../services/anilist';
import { animeRouteParams, mangaRouteParams } from '../lib/mediaNavigation';
import { useAppStore } from '../store/useAppStore';
import type { Anime, MainTabParamList, RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = CompositeScreenProps<BottomTabScreenProps<MainTabParamList, 'Explore'>, NativeStackScreenProps<RootStackParamList>>;
type SortMode = NonNullable<AnimeSearchFilters['sort']>;
type EpisodeRange = '' | 'short' | 'standard' | 'long';

const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: 'TRENDING_DESC', label: 'Trending' },
  { value: 'POPULARITY_DESC', label: 'Popular' },
  { value: 'SCORE_DESC', label: 'Top rated' },
  { value: 'START_DATE_DESC', label: 'Newest' },
];

function uniqueMedia(items: Anime[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.metadataProvider || 'unknown'}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchesLocalFilters(item: Anime, minimumScore: number, episodeRange: EpisodeRange) {
  if (minimumScore && Number(item.score || 0) < minimumScore) return false;
  const episodes = Number(item.episodes || 0);
  if (episodeRange === 'short' && episodes > 12) return false;
  if (episodeRange === 'standard' && (episodes < 13 || episodes > 24)) return false;
  if (episodeRange === 'long' && episodes < 25) return false;
  return true;
}

export function ExploreScreen({ navigation }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [text, setText] = useState('');
  const [queryText, setQueryText] = useState('');
  const [sort, setSort] = useState<SortMode>('TRENDING_DESC');
  const [genre, setGenre] = useState('');
  const [mediaType, setMediaType] = useState<'ANIME' | 'MANGA'>('ANIME');
  const [format, setFormat] = useState('');
  const [status, setStatus] = useState('');
  const [season, setSeason] = useState('');
  const [year, setYear] = useState<number | undefined>();
  const [minimumScore, setMinimumScore] = useState(0);
  const [episodeRange, setEpisodeRange] = useState<EpisodeRange>('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const includeAdult = useAppStore((state) => state.nsfwMode);
  const recentSearches = useAppStore((state) => state.recentExploreSearches);
  const addRecentSearch = useAppStore((state) => state.addRecentExploreSearch);
  const columns = width >= 720 ? 5 : width >= 520 ? 4 : width >= 380 ? 3 : 2;
  const cardWidth = Math.floor((width - tokens.spacing.lg * 2 - (columns - 1) * tokens.spacing.md) / columns);
  const genres = useQuery({ queryKey: ['genres'], queryFn: ({ signal }) => fetchGenres(signal), staleTime: 24 * 60 * 60 * 1000 });
  const results = useInfiniteQuery({
    queryKey: ['explore', mediaType, queryText, genre, format, status, season, year, sort, includeAdult],
    queryFn: ({ pageParam, signal }) => searchMedia({ query: queryText, genre, format, status, season, year, sort, includeAdult, mediaType, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.currentPage + 1 : undefined,
    staleTime: 10 * 60 * 1000,
  });
  const allItems = useMemo(() => uniqueMedia((results.data?.pages || []).flatMap((page) => page.items)), [results.data?.pages]);
  const items = useMemo(() => allItems.filter((item) => matchesLocalFilters(item, minimumScore, episodeRange)), [allItems, episodeRange, minimumScore]);
  const providerNames = useMemo(() => [...new Set((results.data?.pages || []).map((page) => page.provider))].join(' + '), [results.data?.pages]);
  const activeFilterCount = [genre, format, status, season, year, minimumScore, episodeRange].filter(Boolean).length;
  const years = useMemo(() => Array.from({ length: 12 }, (_, index) => String(new Date().getFullYear() - index)), []);
  const submit = (value = text) => {
    const next = value.trim();
    setText(next);
    setQueryText(next);
    if (next) addRecentSearch(next);
  };
  const resetFilters = () => {
    setGenre(''); setFormat(''); setStatus(''); setSeason(''); setYear(undefined); setMinimumScore(0); setEpisodeRange('');
  };

  return (
    <>
      <Screen
        title="Explore"
        subtitle="Search anime and manga with precise discovery controls"
        scroll={false}
        action={<Button compact mode={activeFilterCount ? 'contained-tonal' : 'text'} icon="tune-variant" onPress={() => setFiltersOpen(true)}>Filters{activeFilterCount ? ` ${activeFilterCount}` : ''}</Button>}
      >
        <Searchbar value={text} onChangeText={setText} onSubmitEditing={() => submit()} onClearIconPress={() => { setText(''); setQueryText(''); }} placeholder={mediaType === 'ANIME' ? 'Search anime' : 'Search manga'} style={[styles.search, { backgroundColor: tokens.color.glass, borderColor: theme.colors.outlineVariant }]} inputStyle={styles.searchInput} />
        <SegmentedButtons value={mediaType} onValueChange={(value) => { setMediaType(value as typeof mediaType); setFormat(''); setSeason(''); setEpisodeRange(''); }} buttons={[{ value: 'ANIME', label: 'Anime', icon: 'television-play' }, { value: 'MANGA', label: 'Manga', icon: 'book-open-page-variant-outline' }]} density="small" />
        {!queryText && recentSearches.length ? <View style={styles.recent}><Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Recent</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>{recentSearches.map((item) => <Chip key={item} compact icon="history" onPress={() => submit(item)}>{item}</Chip>)}</ScrollView></View> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>{sortOptions.map((item) => <Chip key={item.value} compact selected={sort === item.value} mode="outlined" onPress={() => setSort(item.value)}>{item.label}</Chip>)}</ScrollView>
        {results.data ? <View style={styles.resultMeta}><Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{items.length}{items.length !== allItems.length ? ` of ${allItems.length}` : ''} loaded · {providerNames} metadata</Text>{activeFilterCount ? <Button compact onPress={resetFilters}>Reset</Button> : null}</View> : null}
        {results.isLoading ? <StateView loading message="Searching the catalog..." /> : results.isError ? <StateView title="Search unavailable" message={results.error.message} onRetry={() => void results.refetch()} /> : items.length ? (
          <FlatList
            data={items}
            numColumns={columns}
            key={`${mediaType}-${columns}`}
            keyExtractor={(item) => `${item.metadataProvider}-${item.id}`}
            renderItem={({ item }) => <AnimeCard anime={item} width={cardWidth} onPress={() => item.mediaType === 'MANGA' ? navigation.navigate('Manga', mangaRouteParams(item)) : navigation.navigate('Anime', animeRouteParams(item))} />}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.results}
            showsVerticalScrollIndicator={false}
            initialNumToRender={columns * 2}
            maxToRenderPerBatch={columns * 2}
            updateCellsBatchingPeriod={40}
            windowSize={5}
            removeClippedSubviews
            keyboardShouldPersistTaps="handled"
            onEndReached={() => { if (results.hasNextPage && !results.isFetchingNextPage) void results.fetchNextPage(); }}
            onEndReachedThreshold={0.65}
            ListFooterComponent={results.isFetchingNextPage ? <ActivityIndicator color={theme.colors.primary} style={styles.footer} /> : results.hasNextPage ? <Button mode="text" onPress={() => void results.fetchNextPage()}>Load more</Button> : <Text variant="labelSmall" style={[styles.end, { color: theme.colors.onSurfaceVariant }]}>End of results</Text>}
          />
        ) : <StateView title={`No ${mediaType === 'ANIME' ? 'anime' : 'manga'} found`} message={allItems.length ? 'The loaded results do not match every filter. Reset filters or load another catalog.' : 'Try another title or clear a filter.'} onRetry={results.hasNextPage ? () => void results.fetchNextPage() : undefined} />}
      </Screen>

      <Portal>
        <Modal visible={filtersOpen} onDismiss={() => setFiltersOpen(false)} contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.modalHeader}><View><Text variant="titleLarge" style={styles.semibold}>Refine results</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>Filters apply immediately</Text></View><Button compact onPress={resetFilters}>Reset</Button></View>
          <Divider />
          <ScrollView contentContainerStyle={styles.filterContent} showsVerticalScrollIndicator={false}>
            <FilterChoices title="Genre" value={genre} options={['', ...(genres.data || []).slice(0, 24)]} labelFor={(value) => value || 'Any'} onChange={setGenre} />
            <FilterChoices title="Format" value={format} options={mediaType === 'ANIME' ? ['', 'TV', 'MOVIE', 'OVA', 'ONA', 'TV_SHORT'] : ['', 'MANGA', 'NOVEL', 'ONE_SHOT']} labelFor={(value) => value ? value.replaceAll('_', ' ') : 'Any'} onChange={setFormat} />
            <FilterChoices title="Status" value={status} options={['', 'RELEASING', 'FINISHED', 'NOT_YET_RELEASED']} labelFor={(value) => value ? value.replaceAll('_', ' ') : 'Any'} onChange={setStatus} />
            {mediaType === 'ANIME' ? <FilterChoices title="Season" value={season} options={['', 'WINTER', 'SPRING', 'SUMMER', 'FALL']} labelFor={(value) => value ? value[0] + value.slice(1).toLowerCase() : 'Any'} onChange={setSeason} /> : null}
            <FilterChoices title="Year" value={year ? String(year) : ''} options={['', ...years]} labelFor={(value) => value || 'Any'} onChange={(value) => setYear(value ? Number(value) : undefined)} />
            <FilterChoices title="Minimum score" value={String(minimumScore)} options={['0', '8', '8.5', '9']} labelFor={(value) => value === '0' ? 'Any' : `${value}+`} onChange={(value) => setMinimumScore(Number(value))} />
            {mediaType === 'ANIME' ? <FilterChoices title="Episode count" value={episodeRange} options={['', 'short', 'standard', 'long']} labelFor={(value) => value === 'short' ? '1–12' : value === 'standard' ? '13–24' : value === 'long' ? '25+' : 'Any'} onChange={(value) => setEpisodeRange(value as EpisodeRange)} /> : null}
          </ScrollView>
          <Button mode="contained" onPress={() => setFiltersOpen(false)} contentStyle={styles.done}>Show {items.length || 'matching'} results</Button>
        </Modal>
      </Portal>
    </>
  );
}

function FilterChoices({ title, value, options, labelFor, onChange }: { title: string; value: string; options: string[]; labelFor: (value: string) => string; onChange: (value: string) => void }) {
  return <View style={styles.filterSection}><Text variant="labelLarge" style={styles.semibold}>{title}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>{options.map((option) => <Chip key={option || 'any'} selected={value === option} mode="outlined" onPress={() => onChange(option)}>{labelFor(option)}</Chip>)}</ScrollView></View>;
}

const styles = StyleSheet.create({
  search: { borderRadius: tokens.radius.control, borderWidth: StyleSheet.hairlineWidth },
  searchInput: { minHeight: 48 },
  recent: { gap: tokens.spacing.sm },
  choiceRow: { gap: tokens.spacing.sm, paddingRight: tokens.spacing.lg },
  resultMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 30 },
  results: { paddingBottom: tokens.spacing.xxl, gap: tokens.spacing.xl },
  row: { gap: tokens.spacing.md },
  footer: { padding: tokens.spacing.xl },
  end: { textAlign: 'center', padding: tokens.spacing.xl },
  modal: { margin: tokens.spacing.lg, borderRadius: tokens.radius.card, padding: tokens.spacing.lg, maxHeight: '84%', gap: tokens.spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filterContent: { gap: tokens.spacing.xl, paddingVertical: tokens.spacing.sm },
  filterSection: { gap: tokens.spacing.sm },
  done: { minHeight: 48 },
  semibold: { fontWeight: '600' },
});
