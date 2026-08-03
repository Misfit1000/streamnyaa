import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Chip, Text, useTheme } from 'react-native-paper';
import { AnimeShelf } from '../components/AnimeShelf';
import { MediaHeader } from '../components/MediaHeader';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { fetchMangaDetails } from '../services/anilist';
import { mangaRouteParams, watchRouteParams } from '../lib/mediaNavigation';
import type { Anime, RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Manga'>;

export function MangaScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const query = useQuery({
    queryKey: ['manga', route.params.mangaId, route.params.anilistId, route.params.malId, route.params.kitsuId],
    queryFn: ({ signal }) => fetchMangaDetails(route.params.mangaId, { anilistId: route.params.anilistId, malId: route.params.malId, kitsuId: route.params.kitsuId, title: route.params.title }, signal),
    staleTime: 30 * 60 * 1000,
  });
  if (query.isLoading) return <Screen safeTop={false}><StateView loading message={`Loading ${route.params.title || 'manga'}…`} /></Screen>;
  if (query.isError || !query.data) return <Screen safeTop={false}><StateView title="Title details unavailable" message={query.error?.message} onRetry={() => void query.refetch()} /></Screen>;
  const manga = query.data;
  const openMedia = (item: Anime) => item.mediaType === 'MANGA' ? navigation.push('Manga', mangaRouteParams(item)) : navigation.push('Watch', watchRouteParams(item));

  return (
    <Screen safeTop={false}>
      <MediaHeader media={manga} />
      {manga.genres?.length ? <View style={styles.chips}>{manga.genres.map((genre) => <Chip key={genre} compact mode="outlined">{genre}</Chip>)}</View> : null}
      <View style={styles.section}>
        <Text variant="titleLarge" style={styles.semibold}>Synopsis</Text>
        <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>{manga.description || 'No synopsis is available for this title.'}</Text>
      </View>
      {manga.relations?.length ? <AnimeShelf title="Related titles" items={manga.relations} onPress={openMedia} /> : null}
      {manga.recommendations?.length ? <AnimeShelf title="You may also like" items={manga.recommendations} onPress={openMedia} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  section: { gap: tokens.spacing.sm },
  description: { lineHeight: 23 },
  semibold: { fontWeight: '600' },
});
