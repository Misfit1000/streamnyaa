import { StyleSheet, View } from 'react-native';
import { Button, IconButton, Text, useTheme } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { TorrentSource } from '../types';
import { tokens } from '../theme';
import { sourceQualityBucket, sourceQualityLabel, sourceQualityScore } from '../../../shared/sources';

export function SourceRow({ source, onPlay, onShare }: { source: TorrentSource; onPlay: () => void; onShare: () => void }) {
  const theme = useTheme();
  const score = sourceQualityScore(source);
  const quality = sourceQualityBucket(source.title);
  const metadata = [
    quality === '2160p' ? '4K' : quality === 'other' ? null : quality,
    `${source.seeders} seeders`,
    source.size,
    sourceQualityLabel(score),
    source.trusted ? 'Trusted' : null,
  ].filter(Boolean).join(' · ');
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surfaceVariant }]}>
      <Text variant="titleSmall" numberOfLines={2} style={styles.title}>{source.title}</Text>
      <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>{metadata}</Text>
      <View style={styles.actions}>
        <Button style={styles.play} mode="contained" icon="play" onPress={onPlay}>Stream</Button>
        <IconButton icon="share-variant-outline" onPress={onShare} accessibilityLabel="Share magnet link" />
      </View>
      {source.seeders < 2 ? <View style={styles.warning}><MaterialCommunityIcons name="alert-outline" size={15} color={tokens.color.warning} /><Text variant="labelSmall" style={{ color: tokens.color.warning }}>Playback may be slow with few seeders.</Text></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: tokens.spacing.md, borderRadius: tokens.radius.card, gap: tokens.spacing.sm },
  title: { fontWeight: '600', lineHeight: 20 },
  actions: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.xs },
  play: { flex: 1 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
