import { Linking, StyleSheet, View } from 'react-native';
import { Image, ImageBackground } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Chip, IconButton, Text, useTheme } from 'react-native-paper';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { AnimeShelf } from '../components/AnimeShelf';
import { fetchAnimeDetails } from '../services/anilist';
import { useAppStore } from '../store/useAppStore';
import type { RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Anime'>;

export function AnimeScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const query = useQuery({ queryKey: ['anime', route.params.animeId], queryFn: ({ signal }) => fetchAnimeDetails(route.params.animeId, signal) });
  const library = useAppStore((state) => state.library);
  const toggleBookmark = useAppStore((state) => state.toggleBookmark);
  const toggleLike = useAppStore((state) => state.toggleLike);

  if (query.isLoading) return <Screen><StateView loading message={`Loading ${route.params.title || 'anime'}…`} /></Screen>;
  if (query.isError || !query.data) return <Screen><StateView title="Anime unavailable" message={query.error?.message} onRetry={() => void query.refetch()} /></Screen>;
  const anime = query.data;
  const saved = library.find((item) => item.animeId === String(anime.malId || anime.id));
  const openAnime = (item: typeof anime) => item.mediaType === 'MANGA'
    ? navigation.push('Manga', { mangaId: item.id, title: item.title })
    : navigation.push('Anime', { animeId: item.id, title: item.title });

  return (
    <Screen>
      <ImageBackground source={anime.banner || anime.cover} style={styles.banner} imageStyle={styles.bannerImage} contentFit="cover" cachePolicy="memory-disk">
        <View style={styles.bannerShade} />
      </ImageBackground>
      <View style={styles.summary}>
        <Image source={anime.cover} style={styles.poster} contentFit="cover" cachePolicy="memory-disk" recyclingKey={`${anime.id}-${anime.cover}`} />
        <View style={styles.summaryCopy}>
          <Text variant="headlineSmall" style={styles.bold}>{anime.title}</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>{[anime.format, anime.year, anime.episodes ? `${anime.episodes} episodes` : '', anime.score ? `${anime.score.toFixed(1)} score` : ''].filter(Boolean).join(' · ')}</Text>
          <View style={styles.actions}>
            <IconButton mode={saved?.bookmarked ? 'contained' : 'contained-tonal'} icon={saved?.bookmarked ? 'bookmark' : 'bookmark-outline'} onPress={() => toggleBookmark(anime)} />
            <IconButton mode={saved?.liked ? 'contained' : 'contained-tonal'} icon={saved?.liked ? 'heart' : 'heart-outline'} onPress={() => toggleLike(anime)} />
          </View>
        </View>
      </View>
      <View style={styles.primaryActions}>
        <Button style={styles.flex} mode="contained" icon="play" onPress={() => navigation.navigate('Watch', { anime, episode: 1 })}>Watch</Button>
        <Button style={styles.flex} mode="contained-tonal" icon="download" onPress={() => navigation.navigate('Downloads', { anime })}>Releases</Button>
      </View>
      {anime.trailerId ? <Button mode="outlined" icon="youtube" onPress={() => void Linking.openURL(`https://www.youtube.com/watch?v=${anime.trailerId}`)}>Watch trailer</Button> : null}
      <View style={styles.chips}>{anime.genres?.map((genre) => <Chip key={genre} compact onPress={() => navigation.navigate('Catalog', { title: `${genre} anime`, genre })}>{genre}</Chip>)}</View>
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.semibold}>Synopsis</Text>
        <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>{anime.description || 'No synopsis is available.'}</Text>
      </View>
      {anime.nextAiringEpisode ? <View style={[styles.airing, { backgroundColor: theme.colors.surfaceVariant }]}><Text variant="titleSmall" style={styles.semibold}>Next episode</Text><Text>Episode {anime.nextAiringEpisode.episode} · {new Date(anime.nextAiringEpisode.airingAt * 1000).toLocaleString()}</Text></View> : null}
      {anime.relations?.length ? <AnimeShelf title="Related anime" items={anime.relations} onPress={openAnime} /> : null}
      {anime.recommendations?.length ? <AnimeShelf title="You may also like" items={anime.recommendations} onPress={openAnime} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { height: 180, marginHorizontal: -tokens.spacing.lg },
  bannerImage: { opacity: 0.72 },
  bannerShade: { flex: 1, backgroundColor: 'rgba(10,8,11,0.22)' },
  summary: { flexDirection: 'row', gap: tokens.spacing.lg, marginTop: -58 },
  poster: { width: 116, height: 164, borderRadius: tokens.radius.card, backgroundColor: '#282329' },
  summaryCopy: { flex: 1, justifyContent: 'flex-end', gap: tokens.spacing.sm, paddingBottom: tokens.spacing.sm },
  actions: { flexDirection: 'row', marginLeft: -8 },
  primaryActions: { flexDirection: 'row', gap: tokens.spacing.md },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  section: { gap: tokens.spacing.sm },
  description: { lineHeight: 22 },
  airing: { borderRadius: tokens.radius.card, padding: tokens.spacing.lg, gap: 4 },
  bold: { fontWeight: '700' },
  semibold: { fontWeight: '600' },
});
