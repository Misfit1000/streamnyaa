import { FlatList, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import type { Anime } from '../types';
import { AnimeCard } from './AnimeCard';
import { tokens } from '../theme';

export function AnimeShelf({ title, items, onPress }: { title: string; items: Anime[]; onPress: (anime: Anime) => void }) {
  return (
    <View style={styles.root}>
      <Text variant="titleMedium" style={styles.heading}>{title}</Text>
      <FlatList horizontal data={items} keyExtractor={(item) => `${title}-${item.id}`} renderItem={({ item }) => <AnimeCard anime={item} onPress={() => onPress(item)} />} ItemSeparatorComponent={() => <View style={styles.separator} />} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: tokens.spacing.md },
  heading: { fontWeight: '600' },
  list: { paddingRight: tokens.spacing.lg },
  separator: { width: tokens.spacing.md },
});
