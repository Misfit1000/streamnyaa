import { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, IconButton, ProgressBar, Searchbar, SegmentedButtons, Text, useTheme } from 'react-native-paper';
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
  const [filter, setFilter] = useState<'all' | 'watching' | 'completed'>('all');
  const [query, setQuery] = useState('');
  const completedCount = useMemo(() => history.filter((item) => isPlaybackComplete(item.progressPercent, item.resumeSeconds, item.durationSeconds)).length, [history]);
  const visibleHistory = useMemo(() => history.filter((item) => {
    const complete = isPlaybackComplete(item.progressPercent, item.resumeSeconds, item.durationSeconds);
    if (filter === 'watching' && complete) return false;
    if (filter === 'completed' && !complete) return false;
    return `${item.animeTitle} ${item.sourceTitle} episode ${item.episode}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [filter, history, query]);
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
    <Screen title="Watch history" subtitle="Progress syncs after sign-in" scroll={false} action={history.length ? <Button compact onPress={() => Alert.alert('Clear history?', 'This removes playback progress on all synced devices after the next sync.', [{ text: 'Cancel' }, { text: 'Clear', style: 'destructive', onPress: clear }])}>Clear</Button> : null}>
      {history.length ? <>
        <Searchbar value={query} onChangeText={setQuery} placeholder="Search title, source, or episode" style={styles.search} />
        <SegmentedButtons value={filter} onValueChange={(value) => setFilter(value as typeof filter)} buttons={[{ value: 'all', label: `All (${history.length})` }, { value: 'watching', label: `Watching (${history.length - completedCount})` }, { value: 'completed', label: `Done (${completedCount})` }]} density="small" />
        {completedCount ? <Button compact mode="text" onPress={() => Alert.alert('Clear completed history?', `Remove ${completedCount} completed ${completedCount === 1 ? 'episode' : 'episodes'} from every synced device?`, [{ text: 'Cancel' }, { text: 'Clear completed', style: 'destructive', onPress: clearCompleted }])}>Clear completed</Button> : null}
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
      )} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5} removeClippedSubviews keyboardShouldPersistTaps="handled" /> : <StateView title="No matching history" message="Change the search or progress filter." />}
      </> : <StateView title="No watch history yet" message="Start a source and your episode progress will appear here." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: tokens.spacing.xxl },
  search: { borderRadius: tokens.radius.control },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.md },
  poster: { width: 62, height: 88, borderRadius: tokens.radius.control },
  copy: { flex: 1, gap: 5 },
  semibold: { fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, opacity: 0.55 },
});
