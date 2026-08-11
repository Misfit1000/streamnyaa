import { Pressable, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { IconButton, ProgressBar, Text, useTheme } from 'react-native-paper';
import { usePlayback } from '../context/PlaybackContext';
import { tokens } from '../theme';
import type { Anime } from '../types';

export function MiniPlayer({ onExpand }: { onExpand: (anime: Anime, episode: number) => void }) {
  const theme = useTheme();
  const playback = usePlayback();
  if (!playback.anime || playback.presentation !== 'mini') return null;
  const progress = playback.duration ? Math.min(1, playback.currentTime / playback.duration) : 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant }]}>
      <Pressable style={styles.main} onPress={() => { playback.expand(); onExpand(playback.anime!, playback.episode); }} accessibilityRole="button" accessibilityLabel={`Open ${playback.anime.title}, episode ${playback.episode}`}>
        <View style={styles.video}>
          {playback.anime.cover
            ? <Image source={playback.anime.cover} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" accessibilityIgnoresInvertColors />
            : <View style={styles.placeholder}><MaterialCommunityIcons name="movie-open-play-outline" size={25} color="#FFFFFF" /></View>}
          <View style={styles.posterShade} />
          <MaterialCommunityIcons name={playback.playing ? 'waveform' : 'pause'} size={22} color="#FFFFFF" style={styles.posterState} />
        </View>
        <View style={styles.copy}>
          <Text variant="labelLarge" numberOfLines={1} style={styles.title}>{playback.anime.title}</Text>
          <Text variant="labelSmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>Episode {playback.episode} · {playback.phase === 'recovering' ? 'Trying another release' : playback.status.message}</Text>
        </View>
      </Pressable>
      <IconButton icon={playback.playing ? 'pause' : 'play'} size={25} onPress={playback.playing ? playback.pause : playback.play} accessibilityLabel={playback.playing ? 'Pause' : 'Play'} />
      <IconButton icon="close" size={24} onPress={() => void playback.close()} accessibilityLabel="Close player" />
      <ProgressBar progress={progress} color={tokens.color.brandBright} style={styles.progress} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: 70, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  main: { flex: 1, minHeight: 68, flexDirection: 'row', alignItems: 'center' },
  video: { width: 112, height: 64, marginLeft: 4, overflow: 'hidden', backgroundColor: '#000000', borderRadius: tokens.radius.control },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.color.surfaceRaised },
  posterShade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.28)' },
  posterState: { alignSelf: 'center', marginTop: 20 },
  copy: { flex: 1, minWidth: 0, gap: 3, paddingHorizontal: 12 },
  title: { fontWeight: '600' },
  progress: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 },
});
