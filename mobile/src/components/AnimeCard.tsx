import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Text, useTheme } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Anime } from '../types';
import { tokens } from '../theme';

export const AnimeCard = memo(function AnimeCard({ anime, onPress, width = 136 }: { anime: Anime; onPress: () => void; width?: number }) {
  const theme = useTheme();
  const metadata = [anime.year, anime.format, anime.score ? `${anime.score.toFixed(1)} out of 10` : ''].filter(Boolean).join(', ');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.root, { width, opacity: pressed ? 0.76 : 1 }]} accessibilityRole="button" accessibilityLabel={`${anime.title}${metadata ? `, ${metadata}` : ''}`} accessibilityHint={anime.mediaType === 'MANGA' ? 'Opens title details' : 'Opens the watch experience'}>
      <View style={[styles.artwork, { width, height: width * 1.45, backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant }]}>
        <Image source={anime.cover} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" priority="low" recyclingKey={`${anime.id}-${anime.cover}`} accessibilityIgnoresInvertColors />
        {anime.score ? (
          <View style={styles.score}>
            <MaterialCommunityIcons name="star" size={12} color={tokens.color.warning} />
            <Text variant="labelSmall" style={styles.scoreText}>{anime.score.toFixed(1)}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={2} variant="labelLarge" style={styles.title}>{anime.title}</Text>
      <Text variant="labelSmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>{[anime.year, anime.format?.replaceAll('_', ' ')].filter(Boolean).join(' · ') || 'Details available'}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: { gap: 5 },
  artwork: { borderRadius: tokens.radius.card, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  score: { position: 'absolute', left: 7, bottom: 7, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: tokens.radius.control, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: 'rgba(3, 3, 4, 0.86)' },
  scoreText: { color: '#FFFFFF', fontWeight: '600' },
  title: { minHeight: 38, fontWeight: '600', lineHeight: 18 },
});
