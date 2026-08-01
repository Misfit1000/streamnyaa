import { Share, StyleSheet, View } from 'react-native';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, SegmentedButtons, Text } from 'react-native-paper';
import { SourceRow } from '../components/SourceRow';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { searchSources, sourceQuery } from '../services/sources';
import { useAppStore } from '../store/useAppStore';
import type { RootStackParamList } from '../types';
import { sourceQualityBucket } from '../../../shared/sources';
import { tokens } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Downloads'>;

export function DownloadsScreen({ route, navigation }: Props) {
  const anime = route.params.anime;
  const [episode, setEpisode] = useState(route.params.episode || 1);
  const [quality, setQuality] = useState('auto');
  const audio = useAppStore((state) => state.audioPreference);
  const queryText = useMemo(() => sourceQuery(anime.title, episode, audio), [anime.title, audio, episode]);
  const query = useQuery({ queryKey: ['downloads', queryText], queryFn: () => searchSources(queryText) });
  const rows = useMemo(() => (query.data || []).filter((source) => quality === 'auto' || sourceQualityBucket(source.title) === quality), [quality, query.data]);

  return (
    <Screen title={`${anime.title} releases`} subtitle="Stream in-app or share a magnet with another Android client">
      <View style={styles.episodeRow}>
        <Button mode="outlined" disabled={episode <= 1} onPress={() => setEpisode((value) => Math.max(1, value - 1))}>Previous</Button>
        <Text variant="titleMedium" style={styles.semibold}>Episode {episode}</Text>
        <Button mode="outlined" onPress={() => setEpisode((value) => value + 1)}>Next</Button>
      </View>
      <SegmentedButtons value={quality} onValueChange={setQuality} buttons={[{ value: 'auto', label: 'Best' }, { value: '1080p', label: '1080p' }, { value: '720p', label: '720p' }, { value: '2160p', label: '4K' }]} density="small" />
      {query.isLoading ? <StateView loading message="Finding matching releases…" /> : query.isError ? <StateView title="Releases unavailable" message={query.error.message} onRetry={() => void query.refetch()} /> : rows.length ? rows.map((source) => <SourceRow key={`${source.infoHash}-${source.title}`} source={source} onPlay={() => navigation.navigate('Watch', { anime, episode, source })} onShare={() => void Share.share({ message: source.magnet })} />) : <StateView title="No matching release" message="Try Best quality or another episode." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  episodeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.sm },
  semibold: { fontWeight: '600' },
});
