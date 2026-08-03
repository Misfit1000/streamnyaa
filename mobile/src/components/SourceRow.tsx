import { StyleSheet, View } from 'react-native';
import { Button, Chip, Text, useTheme } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { TorrentSource } from '../types';
import { tokens } from '../theme';
import { sourceQualityBucket, sourceQualityLabel, sourceQualityScore } from '../../../shared/sources';

export function SourceRow({ source, onPlay, onShare }: { source: TorrentSource; onPlay: () => void; onShare: () => void }) {
  const theme = useTheme();
  const score = sourceQualityScore(source);
  const quality = sourceQualityBucket(source.title);
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surfaceVariant }]}>
      <Text variant="titleSmall" numberOfLines={2} style={styles.title}>{source.title}</Text>
      <View style={styles.meta}>
        <Chip compact icon="signal">{sourceQualityLabel(score)} {score}</Chip>
        {quality !== 'other' ? <Chip compact>{quality === '2160p' ? '4K' : quality}</Chip> : null}
        <Chip compact icon="account-multiple">{source.seeders} seeders</Chip>
        {source.size ? <Chip compact icon="harddisk">{source.size}</Chip> : null}
        {source.trusted ? <Chip compact icon="check-decagram">Trusted</Chip> : null}
        {source.remake ? <Chip compact icon="alert-circle-outline">Remake</Chip> : null}
      </View>
      <View style={styles.actions}>
        <Button style={styles.play} mode="contained" icon="play" onPress={onPlay}>Stream</Button>
        <Button mode="text" icon="share-variant" onPress={onShare}>Share magnet</Button>
      </View>
      {source.seeders < 2 ? <View style={styles.warning}><MaterialCommunityIcons name="alert-outline" size={15} color={tokens.color.warning} /><Text variant="labelSmall" style={{ color: tokens.color.warning }}>Playback may be slow with few seeders.</Text></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: tokens.spacing.md, borderRadius: tokens.radius.card, gap: tokens.spacing.sm },
  title: { fontWeight: '600', lineHeight: 20 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  play: { flex: 1 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
