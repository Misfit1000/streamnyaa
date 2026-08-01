import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, IconButton, ProgressBar, Text, useTheme } from 'react-native-paper';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { useAppStore } from '../store/useAppStore';
import type { Anime, RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

export function HistoryScreen({ navigation }: Props) {
  const theme = useTheme();
  const history = useAppStore((state) => state.history);
  const remove = useAppStore((state) => state.removeHistory);
  const clear = useAppStore((state) => state.clearHistory);
  const resume = (item: typeof history[number]) => {
    const anime: Anime = { id: Number(item.animeId), title: item.animeTitle, cover: item.image };
    navigation.navigate('Watch', { anime, episode: item.episode, source: { title: item.sourceTitle, magnet: item.magnet, infoHash: '', seeders: 0, leechers: 0 } });
  };

  return (
    <Screen title="Watch history" subtitle="Progress syncs after sign-in" scroll={false} action={history.length ? <Button compact onPress={() => Alert.alert('Clear history?', 'This removes playback progress on all synced devices after the next sync.', [{ text: 'Cancel' }, { text: 'Clear', style: 'destructive', onPress: clear }])}>Clear</Button> : null}>
      {history.length ? <FlatList data={history} keyExtractor={(item) => item.key} contentContainerStyle={styles.list} ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />} renderItem={({ item }) => (
        <View style={styles.row}>
          <Image source={item.image} style={styles.poster} contentFit="cover" />
          <View style={styles.copy}>
            <Text variant="titleSmall" style={styles.semibold} numberOfLines={1}>{item.animeTitle}</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>Episode {item.episode} · {Math.round(item.progressPercent)}%</Text>
            <ProgressBar progress={item.progressPercent / 100} />
            <Button compact mode="contained-tonal" onPress={() => resume(item)}>Resume</Button>
          </View>
          <IconButton icon="close" onPress={() => remove(item.key)} accessibilityLabel="Remove history item" />
        </View>
      )} /> : <StateView title="No watch history yet" message="Start a source and your episode progress will appear here." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: tokens.spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.md },
  poster: { width: 62, height: 88, borderRadius: tokens.radius.control },
  copy: { flex: 1, gap: 5 },
  semibold: { fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, opacity: 0.55 },
});
