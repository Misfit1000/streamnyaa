import { FlatList, Share, StyleSheet, View } from 'react-native';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Chip, Menu, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { SourceRow } from '../components/SourceRow';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { searchSources, sourceQuery } from '../services/sources';
import { useAppStore } from '../store/useAppStore';
import type { RootStackParamList } from '../types';
import { parseSizeBytes, sourceQualityBucket, sourceQualityLabel, sourceQualityScore } from '../../../shared/sources';
import { tokens } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Downloads'>;

export function DownloadsScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const anime = route.params.anime;
  const [episode, setEpisode] = useState(route.params.episode || 1);
  const [quality, setQuality] = useState('auto');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'trusted' | 'no-remakes'>('all');
  const [sort, setSort] = useState<'best' | 'seeders' | 'size'>('best');
  const [sortMenu, setSortMenu] = useState(false);
  const audio = useAppStore((state) => state.audioPreference);
  const setAudio = useAppStore((state) => state.setAudioPreference);
  const queryText = useMemo(() => sourceQuery(anime.title, episode, audio), [anime.title, audio, episode]);
  const query = useQuery({ queryKey: ['downloads', queryText], queryFn: ({ signal }) => searchSources(queryText, { signal }) });
  const rows = useMemo(() => (query.data || [])
    .filter((source) => quality === 'auto' || sourceQualityBucket(source.title) === quality)
    .filter((source) => sourceFilter === 'all' || (sourceFilter === 'trusted' ? source.trusted : !source.remake))
    .sort((left, right) => sort === 'seeders'
      ? right.seeders - left.seeders
      : sort === 'size'
        ? parseSizeBytes(left.size) - parseSizeBytes(right.size)
        : Number(right.sourceScore || 0) - Number(left.sourceScore || 0)), [quality, query.data, sort, sourceFilter]);
  const totalSeeders = useMemo(() => rows.reduce((sum, source) => sum + source.seeders, 0), [rows]);
  const bestScore = rows.length ? sourceQualityScore(rows[0]!) : 0;
  const maxEpisode = Number(anime.episodes || 0);

  return (
    <Screen title={`${anime.title} releases`} subtitle="Ranked Android streaming sources with release controls" scroll={false} safeTop={false}>
      <FlatList
        data={rows}
        keyExtractor={(source) => `${source.infoHash}-${source.title}`}
        renderItem={({ item }) => <SourceRow source={item} onPlay={() => navigation.navigate('Watch', { anime, episode, source: item })} onShare={() => void Share.share({ message: item.magnet })} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={<View style={styles.controls}>
          <View style={styles.episodeRow}>
            <Button mode="outlined" disabled={episode <= 1} onPress={() => setEpisode((value) => Math.max(1, value - 1))}>Previous</Button>
            <View style={styles.episodeCopy}><Text variant="titleMedium" style={styles.semibold}>Episode {episode}</Text>{maxEpisode ? <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>of {maxEpisode}</Text> : null}</View>
            <Button mode="outlined" disabled={Boolean(maxEpisode && episode >= maxEpisode)} onPress={() => setEpisode((value) => value + 1)}>Next</Button>
          </View>
          <SegmentedButtons value={audio} onValueChange={(value) => setAudio(value as typeof audio)} buttons={[{ value: 'sub-preferred', label: 'Sub' }, { value: 'dual-preferred', label: 'Dual' }, { value: 'dub-only', label: 'Dub' }]} density="small" />
          <SegmentedButtons value={quality} onValueChange={setQuality} buttons={[{ value: 'auto', label: 'Best' }, { value: '1080p', label: '1080p' }, { value: '720p', label: '720p' }, { value: '2160p', label: '4K' }]} density="small" />
          <View style={styles.sourceTools}>
            <Chip selected={sourceFilter === 'trusted'} mode="outlined" icon="check-decagram-outline" onPress={() => setSourceFilter(sourceFilter === 'trusted' ? 'all' : 'trusted')}>Trusted</Chip>
            <Chip selected={sourceFilter === 'no-remakes'} mode="outlined" icon="shield-check-outline" onPress={() => setSourceFilter(sourceFilter === 'no-remakes' ? 'all' : 'no-remakes')}>No remakes</Chip>
            <Menu visible={sortMenu} onDismiss={() => setSortMenu(false)} anchor={<Button compact mode="text" icon="sort" onPress={() => setSortMenu(true)}>{sort === 'best' ? 'Best match' : sort === 'seeders' ? 'Seeders' : 'Smallest'}</Button>}>
              {([['best', 'Best match'], ['seeders', 'Most seeders'], ['size', 'Smallest size']] as const).map(([value, label]) => <Menu.Item key={value} title={label} leadingIcon={sort === value ? 'check' : undefined} onPress={() => { setSort(value); setSortMenu(false); }} />)}
            </Menu>
          </View>
          {query.data ? <View style={[styles.summary, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Summary value={String(rows.length)} label="Sources" />
            <Summary value={String(totalSeeders)} label="Seeders" />
            <Summary value={bestScore ? sourceQualityLabel(bestScore) : 'None'} label="Best health" />
          </View> : null}
        </View>}
        ListEmptyComponent={query.isLoading ? <StateView loading message="Finding matching releases..." /> : query.isError ? <StateView title="Releases unavailable" message={query.error.message} onRetry={() => void query.refetch()} /> : <StateView title="No matching release" message="Try Best quality, All sources, or another episode." />}
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

function Summary({ value, label }: { value: string; label: string }) {
  const theme = useTheme();
  return <View style={styles.summaryItem}><Text variant="titleSmall" style={styles.semibold} numberOfLines={1}>{value}</Text><Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  episodeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.sm },
  episodeCopy: { alignItems: 'center' },
  controls: { gap: tokens.spacing.md, paddingBottom: tokens.spacing.lg },
  sourceTools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacing.sm },
  summary: { flexDirection: 'row', paddingVertical: tokens.spacing.md, borderRadius: tokens.radius.card },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: tokens.spacing.xs },
  list: { paddingBottom: tokens.spacing.xxl },
  separator: { height: tokens.spacing.md },
  semibold: { fontWeight: '600' },
});
