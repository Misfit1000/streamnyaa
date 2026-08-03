import { Linking, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Chip, IconButton, Text, useTheme } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { AnimeShelf } from '../components/AnimeShelf';
import { MediaHeader } from '../components/MediaHeader';
import { fetchAnimeDetails } from '../services/anilist';
import { animeRouteParams, mangaRouteParams } from '../lib/mediaNavigation';
import { useAppStore } from '../store/useAppStore';
import type { RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Anime'>;

export function AnimeScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const query = useQuery({
    queryKey: ['anime', route.params.animeId, route.params.anilistId, route.params.malId, route.params.kitsuId],
    queryFn: ({ signal }) => fetchAnimeDetails(route.params.animeId, { anilistId: route.params.anilistId, malId: route.params.malId, kitsuId: route.params.kitsuId, title: route.params.title }, signal),
    staleTime: 30 * 60 * 1000,
  });
  const library = useAppStore((state) => state.library);
  const toggleBookmark = useAppStore((state) => state.toggleBookmark);
  const toggleLike = useAppStore((state) => state.toggleLike);

  if (query.isLoading) return <Screen safeTop={false}><StateView loading message={`Loading ${route.params.title || 'anime'}…`} /></Screen>;
  if (query.isError || !query.data) return <Screen safeTop={false}><StateView title="Title details unavailable" message={query.error?.message} onRetry={() => void query.refetch()} /></Screen>;
  const anime = query.data;
  const saved = library.find((item) => item.animeId === String(anime.malId || anime.id));
  const openAnime = (item: typeof anime) => item.mediaType === 'MANGA' ? navigation.push('Manga', mangaRouteParams(item)) : navigation.push('Anime', animeRouteParams(item));
  const status = String(anime.status || '').replaceAll('_', ' ').toLowerCase();

  return (
    <Screen safeTop={false}>
      <MediaHeader
        media={anime}
        actions={(
          <View style={styles.headerActions}>
            <IconButton size={20} mode={saved?.bookmarked ? 'contained' : 'contained-tonal'} icon={saved?.bookmarked ? 'bookmark' : 'bookmark-outline'} onPress={() => toggleBookmark(anime)} accessibilityLabel={saved?.bookmarked ? 'Remove bookmark' : 'Bookmark'} />
            <IconButton size={20} mode={saved?.liked ? 'contained' : 'contained-tonal'} icon={saved?.liked ? 'heart' : 'heart-outline'} onPress={() => toggleLike(anime)} accessibilityLabel={saved?.liked ? 'Unlike' : 'Like'} />
          </View>
        )}
      />

      <View style={styles.primaryActions}>
        <Button style={styles.flex} mode="contained" icon="play" onPress={() => navigation.navigate('Watch', { anime, episode: 1 })} contentStyle={styles.primaryContent}>Watch now</Button>
        <Button style={styles.flex} mode="contained-tonal" icon="download" onPress={() => navigation.navigate('Downloads', { anime })} contentStyle={styles.primaryContent}>Releases</Button>
      </View>

      <View style={[styles.metrics, { backgroundColor: tokens.color.glass, borderColor: theme.colors.outlineVariant }]}>
        <Metric icon="star" value={anime.score?.toFixed(1) || '—'} label="Score" />
        <Metric icon="play-box-multiple-outline" value={String(anime.episodes || '—')} label="Episodes" />
        <Metric icon="progress-clock" value={status || 'Unknown'} label="Status" />
      </View>

      {anime.genres?.length ? <View style={styles.chips}>{anime.genres.map((genre) => <Chip key={genre} compact mode="outlined" onPress={() => navigation.navigate('Catalog', { title: `${genre} anime`, genre })}>{genre}</Chip>)}</View> : null}

      <View style={styles.section}>
        <Text variant="titleLarge" style={styles.semibold}>Synopsis</Text>
        <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>{anime.description || 'No synopsis is available for this title.'}</Text>
      </View>

      <View style={styles.secondaryActions}>
        {anime.trailerId ? <Button mode="outlined" icon="youtube" onPress={() => void Linking.openURL(`https://www.youtube.com/watch?v=${anime.trailerId}`)}>Trailer</Button> : null}
        <Button mode="text" icon="magnify" onPress={() => navigation.navigate('Sources', { anime })}>Search sources</Button>
      </View>

      {anime.nextAiringEpisode ? (
        <View style={[styles.airing, { backgroundColor: theme.colors.primaryContainer, borderColor: tokens.color.outlineBrand }]}>
          <MaterialCommunityIcons name="broadcast" size={22} color={theme.colors.primary} />
          <View style={styles.flex}><Text variant="titleSmall" style={styles.semibold}>Next episode</Text><Text style={{ color: theme.colors.onSurfaceVariant }}>Episode {anime.nextAiringEpisode.episode} · {new Date(anime.nextAiringEpisode.airingAt * 1000).toLocaleString()}</Text></View>
        </View>
      ) : null}
      {anime.relations?.length ? <AnimeShelf title="Related titles" items={anime.relations} onPress={openAnime} /> : null}
      {anime.recommendations?.length ? <AnimeShelf title="You may also like" items={anime.recommendations} onPress={openAnime} /> : null}
    </Screen>
  );
}

function Metric({ icon, value, label }: { icon: string; value: string; label: string }) {
  const theme = useTheme();
  return <View style={styles.metric}><MaterialCommunityIcons name={icon as any} size={18} color={theme.colors.primary} /><Text variant="titleSmall" numberOfLines={1} style={styles.semibold}>{value}</Text><Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', marginLeft: -8 },
  primaryActions: { flexDirection: 'row', gap: tokens.spacing.md },
  primaryContent: { minHeight: 48 },
  flex: { flex: 1 },
  metrics: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderRadius: tokens.radius.card, paddingVertical: tokens.spacing.md },
  metric: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: tokens.spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  section: { gap: tokens.spacing.sm },
  description: { lineHeight: 23 },
  secondaryActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: tokens.spacing.sm },
  airing: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: tokens.radius.card, padding: tokens.spacing.lg, gap: tokens.spacing.md },
  semibold: { fontWeight: '600' },
});
