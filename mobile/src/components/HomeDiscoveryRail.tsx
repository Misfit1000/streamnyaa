import { memo, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text, useTheme } from 'react-native-paper';
import type { Anime } from '../types';
import { tokens } from '../theme';

export const HomeDiscoveryRail = memo(function HomeDiscoveryRail({
  title,
  subtitle = 'Tap any title to start automatically',
  items,
  onPress,
}: {
  title: string;
  subtitle?: string;
  items: Anime[];
  onPress: (anime: Anime) => void;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(154, Math.max(126, width * 0.34));
  const visibleItems = items.filter((item) => Boolean(item.cover)).slice(0, 8);
  const renderItem = useCallback(({ item, index }: { item: Anime; index: number }) => (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, pick ${index + 1}${item.score ? `, rated ${item.score.toFixed(1)} out of 10` : ''}`}
      accessibilityHint="Opens this anime"
      style={({ pressed }) => [styles.card, { width: cardWidth, opacity: pressed ? 0.76 : 1 }]}
    >
      <View style={[styles.artwork, { width: cardWidth, height: cardWidth * 1.42, backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant }]}>
        <Image
          source={item.cover}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={`home-discovery-${item.metadataProvider || 'media'}-${item.id}`}
          transition={100}
          accessibilityIgnoresInvertColors
        />
        <View style={styles.rank}><Text variant="labelLarge" style={styles.rankText}>{index + 1}</Text></View>
        <View style={styles.play}><MaterialCommunityIcons name="play" size={21} color="#FFFFFF" /></View>
      </View>
      <Text variant="labelLarge" numberOfLines={2} style={styles.title}>{item.title}</Text>
      <Text variant="labelSmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
        {[item.year, item.format?.replaceAll('_', ' '), item.score ? `★ ${item.score.toFixed(1)}` : ''].filter(Boolean).join(' · ') || 'Ready to watch'}
      </Text>
    </Pressable>
  ), [cardWidth, onPress, theme.colors.outlineVariant, theme.colors.onSurfaceVariant, theme.colors.surfaceVariant]);

  if (!visibleItems.length) return null;
  return (
    <View style={styles.root}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text variant="titleLarge" style={styles.heading}>{title}</Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{subtitle}</Text>
        </View>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{visibleItems.length} picks</Text>
      </View>
      <FlatList
        horizontal
        data={visibleItems}
        keyExtractor={(item) => `home-pick-${item.metadataProvider || 'media'}-${item.id}`}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsHorizontalScrollIndicator={false}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={4}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: tokens.spacing.sm },
  headingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: tokens.spacing.md },
  headingCopy: { flex: 1, gap: 2 },
  heading: { fontWeight: '600', letterSpacing: -0.25 },
  card: { gap: 5 },
  artwork: { borderRadius: tokens.radius.card, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  rank: { position: 'absolute', left: 7, top: 7, minWidth: 30, height: 30, borderRadius: tokens.radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,3,4,0.86)' },
  rankText: { color: '#FFFFFF', fontWeight: '600' },
  play: { position: 'absolute', right: 7, bottom: 7, width: 36, height: 36, borderRadius: tokens.radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.brandBright },
  title: { minHeight: 38, fontWeight: '600', lineHeight: 18 },
  separator: { width: tokens.spacing.sm },
});
