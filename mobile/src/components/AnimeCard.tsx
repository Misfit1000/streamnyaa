import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Text, useTheme } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Anime } from '../types';
import { tokens } from '../theme';

export const AnimeCard = memo(function AnimeCard({ anime, onPress, width = 132 }: { anime: Anime; onPress: () => void; width?: number }) {
  const theme = useTheme();
  const metadata = [anime.year, anime.format, anime.score ? `${anime.score.toFixed(1)} out of 10` : ''].filter(Boolean).join(', ');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.root, { width, opacity: pressed ? 0.78 : 1 }]} accessibilityRole="button" accessibilityLabel={`${anime.title}${metadata ? `, ${metadata}` : ''}`} accessibilityHint="Opens title details">
      <Image source={anime.cover} style={[styles.image, { width, height: width * 1.42, backgroundColor: theme.colors.surfaceVariant }]} contentFit="cover" cachePolicy="memory-disk" recyclingKey={`${anime.id}-${anime.cover}`} transition={120} accessibilityIgnoresInvertColors />
      <Text numberOfLines={2} variant="labelLarge" style={styles.title}>{anime.title}</Text>
      <View style={styles.meta}>
        {anime.score ? <><MaterialCommunityIcons name="star" size={13} color={tokens.color.warning} /><Text variant="labelSmall">{anime.score.toFixed(1)}</Text></> : null}
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{anime.year || anime.format || ''}</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: { gap: 6 },
  image: { borderRadius: tokens.radius.card },
  title: { minHeight: 36, fontWeight: '600', lineHeight: 18 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
