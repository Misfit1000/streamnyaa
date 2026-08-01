import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { Button, Snackbar, Text, useTheme } from 'react-native-paper';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { fetchSchedule } from '../services/anilist';
import { scheduleAiringReminder } from '../services/reminders';
import type { MainTabParamList, RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = CompositeScreenProps<BottomTabScreenProps<MainTabParamList, 'Schedule'>, NativeStackScreenProps<RootStackParamList>>;

function daysFromToday() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + index);
    return { date, label: index === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' }) };
  });
}

export function ScheduleScreen({ navigation }: Props) {
  const theme = useTheme();
  const days = useMemo(daysFromToday, []);
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useState('');
  const start = Math.floor(days[selected]!.date.getTime() / 1000);
  const query = useQuery({ queryKey: ['schedule', start], queryFn: ({ signal }) => fetchSchedule(start, start + 86400, signal) });

  return (
    <Screen title="Schedule" subtitle="Airing times use your device timezone" scroll={false}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>{days.map((day, index) => <Button key={day.date.toISOString()} compact mode={selected === index ? 'contained' : 'text'} onPress={() => setSelected(index)} accessibilityState={{ selected: selected === index }}>{day.label}</Button>)}</ScrollView>
      {query.isLoading ? <StateView loading message="Loading the airing calendar…" /> : query.isError ? <StateView title="Schedule unavailable" message={query.error.message} onRetry={() => void query.refetch()} /> : query.data?.length ? (
        <FlatList data={query.data} keyExtractor={(item) => `${item.anime.id}-${item.episode}`} contentContainerStyle={styles.list} ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />} renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate('Anime', { animeId: item.anime.id, title: item.anime.title })}>
            <Image source={item.anime.cover} style={styles.poster} contentFit="cover" cachePolicy="memory-disk" recyclingKey={`${item.anime.id}-${item.anime.cover}`} />
            <View style={styles.copy}>
              <Text variant="titleSmall" numberOfLines={2} style={styles.semibold}>{item.anime.title}</Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>Episode {item.episode} · {new Date(item.airingAt * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
            </View>
            <Button compact icon="bell-outline" onPress={(event) => { event.stopPropagation(); void scheduleAiringReminder(item).then(() => setMessage('Reminder scheduled.')).catch((error) => setMessage(error.message)); }}>Remind</Button>
          </Pressable>
        )} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5} removeClippedSubviews />
      ) : <StateView title="No scheduled episodes" message="No indexed episodes are airing on this day." />}
      <Snackbar visible={Boolean(message)} onDismiss={() => setMessage('')} duration={3000}>{message}</Snackbar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  days: { gap: tokens.spacing.xs, paddingRight: tokens.spacing.lg },
  list: { paddingBottom: tokens.spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: tokens.spacing.md },
  poster: { width: 52, height: 72, borderRadius: tokens.radius.control },
  copy: { flex: 1, gap: 4 },
  semibold: { fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, opacity: 0.55 },
});
