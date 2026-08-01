import { memo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import type { Anime } from '../types';
import { AnimeCard } from './AnimeCard';
import { tokens } from '../theme';

const CARD_WIDTH = 132;
const ITEM_WIDTH = CARD_WIDTH + tokens.spacing.md;

export const AnimeShelf = memo(function AnimeShelf({ title, items, onPress }: { title: string; items: Anime[]; onPress: (anime: Anime) => void }) {
  return (
    <View style={styles.root}>
      <Text variant="titleMedium" style={styles.heading}>{title}</Text>
      <FlatList horizontal data={items} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <AnimeCard anime={item} onPress={() => onPress(item)} width={CARD_WIDTH} />} ItemSeparatorComponent={() => <View style={styles.separator} />} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list} initialNumToRender={4} maxToRenderPerBatch={4} windowSize={5} removeClippedSubviews getItemLayout={(_data, index) => ({ length: ITEM_WIDTH, offset: ITEM_WIDTH * index, index })} />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: tokens.spacing.md },
  heading: { fontWeight: '600' },
  list: { paddingRight: tokens.spacing.lg },
  separator: { width: tokens.spacing.md },
});
