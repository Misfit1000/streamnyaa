import { FlatList, Share, StyleSheet, View } from 'react-native';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Chip, Menu, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { SourceRow } from '../components/SourceRow';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { searchAnimeSources } from '../services/sources';
import { useAppStore } from '../store/useAppStore';
import type { RootStackParamList } from '../types';
import { parseSizeBytes, sourceQualityBucket, sourceQualityLabel, sourceQualityScore } from '../../../shared/sources';
import { tokens } from '../theme';
import { compareMobileSources, compatibleMobileSources } from '../lib/mobileSourcePolicy';

type Props = NativeStackScreenProps<RootStackParamList, 'Downloads'>;

export function DownloadsScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const anime = route.params.anime;
  const [episode, setEpisode] = useState(route.params.episode || 1);
  const [quality, setQuality] = useState('auto');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'trusted' | 'no-remakes'>('all');
  const [sort, setSort] = useState<'best' | 'seeders' | 'size'>('best');
  const [sortMenu, setSortMenu] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const audio = useAppStore((state) => state.audioPreference);
  const setAudio = useAppStore((state) => state.setAudioPreference);
  const resourcePolicy = useAppStore((state) => state.resourcePolicy);
  const query = useQuery({
    queryKey: ['release-browser', anime.id, episode, audio],
    queryFn: ({ signal }) => searchAnimeSources(anime, episode, audio, { signal, timeoutMs: 8_000 }),
  });
  const rows = useMemo(() => compatibleMobileSources(query.data || [], {
    constrained: resourcePolicy.performanceProfile === 'constrained',
    anime,
    episode,
  })
    .filter((source) => quality === 'auto' || sourceQualityBucket(source.title) === quality)
    .filter((source) => sourceFilter === 'all' || (sourceFilter === 'trusted' ? source.trusted : !source.remake))
    .sort((left, right) => sort === 'seeders'
      ? right.seeders - left.seeders
      : sort === 'size'
        ? parseSizeBytes(left.size) - parseSizeBytes(right.size)
        : compareMobileSources(left, right, { batterySaver: resourcePolicy.batterySaver, constrained: resourcePolicy.performanceProfile === 'constrained', balancedFileSize: resourcePolicy.balancedFileSize, anime })), [anime, episode, quality, query.data, resourcePolicy.balancedFileSize, resourcePolicy.batterySaver, resourcePolicy.performanceProfile, sort, sourceFilter]);
  const maxEpisode = Number(anime.episodes || 0);

  return (
    <Screen scroll={false} safeTop={false}>
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
          <View style={styles.releaseTools}>
            <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>{query.isFetching ? 'Updating releases…' : `${rows.length} releases${rows[0] ? ` · ${sourceQualityLabel(sourceQualityScore(rows[0]))} best match` : ''}`}</Text>
            <Button compact mode="text" icon={filtersVisible ? 'tune-variant' : 'tune'} onPress={() => setFiltersVisible((visible) => !visible)}>{filtersVisible ? 'Hide filters' : 'Filters'}</Button>
          </View>
          {filtersVisible ? <View style={styles.filters}>
            <SegmentedButtons value={audio} onValueChange={(value) => setAudio(value as typeof audio)} buttons={[{ value: 'sub-preferred', label: 'Sub' }, { value: 'dual-preferred', label: 'Dual' }, { value: 'dub-only', label: 'Dub' }]} density="small" />
            <SegmentedButtons value={quality} onValueChange={setQuality} buttons={[{ value: 'auto', label: 'Best' }, { value: '1080p', label: '1080p' }, { value: '720p', label: '720p' }, { value: '2160p', label: '4K' }]} density="small" />
            <View style={styles.sourceTools}>
              <Chip selected={sourceFilter === 'trusted'} mode="outlined" icon="check-decagram-outline" onPress={() => setSourceFilter(sourceFilter === 'trusted' ? 'all' : 'trusted')}>Trusted</Chip>
              <Chip selected={sourceFilter === 'no-remakes'} mode="outlined" icon="shield-check-outline" onPress={() => setSourceFilter(sourceFilter === 'no-remakes' ? 'all' : 'no-remakes')}>No remakes</Chip>
              <Menu visible={sortMenu} onDismiss={() => setSortMenu(false)} anchor={<Button compact mode="text" icon="sort" onPress={() => setSortMenu(true)}>{sort === 'best' ? 'Best match' : sort === 'seeders' ? 'Seeders' : 'Smallest'}</Button>}>
                {([['best', 'Best match'], ['seeders', 'Most seeders'], ['size', 'Smallest size']] as const).map(([value, label]) => <Menu.Item key={value} title={label} leadingIcon={sort === value ? 'check' : undefined} onPress={() => { setSort(value); setSortMenu(false); }} />)}
              </Menu>
            </View>
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

const styles = StyleSheet.create({
  episodeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.sm },
  episodeCopy: { alignItems: 'center' },
  controls: { gap: tokens.spacing.md, paddingBottom: tokens.spacing.lg },
  releaseTools: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filters: { gap: tokens.spacing.sm },
  sourceTools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacing.sm },
  list: { paddingBottom: tokens.spacing.xxl },
  separator: { height: tokens.spacing.md },
  semibold: { fontWeight: '600' },
});
