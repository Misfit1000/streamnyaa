import { useEffect, useMemo, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { tokens } from '../theme';
import type { AnimeEpisode } from '../types';

type Props = { current: number; total?: number | null; details?: AnimeEpisode[]; onSelect: (episode: number) => void };

export function EpisodeRail({ current, total, details = [], onSelect }: Props) {
  const theme = useTheme();
  const list = useRef<FlatList<number>>(null);
  const episodes = useMemo(() => {
    const knownTotal = Math.max(current, Number(total || 0));
    const upper = knownTotal || Math.max(12, current + 5);
    if (upper <= 60) return Array.from({ length: upper }, (_, index) => index + 1);
    const first = Math.max(1, current - 15);
    const last = Math.min(upper, current + 15);
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  }, [current, total]);
  const selectedIndex = Math.max(0, episodes.indexOf(current));
  const detailsByNumber = useMemo(() => new Map(details.map((item) => [item.number, item])), [details]);
  const detailed = details.length > 0;
  const itemLength = detailed ? 136 : 72;

  useEffect(() => {
    const timer = setTimeout(() => list.current?.scrollToIndex({ index: selectedIndex, animated: true, viewPosition: 0.45 }), 80);
    return () => clearTimeout(timer);
  }, [selectedIndex]);

  return (
    <View style={styles.root}>
      <View style={styles.heading}>
        <Text variant="titleLarge" style={styles.semibold}>Episodes</Text>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{total ? `${total} available` : `Episode ${current}`}</Text>
      </View>
      <FlatList
        ref={list}
        horizontal
        data={episodes}
        keyExtractor={(item) => String(item)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        getItemLayout={(_data, index) => ({ length: itemLength, offset: itemLength * index, index })}
        onScrollToIndexFailed={({ index }) => list.current?.scrollToOffset({ offset: Math.max(0, index * itemLength), animated: true })}
        renderItem={({ item }) => {
          const active = item === current;
          const detail = detailsByNumber.get(item);
          return (
            <Pressable
              onPress={() => onSelect(item)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Episode ${item}`}
              style={({ pressed }) => [styles.episode, detailed && styles.detailedEpisode, { backgroundColor: active ? theme.colors.primaryContainer : tokens.color.surfaceRaised, borderColor: active ? tokens.color.outlineBrand : theme.colors.outlineVariant, opacity: pressed ? 0.72 : 1 }]}
            >
              <Text variant="labelSmall" style={{ color: active ? theme.colors.primary : theme.colors.onSurfaceVariant }}>Episode {item}{detail?.filler ? ' · Filler' : detail?.recap ? ' · Recap' : ''}</Text>
              {detail ? <Text variant="labelLarge" numberOfLines={2} style={[styles.detailTitle, { color: active ? theme.colors.onPrimaryContainer : theme.colors.onSurface }]}>{detail.title}</Text> : <Text variant="titleLarge" style={[styles.number, { color: active ? theme.colors.primary : theme.colors.onSurface }]}>{item}</Text>}
              <View style={[styles.indicator, { backgroundColor: active ? theme.colors.primary : 'transparent' }]} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: tokens.spacing.md },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: tokens.spacing.md },
  list: { gap: tokens.spacing.sm, paddingRight: tokens.spacing.lg },
  episode: { width: 64, height: 78, borderWidth: StyleSheet.hairlineWidth, borderRadius: tokens.radius.card, alignItems: 'center', justifyContent: 'center', gap: 2, overflow: 'hidden' },
  detailedEpisode: { width: 128, alignItems: 'flex-start', paddingHorizontal: tokens.spacing.sm },
  detailTitle: { fontWeight: '600', lineHeight: 17 },
  number: { fontWeight: '700' },
  indicator: { position: 'absolute', height: 3, bottom: 0, left: 10, right: 10, borderRadius: tokens.radius.pill },
  semibold: { fontWeight: '600' },
});
