import { StyleSheet, View } from 'react-native';
import { Image, ImageBackground } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Chip, Text, useTheme } from 'react-native-paper';
import { AnimeShelf } from '../components/AnimeShelf';
import { Screen } from '../components/Screen';
import { StateView } from '../components/StateView';
import { fetchMangaDetails } from '../services/anilist';
import type { Anime, RootStackParamList } from '../types';
import { tokens } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Manga'>;

export function MangaScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const query = useQuery({ queryKey: ['manga', route.params.mangaId], queryFn: () => fetchMangaDetails(route.params.mangaId) });
  if (query.isLoading) return <Screen><StateView loading message={`Loading ${route.params.title || 'manga'}…`} /></Screen>;
  if (query.isError || !query.data) return <Screen><StateView title="Manga unavailable" message={query.error?.message} onRetry={() => void query.refetch()} /></Screen>;
  const manga = query.data;
  const openMedia = (item: Anime) => item.mediaType === 'MANGA'
    ? navigation.push('Manga', { mangaId: item.id, title: item.title })
    : navigation.push('Anime', { animeId: item.id, title: item.title });

  return (
    <Screen>
      <ImageBackground source={manga.banner || manga.cover} style={styles.banner} imageStyle={styles.bannerImage} contentFit="cover"><View style={styles.shade} /></ImageBackground>
      <View style={styles.summary}>
        <Image source={manga.cover} style={styles.poster} contentFit="cover" />
        <View style={styles.copy}>
          <Text variant="headlineSmall" style={styles.bold}>{manga.title}</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>{[manga.format, manga.year, manga.chapters ? `${manga.chapters} chapters` : '', manga.volumes ? `${manga.volumes} volumes` : ''].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>
      <View style={styles.chips}>{manga.genres?.map((genre) => <Chip key={genre} compact>{genre}</Chip>)}</View>
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.semibold}>Synopsis</Text>
        <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>{manga.description || 'No synopsis is available.'}</Text>
      </View>
      {manga.relations?.length ? <AnimeShelf title="Related titles" items={manga.relations} onPress={openMedia} /> : null}
      {manga.recommendations?.length ? <AnimeShelf title="You may also like" items={manga.recommendations} onPress={openMedia} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { height: 180, marginHorizontal: -tokens.spacing.lg },
  bannerImage: { opacity: 0.72 },
  shade: { flex: 1, backgroundColor: 'rgba(10,8,11,0.22)' },
  summary: { flexDirection: 'row', gap: tokens.spacing.lg, marginTop: -58 },
  poster: { width: 116, height: 164, borderRadius: tokens.radius.card, backgroundColor: '#282329' },
  copy: { flex: 1, justifyContent: 'flex-end', gap: tokens.spacing.sm, paddingBottom: tokens.spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  section: { gap: tokens.spacing.sm },
  description: { lineHeight: 22 },
  bold: { fontWeight: '700' },
  semibold: { fontWeight: '600' },
});
