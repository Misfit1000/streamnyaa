import { memo, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ProgressBar, Text, useTheme } from 'react-native-paper';
import type { PlaybackHistoryItem } from '../types';
import { tokens } from '../theme';

export const ContinueWatchingRail = memo(function ContinueWatchingRail({
  items,
  imageFor,
  onPress,
  onSeeAll,
}: {
  items: PlaybackHistoryItem[];
  imageFor: (item: PlaybackHistoryItem) => string | undefined;
  onPress: (item: PlaybackHistoryItem) => void;
  onSeeAll: () => void;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(224, Math.max(168, width * 0.49));
  const renderItem = useCallback(({ item }: { item: PlaybackHistoryItem }) => (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`Continue ${item.animeTitle}, episode ${item.episode}, ${Math.round(item.progressPercent)} percent watched`}
      accessibilityHint="Resumes playback"
      style={({ pressed }) => [styles.card, { width: cardWidth, opacity: pressed ? 0.78 : 1 }]}
    >
      <View style={[styles.artwork, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant }]}>
        <Image source={imageFor(item)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
        <View style={styles.resumeBadge}><MaterialCommunityIcons name="play" size={13} color="#FFFFFF" /><Text variant="labelSmall" style={styles.badgeText}>Resume</Text></View>
        <ProgressBar progress={Math.max(0, Math.min(1, item.progressPercent / 100))} style={styles.progress} color={theme.colors.primary} />
      </View>
      <Text variant="titleSmall" numberOfLines={1} style={styles.title}>{item.animeTitle}</Text>
      <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>Episode {item.episode} · {item.durationSeconds > item.resumeSeconds ? `${Math.max(1, Math.round((item.durationSeconds - item.resumeSeconds) / 60))} min left` : `${Math.round(item.progressPercent)}% watched`}</Text>
    </Pressable>
  ), [cardWidth, imageFor, onPress, theme.colors.outlineVariant, theme.colors.primary, theme.colors.surfaceVariant, theme.colors.onSurfaceVariant]);

  if (!items.length) return null;
  return (
    <View style={styles.root}>
      <View style={styles.headingRow}>
        <Text variant="titleLarge" style={styles.heading}>Continue watching</Text>
        <Pressable onPress={onSeeAll} accessibilityRole="button" accessibilityLabel="See all watch history" style={styles.seeAll}><Text variant="labelLarge" style={{ color: theme.colors.primary }}>See all</Text></Pressable>
      </View>
      <FlatList horizontal data={items.slice(0, 8)} keyExtractor={(item) => item.key} renderItem={renderItem} ItemSeparatorComponent={() => <View style={styles.separator} />} showsHorizontalScrollIndicator={false} initialNumToRender={3} maxToRenderPerBatch={3} windowSize={4} />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: tokens.spacing.sm },
  headingRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.md },
  heading: { fontWeight: '600', letterSpacing: -0.25 },
  seeAll: { minWidth: 56, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center' },
  card: { gap: 5 },
  artwork: { aspectRatio: 16 / 9, borderRadius: tokens.radius.card, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  resumeBadge: { position: 'absolute', right: 8, top: 8, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 4, borderRadius: tokens.radius.control, backgroundColor: 'rgba(3,3,4,0.86)' },
  badgeText: { color: '#FFFFFF', fontWeight: '600' },
  progress: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4 },
  title: { fontWeight: '600' },
  separator: { width: tokens.spacing.sm },
});
