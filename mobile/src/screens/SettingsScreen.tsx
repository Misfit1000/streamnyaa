import { useEffect, useState } from 'react';
import { Alert, Share, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Divider, List, RadioButton, SegmentedButtons, Snackbar, Switch, Text } from 'react-native-paper';
import { Screen } from '../components/Screen';
import { TorrentEngine } from '../native/TorrentEngine';
import { useAppStore } from '../store/useAppStore';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen(_props: Props) {
  const store = useAppStore();
  const [message, setMessage] = useState('');
  const [cacheBytes, setCacheBytes] = useState(0);
  const clearHistory = useAppStore((state) => state.clearHistory);
  const refreshCache = () => void TorrentEngine.getCacheStats()
    .then((stats) => setCacheBytes(stats.bytes))
    .catch(() => setCacheBytes(0));
  useEffect(refreshCache, []);
  return (
    <Screen title="Settings" subtitle="Android playback and app preferences">
      <List.Section title="Appearance">
        <RadioButton.Group value={store.themeMode} onValueChange={(value) => store.setThemeMode(value as typeof store.themeMode)}>
          <RadioButton.Item label="Use device theme" value="system" />
          <RadioButton.Item label="Dark" value="dark" />
          <RadioButton.Item label="Light" value="light" />
        </RadioButton.Group>
      </List.Section>
      <Divider />
      <List.Section title="Content">
        <List.Item title="Include adult titles" description="SFW mode is enabled by default" right={() => <Switch value={store.nsfwMode} onValueChange={store.setNsfwMode} />} />
      </List.Section>
      <Divider />
      <List.Section title="Playback">
        <Text variant="labelLarge" style={styles.label}>Preferred audio</Text>
        <RadioButton.Group value={store.audioPreference} onValueChange={(value) => store.setAudioPreference(value as typeof store.audioPreference)}>
          <RadioButton.Item label="Prefer subtitles" value="sub-preferred" />
          <RadioButton.Item label="Prefer dual audio" value="dual-preferred" />
          <RadioButton.Item label="Dub only" value="dub-only" />
        </RadioButton.Group>
        <List.Item title="Auto-play next episode" right={() => <Switch value={store.autoPlayNext} onValueChange={store.setAutoPlayNext} />} />
        <List.Item title="Open best source automatically" description="Starts the highest-ranked source when a watch page opens" right={() => <Switch value={store.autoOpenBestSource} onValueChange={store.setAutoOpenBestSource} />} />
        <Text variant="labelLarge" style={styles.label}>Playback speed</Text>
        <SegmentedButtons
          value={String(store.playerPreferences.playbackSpeed)}
          onValueChange={(value) => store.setPlayerPreferences({ playbackSpeed: Number(value) })}
          buttons={[
            { value: '0.75', label: '0.75×' },
            { value: '1', label: '1×' },
            { value: '1.25', label: '1.25×' },
            { value: '1.5', label: '1.5×' },
          ]}
          density="small"
        />
      </List.Section>
      <Divider />
      <List.Section title="Battery and data">
        <List.Item title="Battery saver" description="Polls torrent status less often and writes progress every 15 seconds" right={() => <Switch value={store.resourcePolicy.batterySaver} onValueChange={(batterySaver) => store.setResourcePolicy({ batterySaver })} />} />
        <List.Item title="Stream on Wi-Fi only" description="Blocks new torrent sessions on cellular data" right={() => <Switch value={store.resourcePolicy.wifiOnly} onValueChange={(wifiOnly) => store.setResourcePolicy({ wifiOnly })} />} />
        <List.Item title="Background playback" description="Continue streaming when StreamNyaa is not visible; picture-in-picture always remains supported" right={() => <Switch value={store.resourcePolicy.allowBackgroundPlayback} onValueChange={(allowBackgroundPlayback) => store.setResourcePolicy({ allowBackgroundPlayback })} />} />
        <Text variant="labelLarge" style={styles.label}>Maximum streaming cache</Text>
        <RadioButton.Group value={String(store.resourcePolicy.maxCacheMiB)} onValueChange={(value) => store.setResourcePolicy({ maxCacheMiB: Number(value) })}>
          <RadioButton.Item label="1 GB" value="1024" />
          <RadioButton.Item label="2 GB" value="2048" />
          <RadioButton.Item label="4 GB" value="4096" />
        </RadioButton.Group>
      </List.Section>
      <List.Section title="Storage and local data">
        <List.Item title="Streaming cache" description={`${(cacheBytes / 1024 / 1024).toFixed(1)} MB used · ${store.resourcePolicy.maxCacheMiB} MB limit`} left={(props) => <List.Icon {...props} icon="harddisk" />} />
        <Button mode="outlined" icon="delete-sweep-outline" onPress={() => void TorrentEngine.clearCache().then((bytes) => { setCacheBytes(0); setMessage(`Cleared ${(bytes / 1024 / 1024).toFixed(1)} MB of cached source data.`); }).catch((error) => setMessage(error.message))}>Clear streaming cache</Button>
        <Button mode="text" icon="history" onPress={() => Alert.alert('Clear watch history?', 'This removes progress from all synced clients after the next account sync.', [{ text: 'Cancel' }, { text: 'Clear', style: 'destructive', onPress: clearHistory }])}>Clear watch history</Button>
      </List.Section>
      <Text variant="bodySmall">Streaming downloads only the selected media file into private app storage. Old source caches are removed automatically when the limit is reached.</Text>
      <Button mode="text" icon="share-variant" onPress={() => void Share.share({ message: JSON.stringify({ audioPreference: store.audioPreference, autoOpenBestSource: store.autoOpenBestSource, playerPreferences: store.playerPreferences, resourcePolicy: store.resourcePolicy }, null, 2), title: 'StreamNyaa Android settings' })}>Export settings</Button>
      <Text variant="bodySmall">Native engine: {TorrentEngine.isSupported() ? 'available' : 'not loaded — use an Android development or release build'}</Text>
      <Snackbar visible={Boolean(message)} onDismiss={() => setMessage('')}>{message}</Snackbar>
    </Screen>
  );
}

const styles = StyleSheet.create({ label: { paddingHorizontal: 16, paddingTop: 8 } });
