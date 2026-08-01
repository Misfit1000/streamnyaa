import { Share, StyleSheet, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Chip, Searchbar, SegmentedButtons, Text } from 'react-native-paper';
import { Screen } from '../components/Screen';
import { SourceRow } from '../components/SourceRow';
import { StateView } from '../components/StateView';
import { searchSources, sourceQuery } from '../services/sources';
import { useAppStore } from '../store/useAppStore';
import type { Anime, RootStackParamList, TorrentSource } from '../types';
import { tokens } from '../theme';
import { parseSizeBytes, sourceQualityBucket } from '../../../shared/sources';

type Props = NativeStackScreenProps<RootStackParamList, 'Sources'>;

export function SourcesScreen({ route, navigation }: Props) {
  const anime = route.params.anime;
  const audio = useAppStore((state) => state.audioPreference);
  const setAudio = useAppStore((state) => state.setAudioPreference);
  const recentSearches = useAppStore((state) => state.recentSourceSearches);
  const addRecentSearch = useAppStore((state) => state.addRecentSourceSearch);
  const [episode, setEpisode] = useState(route.params.episode || 1);
  const initial = route.params.query || (anime ? sourceQuery(anime.title, episode, audio) : '');
  const [text, setText] = useState(initial);
  const [queryText, setQueryText] = useState(initial);
  const [filter, setFilter] = useState('0');
  const [quality, setQuality] = useState('auto');
  const [sort, setSort] = useState<'best' | 'seeders' | 'size'>('best');
  const query = useQuery({ queryKey: ['sources', queryText, filter], queryFn: () => searchSources(queryText, { filter }), enabled: Boolean(queryText.trim()) });
  const rows = useMemo(() => (query.data || [])
    .filter((source) => quality === 'auto' || sourceQualityBucket(source.title) === quality)
    .sort((left, right) => sort === 'seeders'
      ? right.seeders - left.seeders
      : sort === 'size'
        ? parseSizeBytes(left.size) - parseSizeBytes(right.size)
        : Number(right.sourceScore || 0) - Number(left.sourceScore || 0)), [quality, query.data, sort]);

  const submitSearch = (value = text) => {
    const normalized = value.trim();
    setText(normalized);
    setQueryText(normalized);
    if (normalized) addRecentSearch(normalized);
  };

  useEffect(() => {
    if (!anime) return;
    const value = sourceQuery(anime.title, episode, audio);
    setText(value);
    setQueryText(value);
  }, [anime, audio, episode]);

  const updateEpisode = (next: number) => {
    setEpisode(next);
    if (anime) { const value = sourceQuery(anime.title, next, audio); setText(value); setQueryText(value); }
  };

  const streamSource = (source: TorrentSource) => {
    const fallbackAnime: Anime = {
      id: -Number.parseInt((source.infoHash || '1').slice(0, 7), 16),
      title: text.trim() || source.title,
    };
    navigation.navigate('Watch', { anime: anime || fallbackAnime, episode, source });
  };

  return (
    <Screen title={anime ? `${anime.title} sources` : 'Source search'} subtitle="Ranked by match quality and torrent health">
      <Searchbar value={text} onChangeText={setText} onSubmitEditing={() => submitSearch()} placeholder="Anime title and episode" style={styles.search} />
      {!queryText && recentSearches.length ? <View style={styles.recent}>{recentSearches.map((item) => <Chip key={item} compact icon="history" onPress={() => submitSearch(item)}>{item}</Chip>)}</View> : null}
      {anime ? <View style={styles.episode}><Text variant="titleSmall" style={styles.semibold}>Episode {episode}</Text><View style={styles.episodeButtons}><Text onPress={() => updateEpisode(Math.max(1, episode - 1))} style={styles.step}>−</Text><Text onPress={() => updateEpisode(episode + 1)} style={styles.step}>+</Text></View></View> : null}
      <SegmentedButtons value={filter} onValueChange={setFilter} buttons={[{ value: '0', label: 'All' }, { value: '2', label: 'Trusted' }, { value: '1', label: 'No remakes' }]} density="small" />
      <SegmentedButtons value={audio} onValueChange={(value) => setAudio(value as typeof audio)} buttons={[{ value: 'sub-preferred', label: 'Sub' }, { value: 'dual-preferred', label: 'Dual' }, { value: 'dub-only', label: 'Dub' }]} density="small" />
      <SegmentedButtons value={quality} onValueChange={setQuality} buttons={[{ value: 'auto', label: 'Any quality' }, { value: '1080p', label: '1080p' }, { value: '720p', label: '720p' }]} density="small" />
      <SegmentedButtons value={sort} onValueChange={(value) => setSort(value as typeof sort)} buttons={[{ value: 'best', label: 'Best match' }, { value: 'seeders', label: 'Seeders' }, { value: 'size', label: 'Smallest' }]} density="small" />
      {!queryText ? <StateView title="Search for a source" message="Enter an anime title, episode, release group, or quality." /> : query.isLoading ? <StateView loading message="Searching source indexes…" /> : query.isError ? <StateView title="Sources unavailable" message={query.error.message} onRetry={() => void query.refetch()} /> : rows.length ? rows.map((source) => <SourceRow key={`${source.infoHash}-${source.title}`} source={source} onPlay={() => streamSource(source)} onShare={() => void Share.share({ message: source.magnet })} />) : <StateView title="No sources found" message="Try a broader title, another episode, or the All filter." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { borderRadius: tokens.radius.control },
  recent: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  episode: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  episodeButtons: { flexDirection: 'row', gap: tokens.spacing.sm },
  step: { width: 42, height: 38, textAlign: 'center', textAlignVertical: 'center', fontSize: 22 },
  semibold: { fontWeight: '600' },
});
