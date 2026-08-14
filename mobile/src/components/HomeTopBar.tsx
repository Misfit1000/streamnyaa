import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text, useTheme } from 'react-native-paper';
import { tokens } from '../theme';
import { BrandMark } from './BrandMark';

export type HomeFilter = 'for-you' | 'seasonal' | 'latest' | 'airing' | 'trending' | 'upcoming' | 'dubbed';

const filters: Array<{ value: HomeFilter; label: string; hint: string }> = [
  { value: 'for-you', label: 'For You', hint: 'Shows a balanced home feed' },
  { value: 'seasonal', label: 'This Season', hint: 'Shows anime from the current season' },
  { value: 'latest', label: 'New Episodes', hint: 'Shows recently updated anime' },
  { value: 'airing', label: 'Top Airing', hint: 'Shows the highest-rated anime currently airing' },
  { value: 'trending', label: 'Trending', hint: 'Shows anime gaining attention now' },
  { value: 'upcoming', label: 'Coming Soon', hint: 'Shows announced anime that have not aired yet' },
  { value: 'dubbed', label: 'Dubbed', hint: 'Prioritizes dubbed and dual-audio releases during playback' },
];

export function HomeTopBar({
  activeFilter,
  avatarUrl,
  onFilter,
  onOpenSearch,
  onOpenHistory,
  onOpenSchedule,
  onOpenProfile,
}: {
  activeFilter: HomeFilter;
  avatarUrl?: string;
  onFilter: (filter: HomeFilter) => void;
  onOpenSearch: () => void;
  onOpenHistory: () => void;
  onOpenSchedule: () => void;
  onOpenProfile: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <View style={styles.brand} accessibilityRole="header" accessibilityLabel="StreamNyaa home">
          <BrandMark size={32} />
          <Text variant="titleLarge" style={styles.wordmark}>StreamNyaa</Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={onOpenSchedule}
            accessibilityRole="button"
            accessibilityLabel="Airing notifications and schedule"
            style={({ pressed }) => [styles.iconButton, { backgroundColor: pressed ? theme.colors.surfaceVariant : 'transparent' }]}
          >
            <MaterialCommunityIcons name="bell-outline" size={25} color={theme.colors.onSurface} />
          </Pressable>
          <Pressable
            onPress={onOpenProfile}
            accessibilityRole="button"
            accessibilityLabel="Open your profile"
            style={({ pressed }) => [styles.profileButton, { borderColor: theme.colors.primary, opacity: pressed ? 0.74 : 1 }]}
          >
            {avatarUrl ? <Image source={avatarUrl} style={StyleSheet.absoluteFill} contentFit="cover" /> : <MaterialCommunityIcons name="account" size={23} color={theme.colors.onSurface} />}
          </Pressable>
        </View>
      </View>
      <View style={styles.searchRow}>
        <Pressable
          onPress={onOpenSearch}
          accessibilityRole="search"
          accessibilityLabel="Search anime"
          accessibilityHint="Opens anime search"
          style={({ pressed }) => [styles.search, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant, opacity: pressed ? 0.78 : 1 }]}
        >
          <MaterialCommunityIcons name="magnify" size={23} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodyLarge" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>Search anime, genres, or titles</Text>
        </Pressable>
        <Pressable
          onPress={onOpenHistory}
          accessibilityRole="button"
          accessibilityLabel="Watch history"
          style={({ pressed }) => [styles.historyButton, { backgroundColor: theme.colors.surfaceVariant, opacity: pressed ? 0.74 : 1 }]}
        >
          <MaterialCommunityIcons name="history" size={24} color={theme.colors.onSurface} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {filters.map((filter) => {
          const selected = filter.value === activeFilter;
          return (
            <Pressable
              key={filter.value}
              onPress={() => onFilter(filter.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={filter.label}
              accessibilityHint={filter.hint}
              style={({ pressed }) => [
                styles.filter,
                {
                  backgroundColor: selected ? tokens.color.brandDeep : theme.colors.surfaceVariant,
                  borderColor: selected ? theme.colors.primary : theme.colors.outlineVariant,
                  opacity: pressed ? 0.76 : 1,
                },
              ]}
            >
              {selected ? <MaterialCommunityIcons name="check" size={16} color={theme.colors.onSurface} /> : null}
              <Text variant="labelLarge" style={selected ? styles.selectedFilterText : undefined}>{filter.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: tokens.spacing.sm },
  bar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.md },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  wordmark: { fontWeight: '700', letterSpacing: -0.5 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconButton: { width: 48, height: 48, borderRadius: tokens.radius.pill, alignItems: 'center', justifyContent: 'center' },
  profileButton: { width: 48, height: 48, borderRadius: tokens.radius.pill, borderWidth: 1.5, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  searchRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  search: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, paddingHorizontal: tokens.spacing.md, borderRadius: tokens.radius.control, borderWidth: StyleSheet.hairlineWidth },
  historyButton: { width: 48, height: 48, borderRadius: tokens.radius.control, alignItems: 'center', justifyContent: 'center' },
  filters: { gap: tokens.spacing.sm, paddingRight: tokens.spacing.lg },
  filter: { minHeight: 48, paddingHorizontal: tokens.spacing.md, borderRadius: tokens.radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  selectedFilterText: { fontWeight: '600' },
});
