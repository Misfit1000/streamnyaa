import { useState } from 'react';
import { StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Divider, List, RadioButton, Snackbar, Switch, Text } from 'react-native-paper';
import { Screen } from '../components/Screen';
import { TorrentEngine } from '../native/TorrentEngine';
import { useAppStore } from '../store/useAppStore';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen(_props: Props) {
  const store = useAppStore();
  const [message, setMessage] = useState('');
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
      </List.Section>
      <Button mode="outlined" icon="delete-sweep-outline" onPress={() => void TorrentEngine.clearCache().then((bytes) => setMessage(`Cleared ${(bytes / 1024 / 1024).toFixed(1)} MB of cached source data.`)).catch((error) => setMessage(error.message))}>Clear streaming cache</Button>
      <Text variant="bodySmall">Streaming downloads only the selected media file into the app cache. Cache is private to StreamNyaa and can be removed here.</Text>
      <Snackbar visible={Boolean(message)} onDismiss={() => setMessage('')}>{message}</Snackbar>
    </Screen>
  );
}

const styles = StyleSheet.create({ label: { paddingHorizontal: 16, paddingTop: 8 } });
