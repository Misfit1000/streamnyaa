import { useEffect, useMemo, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useEventListener } from 'expo';
import { useQuery } from '@tanstack/react-query';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Chip, ProgressBar, Text, useTheme } from 'react-native-paper';
import { Screen } from '../components/Screen';
import { SourceRow } from '../components/SourceRow';
import { StateView } from '../components/StateView';
import { TorrentEngine } from '../native/TorrentEngine';
import { searchSources, sourceQuery } from '../services/sources';
import { useAppStore } from '../store/useAppStore';
import type { RootStackParamList, TorrentSource, TorrentStreamStatus } from '../types';
import { tokens } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Watch'>;
const idleStatus: TorrentStreamStatus = { state: 'idle', message: 'Choose a source to begin.', progress: 0, bufferedPercent: 0, peers: 0, downloadRate: 0 };

export function WatchScreen({ route }: Props) {
  const theme = useTheme();
  const anime = route.params.anime;
  const [episode, setEpisode] = useState(route.params.episode || 1);
  const [selected, setSelected] = useState<TorrentSource | undefined>(route.params.source);
  const [pendingAutoNext, setPendingAutoNext] = useState(false);
  const [status, setStatus] = useState<TorrentStreamStatus>(idleStatus);
  const audio = useAppStore((state) => state.audioPreference);
  const autoOpen = useAppStore((state) => state.autoOpenBestSource);
  const autoNext = useAppStore((state) => state.autoPlayNext);
  const saveProgress = useAppStore((state) => state.saveProgress);
  const queryText = useMemo(() => sourceQuery(anime.title, episode, audio), [anime.title, audio, episode]);
  const sources = useQuery({ queryKey: ['watch-sources', queryText], queryFn: () => searchSources(queryText) });
  const player = useVideoPlayer(null, (instance) => { instance.timeUpdateEventInterval = 1; });

  const start = async (source: TorrentSource) => {
    setSelected(source);
    setStatus({ ...idleStatus, state: 'metadata', message: 'Connecting to peers and loading metadata…' });
    const next = await TorrentEngine.startStream(source.magnet);
    setStatus(next);
  };

  useEffect(() => {
    const subscription = TorrentEngine.addStatusListener(setStatus);
    return () => { subscription?.remove(); void TorrentEngine.stop(false); };
  }, []);

  useEffect(() => {
    if (route.params.source) void start(route.params.source);
  }, [route.params.source]);

  useEffect(() => {
    if (!selected && (autoOpen || pendingAutoNext) && sources.data?.[0]) {
      setPendingAutoNext(false);
      void start(sources.data[0]);
    }
  }, [autoOpen, pendingAutoNext, selected, sources.data]);

  useEffect(() => {
    if (!status.streamUrl) return;
    void player.replaceAsync({ uri: status.streamUrl, contentType: 'progressive' }).then(() => player.play());
  }, [player, status.streamUrl]);

  useEffect(() => {
    if (!selected) return;
    const timer = setInterval(() => {
      const duration = Number(player.duration || 0);
      const position = Number(player.currentTime || 0);
      if (position <= 0) return;
      saveProgress({
        key: `${anime.id}::${episode}`,
        animeId: String(anime.id), animeTitle: anime.title, episode,
        sourceTitle: selected.title, magnet: selected.magnet, image: anime.cover,
        progressPercent: duration ? Math.min(100, (position / duration) * 100) : 0,
        resumeSeconds: position, durationSeconds: duration, updatedAt: new Date().toISOString(),
      });
    }, 10000);
    return () => clearInterval(timer);
  }, [anime, episode, player, saveProgress, selected]);

  useEventListener(player, 'playToEnd', () => {
    if (!autoNext) return;
    void TorrentEngine.stop(false);
    setSelected(undefined);
    setStatus(idleStatus);
    setPendingAutoNext(true);
    setEpisode((value) => value + 1);
  });

  const nextEpisode = () => {
    player.pause();
    void TorrentEngine.stop(false);
    setPendingAutoNext(false); setSelected(undefined); setStatus(idleStatus); setEpisode((value) => value + 1);
  };

  return (
    <Screen title={anime.title} subtitle={`Episode ${episode}`}>
      <View style={[styles.player, { backgroundColor: '#070607' }]}>
        {status.streamUrl ? <VideoView style={StyleSheet.absoluteFill} player={player} nativeControls contentFit="contain" allowsPictureInPicture /> : <StateView loading={['metadata', 'buffering'].includes(status.state)} title={status.state === 'error' ? 'Playback could not start' : 'Ready for a source'} message={status.error || status.message} />}
      </View>
      {selected ? (
        <View style={[styles.streamStatus, { backgroundColor: theme.colors.surfaceVariant }]}>
          <View style={styles.statusTitle}><Text variant="titleSmall" style={styles.semibold} numberOfLines={1}>{status.fileName || selected.title}</Text><Chip compact>{status.peers} peers</Chip></View>
          <ProgressBar progress={Math.max(status.bufferedPercent, status.progress) / 100} />
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{status.message} · {(status.downloadRate / 1024 / 1024).toFixed(1)} MB/s</Text>
        </View>
      ) : null}
      <View style={styles.episodeControls}>
        <Button mode="outlined" disabled={episode <= 1} onPress={() => { setEpisode((value) => Math.max(1, value - 1)); setSelected(undefined); void TorrentEngine.stop(false); }}>Previous</Button>
        <Text variant="titleMedium" style={styles.semibold}>Episode {episode}</Text>
        <Button mode="outlined" onPress={nextEpisode}>Next</Button>
      </View>
      {autoNext ? <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>The next ranked source will open when this episode ends.</Text> : null}
      <Text variant="titleMedium" style={styles.semibold}>Available sources</Text>
      {sources.isLoading ? <StateView loading message="Finding the best matching releases…" /> : sources.isError ? <StateView title="Source search failed" message={sources.error.message} onRetry={() => void sources.refetch()} /> : sources.data?.length ? sources.data.slice(0, 8).map((source) => <SourceRow key={`${source.infoHash}-${source.title}`} source={source} onPlay={() => void start(source)} onShare={() => void Share.share({ message: source.magnet })} />) : <StateView title="No source found" message="Try Source Search with a broader title or another episode." />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  player: { aspectRatio: 16 / 9, borderRadius: tokens.radius.card, overflow: 'hidden' },
  streamStatus: { padding: tokens.spacing.md, borderRadius: tokens.radius.card, gap: tokens.spacing.sm },
  statusTitle: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  episodeControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  semibold: { fontWeight: '600', flexShrink: 1 },
});
