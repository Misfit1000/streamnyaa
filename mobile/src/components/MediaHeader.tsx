import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image, ImageBackground } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, useTheme } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Anime } from '../types';
import { tokens } from '../theme';

export function MediaHeader({ media, actions }: { media: Anime; actions?: ReactNode }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const posterWidth = width < 360 ? 104 : 120;
  const episodeLabel = media.mediaType === 'MANGA'
    ? [media.chapters ? `${media.chapters} chapters` : '', media.volumes ? `${media.volumes} volumes` : ''].filter(Boolean).join(' · ')
    : media.episodes ? `${media.episodes} episodes` : '';
  return (
    <View style={styles.root}>
      <ImageBackground source={media.banner || media.cover} style={styles.banner} contentFit="cover" cachePolicy="memory-disk" priority="high" accessibilityIgnoresInvertColors>
        <LinearGradient colors={['rgba(3,3,4,0.12)', 'rgba(3,3,4,0.56)', tokens.color.background]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFill} />
      </ImageBackground>
      <View style={styles.summary}>
        <Image source={media.cover} style={[styles.poster, { width: posterWidth, height: posterWidth * 1.45, backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outlineVariant }]} contentFit="cover" cachePolicy="memory-disk" recyclingKey={`${media.id}-${media.cover}`} accessibilityIgnoresInvertColors />
        <View style={styles.copy}>
          {media.metadataProvider && media.metadataProvider !== 'AniList' ? (
            <View style={styles.provider}><MaterialCommunityIcons name="database-check-outline" size={13} color={theme.colors.primary} /><Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{media.metadataProvider} backup active</Text></View>
          ) : null}
          <Text variant="headlineSmall" numberOfLines={3} style={styles.title}>{media.title}</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{[media.format?.replaceAll('_', ' '), media.year, episodeLabel].filter(Boolean).join(' · ')}</Text>
          {actions}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginHorizontal: -tokens.spacing.lg, marginTop: -tokens.spacing.xl },
  banner: { height: 242 },
  summary: { flexDirection: 'row', alignItems: 'flex-end', gap: tokens.spacing.lg, paddingHorizontal: tokens.spacing.lg, marginTop: -86 },
  poster: { borderRadius: tokens.radius.card, borderWidth: StyleSheet.hairlineWidth },
  copy: { flex: 1, gap: tokens.spacing.sm, paddingBottom: tokens.spacing.sm },
  provider: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  title: { color: '#FFFFFF', fontWeight: '700', letterSpacing: -0.35, lineHeight: 29 },
});
