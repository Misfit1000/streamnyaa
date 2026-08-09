import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { ImageBackground } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Button, IconButton, Text, useTheme } from 'react-native-paper';
import type { Anime } from '../types';
import { tokens } from '../theme';

type Props = {
  anime: Anime;
  episode: number;
  bookmarked: boolean;
  liked: boolean;
  sourceLoading: boolean;
  canPlay: boolean;
  onBack: () => void;
  onPlay: () => void;
  onBookmark: () => void;
  onLike: () => void;
  onTrailer?: () => void;
};

export function WatchHero({ anime, episode, bookmarked, liked, sourceLoading, canPlay, onBack, onPlay, onBookmark, onLike, onTrailer }: Props) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const heroHeight = Math.max(248, Math.min(310, height * 0.36));
  const episodeLabel = anime.episodes ? `${anime.episodes} eps` : anime.status?.replaceAll('_', ' ');
  return (
    <View style={[styles.root, { height: heroHeight }]}>
      <ImageBackground source={anime.banner || anime.cover} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" priority="high" accessibilityIgnoresInvertColors />
      <LinearGradient colors={['rgba(2,2,3,0.16)', 'rgba(2,2,3,0.28)', tokens.color.background]} locations={[0.05, 0.45, 0.94]} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(74,3,19,0.10)', 'rgba(3,3,4,0.88)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />

      <View style={styles.topBar}>
        <IconButton icon="arrow-left" mode="contained" containerColor="rgba(3,3,4,0.72)" onPress={onBack} accessibilityLabel="Go back" />
        <View style={styles.topActions}>
          <IconButton icon={bookmarked ? 'bookmark' : 'bookmark-outline'} mode="contained" containerColor={bookmarked ? theme.colors.primaryContainer : 'rgba(3,3,4,0.72)'} onPress={onBookmark} accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Bookmark'} />
          <IconButton icon={liked ? 'heart' : 'heart-outline'} mode="contained" containerColor={liked ? theme.colors.primaryContainer : 'rgba(3,3,4,0.72)'} onPress={onLike} accessibilityLabel={liked ? 'Unlike' : 'Like'} />
        </View>
      </View>

      <View style={styles.copy}>
        <Text variant="headlineSmall" numberOfLines={2} style={styles.title}>{anime.title}</Text>
        <View style={styles.metadata}>
          {anime.score ? <><MaterialCommunityIcons name="star" size={16} color={tokens.color.warning} /><Text variant="labelLarge" style={styles.metaText}>{anime.score.toFixed(1)}</Text></> : null}
          {[anime.year, anime.format?.replaceAll('_', ' '), episodeLabel].filter(Boolean).map((value) => <Text key={String(value)} variant="labelLarge" style={styles.metaText}>· {value}</Text>)}
        </View>
        <View style={styles.actions}>
          <Button mode="contained" icon="play" loading={sourceLoading} disabled={!canPlay || sourceLoading} onPress={onPlay} contentStyle={styles.primaryContent}>{sourceLoading ? 'Preparing episode' : `Play episode ${episode}`}</Button>
          {onTrailer ? <IconButton icon="youtube" mode="contained-tonal" onPress={onTrailer} accessibilityLabel="Open trailer" /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginHorizontal: -tokens.spacing.lg, overflow: 'hidden', justifyContent: 'space-between', backgroundColor: tokens.color.surface },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: tokens.spacing.sm, paddingTop: tokens.spacing.sm },
  topActions: { flexDirection: 'row' },
  copy: { paddingHorizontal: tokens.spacing.lg, paddingBottom: tokens.spacing.md, gap: 6, maxWidth: 580 },
  title: { color: '#FFFFFF', fontWeight: '700', letterSpacing: -0.35, lineHeight: 27 },
  metadata: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  metaText: { color: '#E9E1E4' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm, marginTop: tokens.spacing.xs },
  primaryContent: { minHeight: 48 },
});
