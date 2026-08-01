import { Share, StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Searchbar, SegmentedButtons, Text } from 'react-native-paper';
import { Screen } from '../components/Screen';
import { SourceRow } from '../components/SourceRow';
import { StateView } from '../components/StateView';
import { searchSources, sourceQuery } from '../services/sources';
import { useAppStore } from '../store/useAppStore';
import type { Anime, RootStackParamList, TorrentSource } from '../types';
import { tokens } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Sources'>;

export function SourcesScreen({ route, navigation }: Props) {
  const anime = route.params.anime;
  const audio = useAppStore((state) => state.audioPreference);
  const [episode, setEpisode] = useState(route.params.episode || 1);
  const initial = route.params.query || (anime ? sourceQuery(anime.title, episode, audio) : '');
  const [text, setText] = useState(initial);
  const [queryText, setQueryText] = useState(initial);
  const [filter, setFilter] = useState('0');
  const query = useQuery({ queryKey: ['sources', queryText, filter], queryFn: () => searchSources(queryText, { filter }), enabled: Boolean(queryText.trim()) });

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
      <Searchbar value={text} onChangeText={setText} onSubmitEditing={() => setQueryText(text.trim())} placeholder="Anime title and episode" style={styles.search} />
      {anime ? <View style={styles.episode}><Text variant="titleSmall" style={styles.semibold}>Episode {episode}</Text><View style={styles.episodeButtons}><Text onPress={() => updateEpisode(Math.max(1, episode - 1))} style={styles.step}>−</Text><Text onPress={() => updateEpisode(episode + 1)} style={styles.step}>+</Text></View></View> : null}
      <SegmentedButtons value={filter} onValueChange={setFilter} buttons={[{ value: '0', label: 'All' }, { value: '2', label: 'Trusted' }, { value: '1', label: 'No remakes' }]} density="small" />
      {!queryText ? <StateView title="Search for a source" message="Enter an anime title, episode, release group, or quality." /> : query.isLoading ? <StateView loading message="Searching source indexes…" /> : query.isError ? <StateView title="Sources unavailable" message={query.error.message} onRetry={() => void query.refetch()} /> : query.data?.length ? query.data.map((source) => <SourceRow key={`${source.infoHash}-${source.title}`} source={source} onPlay={() => streamSource(source)} onShare={() => void Share.share({ message: source.magnet })} />) : <StateView title="No sources found" message="Try a broader title, another episode, or the All filter." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { borderRadius: tokens.radius.control },
  episode: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  episodeButtons: { flexDirection: 'row', gap: tokens.spacing.sm },
  step: { width: 42, height: 38, textAlign: 'center', textAlignVertical: 'center', fontSize: 22 },
  semibold: { fontWeight: '600' },
});
