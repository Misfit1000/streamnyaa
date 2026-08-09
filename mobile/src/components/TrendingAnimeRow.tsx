import { memo } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text, useTheme } from 'react-native-paper';
import type { Anime } from '../types';
import { tokens } from '../theme';

export const TrendingAnimeRow = memo(function TrendingAnimeRow({ anime, onPress }: { anime: Anime; onPress: () => void }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const artworkWidth = width < 360 ? 108 : 124;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${anime.title}${anime.score ? `, rated ${anime.score.toFixed(1)} out of 10` : ''}`}
      accessibilityHint="Starts the watch experience"
      style={({ pressed }) => [styles.root, { opacity: pressed ? 0.76 : 1 }]}
    >
      <View style={[styles.artwork, { width: artworkWidth, backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant }]}>
        <Image source={anime.banner || anime.cover} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" recyclingKey={`home-row-${anime.id}`} />
        <View style={styles.play}><MaterialCommunityIcons name="play" size={19} color="#FFFFFF" /></View>
      </View>
      <View style={styles.copy}>
        <Text variant="titleMedium" numberOfLines={2} style={styles.title}>{anime.title}</Text>
        <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>{[anime.format?.replaceAll('_', ' '), anime.year, anime.episodes ? `${anime.episodes} episodes` : ''].filter(Boolean).join(' · ')}</Text>
        <View style={styles.metadata}>
          <View style={[styles.language, { backgroundColor: theme.colors.surfaceVariant }]}><Text variant="labelSmall">Sub / Dub choice</Text></View>
          {anime.score ? <View style={styles.rating}><MaterialCommunityIcons name="star" size={15} color={tokens.color.warning} /><Text variant="labelMedium">{anime.score.toFixed(1)}</Text></View> : null}
        </View>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, paddingVertical: 7 },
  artwork: { aspectRatio: 16 / 9, borderRadius: tokens.radius.card, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  play: { position: 'absolute', left: 7, bottom: 7, width: 28, height: 28, borderRadius: tokens.radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,3,4,0.78)' },
  copy: { flex: 1, gap: 5 },
  title: { fontWeight: '600', lineHeight: 21 },
  metadata: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: tokens.spacing.sm },
  language: { minHeight: 28, borderRadius: tokens.radius.control, justifyContent: 'center', paddingHorizontal: tokens.spacing.sm },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
