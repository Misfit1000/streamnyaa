import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ImageBackground } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, IconButton, Text, useTheme } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { AnimeShelf } from '../components/AnimeShelf';
import { fetchHomeFeed } from '../services/anilist';
import { useAppStore } from '../store/useAppStore';
import type { MainTabParamList, RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = CompositeScreenProps<BottomTabScreenProps<MainTabParamList, 'Home'>, NativeStackScreenProps<RootStackParamList>>;

export function HomeScreen({ navigation }: Props) {
  const theme = useTheme();
  const { height, width } = useWindowDimensions();
  const nsfwMode = useAppStore((state) => state.nsfwMode);
  const history = useAppStore((state) => state.history);
  const query = useQuery({ queryKey: ['home', nsfwMode], queryFn: ({ signal }) => fetchHomeFeed(nsfwMode, signal) });
  const hero = query.data?.trending[0];

  if (query.isLoading) return <Screen><StateView loading message="Loading this season’s anime…" /></Screen>;
  if (query.isError || !query.data) return <Screen><StateView title="Home feed unavailable" message={query.error?.message} onRetry={() => void query.refetch()} /></Screen>;

  const openAnime = (anime: { id: number; title: string }) => navigation.navigate('Anime', { animeId: anime.id, title: anime.title });
  return (
    <Screen title="StreamNyaa" subtitle="Anime, sources, and progress in one place" action={<IconButton icon="magnify" onPress={() => navigation.navigate('Explore')} />}>
      {hero ? (
        <Pressable onPress={() => openAnime(hero)} accessibilityRole="button" accessibilityLabel={`${hero.title}. Featured anime`} accessibilityHint="Opens anime details">
          <ImageBackground source={hero.banner || hero.cover} style={[styles.hero, { height: Math.max(210, Math.min(300, width * 0.62, height * 0.36)) }]} imageStyle={styles.heroImage} contentFit="cover" cachePolicy="memory-disk">
            <View style={styles.heroShade}>
              <View style={styles.heroCopy}>
                <Text variant="headlineSmall" style={styles.heroTitle} numberOfLines={2}>{hero.title}</Text>
                <Text variant="bodyMedium" numberOfLines={2} style={styles.heroMeta}>{[hero.format, hero.year, hero.score ? `${hero.score.toFixed(1)} score` : ''].filter(Boolean).join(' · ')}</Text>
                <Button mode="contained" icon="play" onPress={() => navigation.navigate('Watch', { anime: hero })}>Watch</Button>
              </View>
            </View>
          </ImageBackground>
        </Pressable>
      ) : null}

      {history[0] ? (
        <Pressable style={[styles.continue, { backgroundColor: theme.colors.surfaceVariant }]} onPress={() => navigation.navigate('History')} accessibilityRole="button" accessibilityLabel={`Continue ${history[0].animeTitle}, episode ${history[0].episode}`} accessibilityHint="Opens watch history">
          <MaterialCommunityIcons name="play-circle-outline" size={34} color={theme.colors.primary} />
          <View style={styles.continueCopy}>
            <Text variant="titleSmall" style={styles.semibold}>Continue watching</Text>
            <Text numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>{history[0].animeTitle} · Episode {history[0].episode}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
        </Pressable>
      ) : null}

      <View style={styles.quickRow}>
        <QuickAction icon="download" label="Sources" onPress={() => navigation.navigate('Sources', {})} />
        <QuickAction icon="compare-horizontal" label="Compare" onPress={() => navigation.navigate('Compare')} />
        <QuickAction icon="history" label="History" onPress={() => navigation.navigate('History')} />
        <QuickAction icon="cog-outline" label="Settings" onPress={() => navigation.navigate('Settings')} />
      </View>

      <AnimeShelf title="Trending now" items={query.data.trending} onPress={openAnime} />
      <AnimeShelf title="Popular picks" items={query.data.popular} onPress={openAnime} />
      <AnimeShelf title="Airing this season" items={query.data.airing} onPress={openAnime} />
      <AnimeShelf title="Coming soon" items={query.data.upcoming} onPress={openAnime} />
    </Screen>
  );
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.quickAction} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      <View style={[styles.quickIcon, { backgroundColor: theme.colors.surfaceVariant }]}><MaterialCommunityIcons name={icon as any} size={22} color={theme.colors.primary} /></View>
      <Text variant="labelMedium">{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { justifyContent: 'flex-end' },
  heroImage: { borderRadius: tokens.radius.card },
  heroShade: { flex: 1, justifyContent: 'flex-end', borderRadius: tokens.radius.card, backgroundColor: 'rgba(8,6,9,0.36)' },
  heroCopy: { padding: tokens.spacing.lg, gap: tokens.spacing.sm, backgroundColor: 'rgba(14,11,15,0.78)', borderBottomLeftRadius: tokens.radius.card, borderBottomRightRadius: tokens.radius.card },
  heroTitle: { color: '#FFFFFF', fontWeight: '700' },
  heroMeta: { color: '#D9D0D6' },
  continue: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.md, padding: tokens.spacing.md, borderRadius: tokens.radius.card },
  continueCopy: { flex: 1, gap: 2 },
  semibold: { fontWeight: '600' },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quickAction: { width: 70, alignItems: 'center', gap: 6 },
  quickIcon: { width: 48, height: 48, borderRadius: tokens.radius.card, alignItems: 'center', justifyContent: 'center' },
});
