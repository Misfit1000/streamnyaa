import { useDeferredValue, useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Chip, IconButton, Menu, ProgressBar, Searchbar, Text, useTheme } from 'react-native-paper';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { useAppStore } from '../store/useAppStore';
import type { Anime, RootStackParamList } from '../types';
import { tokens } from '../theme';
import { isPlaybackComplete } from '../../../shared/account';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

export function HistoryScreen({ navigation }: Props) {
  const theme = useTheme();
  const history = useAppStore((state) => state.history);
  const remove = useAppStore((state) => state.removeHistory);
  const clear = useAppStore((state) => state.clearHistory);
  const clearCompleted = useAppStore((state) => state.clearCompletedHistory);
  const [filter, setFilter] = useState<'all' | 'watching' | 'completed' | 'recent'>('all');
  const [sort, setSort] = useState<'recent' | 'progress' | 'title' | 'episode'>('recent');
  const [sortMenu, setSortMenu] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const completedCount = useMemo(() => history.filter((item) => isPlaybackComplete(item.progressPercent, item.resumeSeconds, item.durationSeconds)).length, [history]);
  const visibleHistory = useMemo(() => history.filter((item) => {
    const complete = isPlaybackComplete(item.progressPercent, item.resumeSeconds, item.durationSeconds);
    if (filter === 'watching' && complete) return false;
    if (filter === 'completed' && !complete) return false;
    if (filter === 'recent' && Date.parse(item.updatedAt) < Date.now() - 7 * 24 * 60 * 60 * 1000) return false;
    return `${item.animeTitle} ${item.sourceTitle} episode ${item.episode}`.toLowerCase().includes(deferredQuery.trim().toLowerCase());
  }).sort((left, right) => sort === 'progress'
    ? right.progressPercent - left.progressPercent
    : sort === 'title'
      ? left.animeTitle.localeCompare(right.animeTitle)
      : sort === 'episode'
        ? left.episode - right.episode
        : Date.parse(right.updatedAt) - Date.parse(left.updatedAt)), [deferredQuery, filter, history, sort]);
  const resume = (item: typeof history[number]) => {
    const anime: Anime = { id: Number(item.animeId), title: item.animeTitle, cover: item.image };
    navigation.navigate('Watch', {
      anime,
      episode: item.episode,
      resumeSeconds: item.resumeSeconds,
      source: { title: item.sourceTitle, magnet: item.magnet, infoHash: '', seeders: 0, leechers: 0 },
    });
  };

  return (
    <Screen scroll={false} safeTop={false}>
      {history.length ? <>
        <Searchbar value={query} onChangeText={setQuery} placeholder="Search title, source, or episode" style={styles.search} />
        <View style={styles.filterBar}>
          <ScrollView horizontal style={styles.filterScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            <Chip selected={filter === 'all'} mode="outlined" onPress={() => setFilter('all')}>All {history.length}</Chip>
            <Chip selected={filter === 'watching'} mode="outlined" onPress={() => setFilter('watching')}>Watching {history.length - completedCount}</Chip>
            <Chip selected={filter === 'completed'} mode="outlined" onPress={() => setFilter('completed')}>Done {completedCount}</Chip>
            <Chip selected={filter === 'recent'} mode="outlined" icon="calendar-clock" onPress={() => setFilter('recent')}>Last 7 days</Chip>
          </ScrollView>
        </View>
        <View style={styles.maintenance}>
          <Menu visible={sortMenu} onDismiss={() => setSortMenu(false)} anchor={<Button compact mode="text" icon="sort" onPress={() => setSortMenu(true)}>{sort === 'recent' ? 'Recent' : sort === 'progress' ? 'Progress' : sort === 'title' ? 'Title' : 'Episode'}</Button>}>
            {([['recent', 'Recently watched'], ['progress', 'Progress'], ['title', 'Title'], ['episode', 'Episode']] as const).map(([value, label]) => <Menu.Item key={value} title={label} leadingIcon={sort === value ? 'check' : undefined} onPress={() => { setSort(value); setSortMenu(false); }} />)}
          </Menu>
          <View style={styles.maintenanceSpacer} />
          {completedCount ? <Button compact mode="text" onPress={() => Alert.alert('Clear completed history?', `Remove ${completedCount} completed ${completedCount === 1 ? 'episode' : 'episodes'} from every synced device?`, [{ text: 'Cancel' }, { text: 'Clear completed', style: 'destructive', onPress: clearCompleted }])}>Clear completed</Button> : null}
          <Button compact mode="text" onPress={() => Alert.alert('Clear history?', 'This removes playback progress on all synced devices after the next sync.', [{ text: 'Cancel' }, { text: 'Clear', style: 'destructive', onPress: clear }])}>Clear all</Button>
        </View>
        {visibleHistory.length ? <FlatList data={visibleHistory} keyExtractor={(item) => item.key} contentContainerStyle={styles.list} ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />} renderItem={({ item }) => (
        <View style={styles.row}>
          <Image source={item.image} style={styles.poster} contentFit="cover" cachePolicy="memory-disk" recyclingKey={`${item.key}-${item.image}`} />
          <View style={styles.copy}>
            <Text variant="titleSmall" style={styles.semibold} numberOfLines={1}>{item.animeTitle}</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>Episode {item.episode} · {Math.round(item.progressPercent)}%</Text>
            <ProgressBar progress={item.progressPercent / 100} />
            <Button compact mode="contained-tonal" onPress={() => resume(item)}>Resume</Button>
          </View>
          <IconButton icon="close" onPress={() => remove(item.key)} accessibilityLabel="Remove history item" />
        </View>
      )} initialNumToRender={6} maxToRenderPerBatch={5} updateCellsBatchingPeriod={40} windowSize={5} removeClippedSubviews keyboardShouldPersistTaps="handled" /> : <StateView title="No matching history" message="Change the search or progress filter." />}
      </> : <StateView title="No watch history yet" message="Start a source and your episode progress will appear here." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: tokens.spacing.xxl },
  search: { borderRadius: tokens.radius.control },
  filterBar: { minHeight: 48, justifyContent: 'center' },
  filterScroll: { flex: 1 },
  filters: { gap: tokens.spacing.sm, paddingRight: tokens.spacing.lg },
  maintenance: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs },
  maintenanceSpacer: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.md },
  poster: { width: 62, height: 88, borderRadius: tokens.radius.control },
  copy: { flex: 1, gap: 5 },
  semibold: { fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, opacity: 0.55 },
});
