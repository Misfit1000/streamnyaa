import { FlatList, Share, StyleSheet, View } from 'react-native';
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
  const query = useQuery({ queryKey: ['downloads', queryText], queryFn: ({ signal }) => searchSources(queryText, { signal }) });
  const rows = useMemo(() => (query.data || []).filter((source) => quality === 'auto' || sourceQualityBucket(source.title) === quality), [quality, query.data]);

  return (
    <Screen title={`${anime.title} releases`} subtitle="Stream in-app or share a magnet with another Android client" scroll={false}>
      <FlatList
        data={rows}
        keyExtractor={(source) => `${source.infoHash}-${source.title}`}
        renderItem={({ item }) => <SourceRow source={item} onPlay={() => navigation.navigate('Watch', { anime, episode, source: item })} onShare={() => void Share.share({ message: item.magnet })} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={<View style={styles.controls}>
          <View style={styles.episodeRow}>
            <Button mode="outlined" disabled={episode <= 1} onPress={() => setEpisode((value) => Math.max(1, value - 1))}>Previous</Button>
            <Text variant="titleMedium" style={styles.semibold}>Episode {episode}</Text>
            <Button mode="outlined" onPress={() => setEpisode((value) => value + 1)}>Next</Button>
          </View>
          <SegmentedButtons value={quality} onValueChange={setQuality} buttons={[{ value: 'auto', label: 'Best' }, { value: '1080p', label: '1080p' }, { value: '720p', label: '720p' }, { value: '2160p', label: '4K' }]} density="small" />
        </View>}
        ListEmptyComponent={query.isLoading ? <StateView loading message="Finding matching releases…" /> : query.isError ? <StateView title="Releases unavailable" message={query.error.message} onRetry={() => void query.refetch()} /> : <StateView title="No matching release" message="Try Best quality or another episode." />}
        contentContainerStyle={styles.list}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  episodeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.sm },
  controls: { gap: tokens.spacing.md, paddingBottom: tokens.spacing.lg },
  list: { paddingBottom: tokens.spacing.xxl },
  separator: { height: tokens.spacing.md },
  semibold: { fontWeight: '600' },
});
