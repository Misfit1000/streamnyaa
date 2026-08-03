import { memo, useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import type { Anime } from '../types';
import { AnimeCard } from './AnimeCard';
import { tokens } from '../theme';

const CARD_WIDTH = 136;
const ITEM_WIDTH = CARD_WIDTH + tokens.spacing.md;

export const AnimeShelf = memo(function AnimeShelf({ title, items, onPress }: { title: string; items: Anime[]; onPress: (anime: Anime) => void }) {
  const theme = useTheme();
  const renderItem = useCallback(({ item }: { item: Anime }) => <AnimeCard anime={item} onPress={() => onPress(item)} width={CARD_WIDTH} />, [onPress]);
  if (!items.length) return null;
  return (
    <View style={styles.root}>
      <View style={styles.headingRow}>
        <Text variant="titleLarge" style={styles.heading}>{title}</Text>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{items.length} titles</Text>
      </View>
      <FlatList horizontal data={items} keyExtractor={(item) => `${item.metadataProvider || 'media'}-${item.id}`} renderItem={renderItem} ItemSeparatorComponent={() => <View style={styles.separator} />} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list} initialNumToRender={4} maxToRenderPerBatch={3} updateCellsBatchingPeriod={32} windowSize={4} removeClippedSubviews getItemLayout={(_data, index) => ({ length: ITEM_WIDTH, offset: ITEM_WIDTH * index, index })} />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: tokens.spacing.md },
  headingRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: tokens.spacing.md },
  heading: { fontWeight: '600', letterSpacing: -0.25 },
  list: { paddingRight: tokens.spacing.lg },
  separator: { width: tokens.spacing.md },
});
