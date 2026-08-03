import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { Button, IconButton, SegmentedButtons, Snackbar, Text, useTheme } from 'react-native-paper';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { fetchSchedule } from '../services/anilist';
import { watchRouteParams } from '../lib/mediaNavigation';
import { cancelAiringReminder, scheduleAiringReminder } from '../services/reminders';
import { useAppStore } from '../store/useAppStore';
import type { MainTabParamList, RootStackParamList, ScheduleEntry } from '../types';
import { tokens } from '../theme';

type Props = CompositeScreenProps<BottomTabScreenProps<MainTabParamList, 'Schedule'>, NativeStackScreenProps<RootStackParamList>>;

function daysFromToday() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return { date, label: index === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' }) };
  });
}

function animeKey(entry: ScheduleEntry) {
  return String(entry.anime.malId || entry.anime.id);
}

function reminderKey(entry: ScheduleEntry) {
  return `${animeKey(entry)}:${entry.episode || 0}:${entry.airingAt}`;
}

export function ScheduleScreen({ navigation }: Props) {
  const theme = useTheme();
  const days = useMemo(daysFromToday, []);
  const [selected, setSelected] = useState(0);
  const [collection, setCollection] = useState<'all' | 'saved'>('all');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState('');
  const library = useAppStore((state) => state.library);
  const reminders = useAppStore((state) => state.airingReminders);
  const toggleBookmark = useAppStore((state) => state.toggleBookmark);
  const saveReminder = useAppStore((state) => state.saveAiringReminder);
  const removeReminder = useAppStore((state) => state.removeAiringReminder);
  const start = Math.floor(days[selected]!.date.getTime() / 1000);
  const query = useQuery({ queryKey: ['schedule', start], queryFn: ({ signal }) => fetchSchedule(start, start + 86400, signal) });
  const savedIds = useMemo(() => new Set(library.filter((item) => item.bookmarked).map((item) => item.animeId)), [library]);
  const entries = useMemo(() => (query.data || []).filter((entry: ScheduleEntry) => collection === 'all' || savedIds.has(animeKey(entry))), [collection, query.data, savedIds]);

  const updateReminder = async (entry: ScheduleEntry) => {
    const key = reminderKey(entry);
    const existing = reminders[key];
    setPending(key);
    try {
      if (existing) {
        await cancelAiringReminder(existing.notificationId);
        removeReminder(key);
        setMessage('Reminder removed.');
      } else {
        const notificationId = await scheduleAiringReminder(entry);
        saveReminder(key, {
          notificationId,
          animeId: animeKey(entry),
          animeTitle: entry.anime.title,
          episode: entry.episode,
          airingAt: entry.airingAt,
        });
        setMessage('Reminder scheduled for 10 minutes before airing.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The reminder could not be updated.');
    } finally {
      setPending('');
    }
  };

  return (
    <Screen title="Schedule" subtitle="Airing times use your device timezone" scroll={false}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
        {days.map((day, index) => <Button key={day.date.toISOString()} compact mode={selected === index ? 'contained' : 'text'} onPress={() => setSelected(index)} accessibilityState={{ selected: selected === index }}>{day.label}</Button>)}
      </ScrollView>
      <SegmentedButtons value={collection} onValueChange={(value) => setCollection(value as typeof collection)} buttons={[{ value: 'all', label: 'All airing' }, { value: 'saved', label: `Saved (${savedIds.size})`, icon: 'bookmark-outline' }]} density="small" />
      {query.data?.[0]?.provider ? <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Times provided by {query.data[0].provider}</Text> : null}
      {query.isLoading ? <StateView loading message="Loading the airing calendar..." /> : query.isError ? <StateView title="Schedule unavailable" message={query.error.message} onRetry={() => void query.refetch()} /> : entries.length ? (
        <FlatList
          data={entries}
          keyExtractor={(item) => `${item.anime.id}-${item.airingAt}`}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: theme.colors.outline }]} />}
          renderItem={({ item }) => {
            const key = reminderKey(item);
            const saved = savedIds.has(animeKey(item));
            const reminded = Boolean(reminders[key]);
            return (
              <Pressable style={styles.row} onPress={() => navigation.navigate('Watch', watchRouteParams(item.anime, Math.max(1, Number(item.episode || 1))))}>
                <Image source={item.anime.cover} style={styles.poster} contentFit="cover" cachePolicy="memory-disk" recyclingKey={`${item.anime.id}-${item.anime.cover}`} />
                <View style={styles.copy}>
                  <Text variant="titleSmall" numberOfLines={2} style={styles.semibold}>{item.anime.title}</Text>
                  <Text style={{ color: theme.colors.onSurfaceVariant }}>{item.episode ? `Episode ${item.episode}` : 'New episode'} · {new Date(item.airingAt * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                </View>
                <View style={styles.actions}>
                  <IconButton size={20} icon={saved ? 'bookmark' : 'bookmark-outline'} mode={saved ? 'contained-tonal' : undefined} onPress={(event) => { event.stopPropagation(); toggleBookmark(item.anime); }} accessibilityLabel={saved ? `Remove ${item.anime.title} from saved anime` : `Save ${item.anime.title}`} />
                  <IconButton size={20} icon={reminded ? 'bell-check' : 'bell-outline'} mode={reminded ? 'contained' : 'contained-tonal'} loading={pending === key} disabled={Boolean(pending)} onPress={(event) => { event.stopPropagation(); void updateReminder(item); }} accessibilityLabel={reminded ? `Remove airing reminder for ${item.anime.title}` : `Remind me when ${item.anime.title} airs`} />
                </View>
              </Pressable>
            );
          }}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews
        />
      ) : <StateView title={collection === 'saved' ? 'No saved anime airing' : 'No scheduled episodes'} message={collection === 'saved' ? 'Save a title from this schedule or its cinema screen, then it will appear here.' : 'No indexed episodes are airing on this day.'} />}
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
  actions: { flexDirection: 'row', alignItems: 'center', marginRight: -8 },
  semibold: { fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, opacity: 0.55 },
});
