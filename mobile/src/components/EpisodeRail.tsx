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
  const itemLength = 54 + tokens.spacing.sm;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedIndex < 3) list.current?.scrollToOffset({ offset: 0, animated: true });
      else list.current?.scrollToIndex({ index: selectedIndex, animated: true, viewPosition: 0.35 });
    }, 80);
    return () => clearTimeout(timer);
  }, [selectedIndex]);

  return (
    <View style={styles.root}>
      <View style={styles.heading}>
        <Text variant="titleMedium" style={styles.semibold}>Episodes</Text>
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
          const kind = detail?.filler ? 'filler' : detail?.recap ? 'recap' : '';
          return (
            <Pressable
              onPress={() => onSelect(item)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Episode ${item}${kind ? `, ${kind}` : ''}`}
              style={({ pressed }) => [styles.episode, {
                backgroundColor: active ? theme.colors.primary : tokens.color.surfaceRaised,
                borderColor: active ? theme.colors.primary : theme.colors.outlineVariant,
                opacity: pressed ? 0.72 : 1,
              }]}
            >
              <Text variant="labelLarge" style={[styles.number, { color: active ? '#FFFFFF' : theme.colors.onSurface }]}>{item}</Text>
              {kind ? <View style={[styles.kindDot, { backgroundColor: active ? '#FFFFFF' : theme.colors.primary }]} /> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: tokens.spacing.sm },
  heading: { minHeight: 38, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: tokens.spacing.md, paddingHorizontal: tokens.spacing.lg },
  list: { gap: tokens.spacing.sm, paddingHorizontal: tokens.spacing.lg },
  episode: { width: 54, height: 54, borderWidth: StyleSheet.hairlineWidth, borderRadius: tokens.radius.control, alignItems: 'center', justifyContent: 'center' },
  number: { fontWeight: '600' },
  kindDot: { position: 'absolute', width: 4, height: 4, bottom: 6, borderRadius: 2 },
  semibold: { fontWeight: '600' },
});
