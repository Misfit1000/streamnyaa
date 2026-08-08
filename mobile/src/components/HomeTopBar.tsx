import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text, useTheme } from 'react-native-paper';
import { tokens } from '../theme';

const logo = require('../../assets/brand/streamnyaa-logo.png');

export type HomeFilter = 'for-you' | 'trending' | 'latest' | 'dubbed';

const filters: Array<{ value: HomeFilter; label: string; hint: string }> = [
  { value: 'for-you', label: 'For You', hint: 'Shows a balanced home feed' },
  { value: 'trending', label: 'Trending', hint: 'Shows anime gaining attention now' },
  { value: 'latest', label: 'Latest', hint: 'Shows recently updated anime' },
  { value: 'dubbed', label: 'Dubbed', hint: 'Prioritizes dubbed and dual-audio releases during playback' },
];

export function HomeTopBar({
  activeFilter,
  avatarUrl,
  onFilter,
  onOpenSchedule,
  onOpenProfile,
}: {
  activeFilter: HomeFilter;
  avatarUrl?: string;
  onFilter: (filter: HomeFilter) => void;
  onOpenSchedule: () => void;
  onOpenProfile: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <View style={styles.brand} accessibilityRole="header" accessibilityLabel="StreamNyaa home">
          <Image source={logo} style={styles.logo} contentFit="contain" accessibilityIgnoresInvertColors />
          <Text variant="headlineSmall" style={styles.wordmark}>StreamNyaa</Text>
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
  root: { gap: tokens.spacing.md },
  bar: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing.md },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  logo: { width: 38, height: 38 },
  wordmark: { fontWeight: '700', letterSpacing: -0.5 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconButton: { width: 48, height: 48, borderRadius: tokens.radius.pill, alignItems: 'center', justifyContent: 'center' },
  profileButton: { width: 42, height: 42, borderRadius: tokens.radius.pill, borderWidth: 1.5, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  filters: { gap: tokens.spacing.sm, paddingRight: tokens.spacing.lg },
  filter: { minHeight: 48, paddingHorizontal: tokens.spacing.lg, borderRadius: tokens.radius.pill, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  selectedFilterText: { fontWeight: '600' },
});
