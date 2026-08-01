import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Searchbar, Text, useTheme } from 'react-native-paper';
import { Screen } from '../components/Screen';
import { searchCompare } from '../services/anilist';
import type { Anime, RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Compare'>;

export function CompareScreen({ navigation }: Props) {
  const theme = useTheme();
  const [slot, setSlot] = useState<'left' | 'right'>('left');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [left, setLeft] = useState<Anime | null>(null);
  const [right, setRight] = useState<Anime | null>(null);
  const results = useQuery({ queryKey: ['compare-search', query], queryFn: ({ signal }) => searchCompare(query, signal), enabled: query.length > 1 });
  const choose = (anime: Anime) => { if (slot === 'left') { setLeft(anime); setSlot('right'); } else setRight(anime); setText(''); setQuery(''); };

  return (
    <Screen title="Compare anime" subtitle="Choose two titles for a side-by-side view">
      <View style={styles.picks}><Pick anime={left} label="Anime A" onPress={() => left && navigation.navigate('Anime', { animeId: left.id, title: left.title })} /><Pick anime={right} label="Anime B" onPress={() => right && navigation.navigate('Anime', { animeId: right.id, title: right.title })} /></View>
      <View style={styles.slotButtons}><Button mode={slot === 'left' ? 'contained' : 'outlined'} onPress={() => setSlot('left')}>Choose A</Button><Button mode={slot === 'right' ? 'contained' : 'outlined'} onPress={() => setSlot('right')}>Choose B</Button></View>
      <Searchbar value={text} onChangeText={setText} onSubmitEditing={() => setQuery(text.trim())} placeholder={`Search for anime ${slot === 'left' ? 'A' : 'B'}`} style={styles.search} />
      {results.data?.map((anime: Anime) => <Button key={anime.id} contentStyle={styles.result} mode="text" onPress={() => choose(anime)}>{anime.title}</Button>)}
      {left && right ? (
        <View style={[styles.table, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Metric label="Score" left={left.score?.toFixed(1) || '—'} right={right.score?.toFixed(1) || '—'} />
          <Metric label="Episodes" left={String(left.episodes || '—')} right={String(right.episodes || '—')} />
          <Metric label="Format" left={left.format || '—'} right={right.format || '—'} />
          <Metric label="Status" left={left.status || '—'} right={right.status || '—'} />
          <Metric label="Studio" left={left.studios?.[0] || '—'} right={right.studios?.[0] || '—'} />
          <Metric label="Genres" left={left.genres?.slice(0, 3).join(', ') || '—'} right={right.genres?.slice(0, 3).join(', ') || '—'} />
        </View>
      ) : null}
    </Screen>
  );
}

function Pick({ anime, label, onPress }: { anime: Anime | null; label: string; onPress: () => void }) {
  return <View style={styles.pick}>{anime?.cover ? <Image source={anime.cover} style={styles.poster} contentFit="cover" cachePolicy="memory-disk" recyclingKey={`${anime.id}-${anime.cover}`} /> : <View style={[styles.poster, styles.placeholder]} />}<Text variant="labelMedium">{label}</Text><Text variant="titleSmall" style={styles.semibold} numberOfLines={2} onPress={onPress} accessibilityRole="button">{anime?.title || 'Not selected'}</Text></View>;
}

function Metric({ label, left, right }: { label: string; left: string; right: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{left}</Text><Text variant="labelSmall" style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, styles.right]}>{right}</Text></View>;
}

const styles = StyleSheet.create({
  picks: { flexDirection: 'row', gap: tokens.spacing.lg },
  pick: { flex: 1, gap: 5 },
  poster: { width: '100%', aspectRatio: 0.7, borderRadius: tokens.radius.card },
  placeholder: { backgroundColor: '#2A252B' },
  slotButtons: { flexDirection: 'row', justifyContent: 'center', gap: tokens.spacing.md },
  search: { borderRadius: tokens.radius.control },
  result: { justifyContent: 'flex-start' },
  table: { borderRadius: tokens.radius.card, padding: tokens.spacing.md, gap: tokens.spacing.md },
  metric: { flexDirection: 'row', alignItems: 'center' },
  metricValue: { flex: 1 },
  metricLabel: { width: 72, textAlign: 'center', opacity: 0.7 },
  right: { textAlign: 'right' },
  semibold: { fontWeight: '600' },
});
